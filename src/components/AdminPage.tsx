/**
 * 관리자 페이지 (/admin): 원본 안무 영상을 브라우저에서 로컬로 분석해서 챌린지 JSON을 만든다.
 * 영상은 어디에도 업로드되지 않는다. 결과 JSON을 public/challenges/에 넣고 배포하면 /c/<id>로 공개.
 */
import { useMemo, useRef, useState } from 'react';
import {
  buildChallengeFile,
  challengePath,
  isValidChallengeId,
  parseYouTubeId,
  slugify,
  type ChallengeFile,
} from '../challenge/format';
import { drawSkeleton, containRect } from '../pose/draw';
import { extractPoseSequence, loadVideo } from '../pose/extract';
import { createPoseDetector, type PoseModel } from '../pose/landmarker';
import { downloadBlob } from '../lib/download';
import { useObjectUrl } from '../lib/useObjectUrl';
import { PREVIEW_STORAGE_KEY } from './ChallengePage';
import { CountOverlay, TempoControls } from './TempoControls';
import { VideoPicker } from './VideoPicker';

export function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const url = useObjectUrl(file);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [mirror, setMirror] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [offset, setOffset] = useState(0);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [ytInput, setYtInput] = useState('');
  const [ytOffset, setYtOffset] = useState(0);
  const [fps, setFps] = useState(15);
  const [model, setModel] = useState<PoseModel>('full');
  const [progress, setProgress] = useState<number | null>(null);
  const [detectRate, setDetectRate] = useState(0);
  const [output, setOutput] = useState<ChallengeFile | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  const youtubeId = ytInput.trim() ? parseYouTubeId(ytInput) : null;
  const challengeId = idTouched ? id : slugify(title);
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!file) p.push('원본 영상을 골라주세요');
    if (!title.trim()) p.push('챌린지 이름을 입력해주세요');
    if (!isValidChallengeId(challengeId)) p.push('챌린지 ID는 영문 소문자/숫자/-만 (예: super-shy)');
    if (ytInput.trim() && !youtubeId) p.push('유튜브 주소에서 영상 ID를 찾지 못했어요');
    if (!(bpm > 0)) p.push('BPM을 입력해주세요');
    return p;
  }, [file, title, challengeId, ytInput, youtubeId, bpm]);

  async function analyze() {
    if (!url || problems.length) return;
    setError('');
    setOutput(null);
    setProgress(0);
    const ac = new AbortController();
    abort.current = ac;
    try {
      const v = await loadVideo(url);
      const aspect = v.videoWidth / v.videoHeight;
      const det = await createPoseDetector(model);
      let ok = 0;
      let total = 0;
      const seq = await extractPoseSequence(v, det, {
        fps,
        mirror,
        signal: ac.signal,
        onProgress: (r, f) => {
          setProgress(r);
          total++;
          if (f.pose) ok++;
          if (total % 3 === 0) {
            setDetectRate(ok / total);
            const c = preview.current;
            if (c) {
              const ctx = c.getContext('2d')!;
              ctx.fillStyle = '#14141f';
              ctx.fillRect(0, 0, c.width, c.height);
              if (f.pose) drawSkeleton(ctx, f.pose, containRect(aspect, 1, { x: 0, y: 0, w: c.width, h: c.height }), { color: '#3ddcff' });
            }
          }
        },
      });
      det.close();
      setDetectRate(total ? ok / total : 0);
      setOutput(
        buildChallengeFile(
          {
            id: challengeId,
            title: title.trim(),
            artist: artist.trim() || undefined,
            description: description.trim() || undefined,
            youtubeId,
            youtubeOffset: ytOffset,
            bpm,
            offset,
            mirror,
          },
          seq,
        ),
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  const json = useMemo(() => (output ? JSON.stringify(output) : ''), [output]);

  function download() {
    if (!output) return;
    downloadBlob(new Blob([json], { type: 'application/json' }), `${output.id}.json`);
  }

  function testNow() {
    if (!output) return;
    try {
      sessionStorage.setItem(PREVIEW_STORAGE_KEY, json);
      window.open(`${challengePath(output.id)}?preview`, '_blank');
    } catch {
      setError('파일이 너무 커서 바로 테스트할 수 없어요. JSON을 public/challenges/에 넣고 로컬 서버로 확인해주세요.');
    }
  }

  return (
    <div className="screen admin">
      <section className="panel">
        <h2>챌린지 만들기 (관리자)</h2>
        <p className="hint">
          원본 영상은 이 브라우저 안에서만 분석되고 어디에도 올라가지 않아요. 결과는 포즈 데이터 + BPM + 시작 위치 + 유튜브 ID가
          담긴 JSON 파일 하나예요.
        </p>
      </section>

      <section className="panel">
        <h2>1. 원본 안무 영상 (로컬 파일)</h2>
        <VideoPicker
          ref={setVideo}
          label="원본"
          file={file}
          url={url}
          onFile={(f) => {
            setFile(f);
            setOutput(null);
          }}
          mirror={mirror}
          onMirror={setMirror}
          overlay={<CountOverlay video={video} bpm={bpm} offset={offset} />}
        />
      </section>

      <section className="panel">
        <h2>2. 박자</h2>
        <TempoControls bpm={bpm} offset={offset} onBpm={setBpm} onOffset={setOffset} refFile={file} refVideo={video} />
      </section>

      <section className="panel">
        <h2>3. 챌린지 정보</h2>
        <div className="form-grid">
          <label className="field">
            <span>챌린지 이름 *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: Super Shy" />
          </label>
          <label className="field">
            <span>챌린지 ID (주소) *</span>
            <input
              value={challengeId}
              onChange={(e) => {
                setIdTouched(true);
                setId(e.target.value.toLowerCase());
              }}
              placeholder="super-shy"
            />
            <small className="hint">주소: {challengePath(challengeId || '…')}</small>
          </label>
          <label className="field">
            <span>아티스트</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="예: NewJeans" />
          </label>
          <label className="field">
            <span>설명</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 후렴 32카운트" />
          </label>
          <label className="field">
            <span>유튜브 주소 또는 영상 ID</span>
            <input value={ytInput} onChange={(e) => setYtInput(e.target.value)} placeholder="https://youtu.be/…" />
            <small className="hint">
              {youtubeId ? `영상 ID: ${youtubeId}` : ytInput.trim() ? '영상 ID를 찾지 못했어요' : '비우면 스켈레톤 가이드로 재생'}
            </small>
          </label>
          <label className="field">
            <span>유튜브 오프셋 (초)</span>
            <input type="number" step={0.01} value={ytOffset} onChange={(e) => setYtOffset(Number(e.target.value))} />
            <small className="hint">유튜브 영상이 이 파일보다 인트로가 길면 + (유튜브 시간 = 파일 시간 + 오프셋)</small>
          </label>
        </div>
        {youtubeId && (
          <div className="yt-preview">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?start=${Math.max(0, Math.floor(offset + ytOffset))}`}
              title="유튜브 미리보기"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <p className="hint">
              유튜브 {Math.max(0, offset + ytOffset).toFixed(2)}초에서 안무의 "1"이 시작해야 해요. 맞는지 확인해보세요.
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>4. 분석 & 내보내기</h2>
        <div className="tempo-row">
          <label className="field small">
            <span>포즈 모델</span>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value as PoseModel)}>
              <option value="lite">lite (빠름)</option>
              <option value="full">full (기본)</option>
              <option value="heavy">heavy (정확, 느림)</option>
            </select>
          </label>
          <label className="field small">
            <span>fps</span>
            <select className="select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
              <option value={10}>10 (파일 작음)</option>
              <option value={15}>15 (기본)</option>
              <option value={24}>24</option>
              <option value={30}>30 (파일 큼)</option>
            </select>
          </label>
        </div>
        {problems.length > 0 && (
          <ul className="problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          {progress === null ? (
            <button className="btn primary big" disabled={problems.length > 0} onClick={() => void analyze()}>
              🔍 포즈 추출
            </button>
          ) : (
            <button className="btn ghost" onClick={() => abort.current?.abort()}>
              취소
            </button>
          )}
        </div>
        {progress !== null && (
          <>
            <div className="big-progress">
              <div className="big-progress-fill" style={{ width: `${progress * 100}%` }} />
              <span>{Math.floor(progress * 100)}%</span>
            </div>
            <canvas ref={preview} width={180} height={320} className="admin-preview" />
          </>
        )}
        {error && <p className="error">{error}</p>}
        {output && (
          <div className="admin-output">
            <p>
              ✅ <b>{output.title}</b> · {output.poses.data.length}프레임 · 포즈 인식률 {Math.round(detectRate * 100)}% ·{' '}
              {(json.length / 1024 / 1024).toFixed(2)}MB
            </p>
            {detectRate < 0.8 && <p className="error">포즈 인식률이 낮아요. 전신이 나오는 영상인지 확인해주세요.</p>}
            <div className="row">
              <button className="btn primary" onClick={download}>
                ⬇ {output.id}.json 다운로드
              </button>
              <button className="btn ghost" onClick={testNow}>
                ▶ 바로 테스트해보기
              </button>
            </div>
            <ol className="steps">
              <li>
                다운로드한 파일을 <code>public/challenges/{output.id}.json</code> 에 넣기
              </li>
              <li>커밋하고 main에 푸시 → Vercel 자동 배포</li>
              <li>
                <code>{challengePath(output.id)}</code> 링크 공유
              </li>
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
