/**
 * 챌린지 페이지 (/c/:id).
 * 원본은 유튜브 임베드로 재생하고, 채점은 미리 뽑아둔 포즈 JSON으로 한다. 원본 영상 파일은 사이트에 없음.
 * 유튜브가 없는 챌린지(샘플)는 원본 스켈레톤 + 메트로놈 가이드로 재생.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { tick, unlockAudio } from '../audio/sfx';
import { MediaClock } from '../challenge/clock';
import { fetchChallenge, parseYouTubeId, toChallenge, validateChallengeFile, type Challenge } from '../challenge/format';
import { createYouTubePlayer, YT_STATE, type YouTubeHandle } from '../challenge/youtube';
import { challengeLink } from '../config/brand';
import { createPoseDetector, type PoseDetector } from '../pose/landmarker';
import { beatDuration, countAt } from '../pose/segments';
import { nearestFrame } from '../pose/sequence';
import type { SegmentResult } from '../pose/types';
import { startRecording, type Recording } from '../lib/recorder';
import type { ScoreSession } from '../lib/session';
import { LiveScorer } from '../live/liveScorer';
import { cameraErrorMessage, CountDots, drawPoseOverlay, openWebcam, PopupStack, usePopups } from '../live/ui';
import { ResultScreen } from './ResultScreen';

export const PREVIEW_STORAGE_KEY = 'ds.challenge-preview';

type Phase = 'loading' | 'ready' | 'playing' | 'finishing' | 'result' | 'error';

/** 유튜브 또는 스켈레톤 가이드 — 원본 기준 시간을 알려주는 재생기 */
interface Guide {
  /** 원본 기준 시간 from부터 재생 */
  play(from: number): void;
  pause(): void;
  /** 플레이어가 보고하는 원본 기준 시간 (유튜브는 띄엄띄엄 갱신) */
  report(): { t: number; playing: boolean; ended: boolean };
  destroy(): void;
}

function youtubeGuide(yt: YouTubeHandle, ytOffset: number): Guide {
  return {
    play(from) {
      yt.seek(from + ytOffset);
      yt.play();
    },
    pause: () => yt.pause(),
    report() {
      const s = yt.state();
      return { t: yt.time() - ytOffset, playing: s === YT_STATE.PLAYING, ended: s === YT_STATE.ENDED };
    },
    destroy: () => yt.destroy(),
  };
}

function skeletonGuide(duration: number): Guide {
  let start = 0;
  let from = 0;
  let playing = false;
  let pausedAt = 0;
  const now = () => (playing ? from + (performance.now() - start) / 1000 : pausedAt);
  return {
    play(f) {
      from = f;
      start = performance.now();
      playing = true;
    },
    pause() {
      pausedAt = now();
      playing = false;
    },
    report() {
      const t = now();
      return { t, playing: playing && t < duration, ended: t >= duration };
    },
    destroy() {
      playing = false;
    },
  };
}

function readSyncMs(): number {
  try {
    return Number(localStorage.getItem('ds.syncMs') ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** 관리자 페이지 "바로 테스트"에서 넘겨준 챌린지 */
function loadPreview(id: string): Challenge | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    const v = validateChallengeFile(JSON.parse(raw));
    return v.ok && v.file.id === id ? toChallenge(v.file) : null;
  } catch {
    return null;
  }
}

export function ChallengePage({ id, debug }: { id: string; debug: boolean }) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [leadIn, setLeadIn] = useState(0);
  const [count, setCount] = useState<{ segment: number; count: number } | null>(null);
  const [results, setResults] = useState<SegmentResult[]>([]);
  const [session, setSession] = useState<ScoreSession | null>(null);
  const [syncMs, setSyncMs] = useState(readSyncMs);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [copied, setCopied] = useState(false);
  const { popups, show } = usePopups();

  const ytBox = useRef<HTMLDivElement>(null);
  const guideCanvas = useRef<HTMLCanvasElement>(null);
  const camVideo = useRef<HTMLVideoElement>(null);
  const camCanvas = useRef<HTMLCanvasElement>(null);
  const guide = useRef<Guide | null>(null);
  const detector = useRef<PoseDetector | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<Recording | null>(null);
  const recWall = useRef(0);
  const userOffset = useRef<number | null>(null);
  const scorer = useRef<LiveScorer | null>(null);
  const clock = useRef(new MediaClock());
  const syncRef = useRef(syncMs);
  syncRef.current = syncMs;
  const skRef = useRef(showSkeleton);
  skRef.current = showSkeleton;

  const params = new URLSearchParams(location.search);
  const ytOverride = params.get('yt');
  const ytOffsetOverride = params.get('ytOffset');

  // 챌린지 JSON + 포즈 모델 + 웹캠 + 유튜브 준비
  useEffect(() => {
    let cancelled = false;
    let made: Guide | null = null;
    void (async () => {
      try {
        const c = (params.has('preview') && loadPreview(id)) || (await fetchChallenge(id));
        // ?yt=영상ID 로 유튜브 영상 바꿔 끼우기 (샘플로 유튜브 싱크 테스트용)
        if (ytOverride) c.youtubeId = parseYouTubeId(ytOverride) ?? c.youtubeId;
        if (ytOffsetOverride) c.youtubeOffset = Number(ytOffsetOverride) || 0;
        if (cancelled) return;
        setChallenge(c);
        document.title = `${c.title} 챌린지 · dance-score`;
        const [det, media] = await Promise.all([createPoseDetector('full'), openWebcam()]);
        if (cancelled) {
          det.close();
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        detector.current = det;
        stream.current = media;
        const v = camVideo.current!;
        v.srcObject = media;
        await v.play();
        if (c.youtubeId) {
          const yt = await createYouTubePlayer(ytBox.current!, c.youtubeId, {
            onError: (msg) => {
              setError(msg);
              setPhase('error');
            },
          });
          made = youtubeGuide(yt, c.youtubeOffset);
        } else {
          made = skeletonGuide(c.duration);
        }
        if (cancelled) {
          made.destroy();
          return;
        }
        guide.current = made;
        setPhase('ready');
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        const err = e as Error;
        setError(err.name?.startsWith('Not') ? cameraErrorMessage(e) : err.message);
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      made?.destroy();
      guide.current = null;
      detector.current?.close();
      detector.current = null;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 시작 전: 웹캠 스켈레톤 미리보기
  useEffect(() => {
    if (phase !== 'ready') return;
    let raf = 0;
    // 스켈레톤 가이드 모드면 시작 자세를 미리 보여줌
    const c = challenge;
    if (c && !c.youtubeId) {
      const first = c.ref.frames.find((f) => f.pose)?.pose ?? null;
      requestAnimationFrame(() => drawPoseOverlay(guideCanvas.current, c.ref.aspect * 1000, 1000, first, '#3ddcff'));
    }
    const loop = () => {
      const v = camVideo.current;
      if (detector.current && v && v.readyState >= 2) {
        const pose = detector.current.detect(v);
        drawPoseOverlay(camCanvas.current, v.videoWidth, v.videoHeight, skRef.current ? pose : null, '#ff3d81');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, challenge]);

  function start() {
    const c = challenge;
    const g = guide.current;
    const v = camVideo.current;
    if (!c || !g || !v) return;
    unlockAudio();
    scorer.current = new LiveScorer({
      bpm: c.bpm,
      offset: c.offset,
      duration: c.duration,
      refAspect: c.ref.aspect,
      userAspect: v.videoWidth / Math.max(1, v.videoHeight),
      refFrames: c.ref.frames,
    });
    setResults([]);
    clock.current = new MediaClock();
    userOffset.current = null;
    // 웹캠 녹화 (결과 화면 다시 보기용)
    recorder.current = null;
    if (stream.current && typeof MediaRecorder !== 'undefined') {
      try {
        recorder.current = startRecording(stream.current, 4_000_000);
      } catch (e) {
        console.warn('웹캠 녹화 실패', e);
      }
    }
    recWall.current = performance.now();
    // 사용자 클릭 안에서 바로 재생해야 모바일 자동재생 제한에 안 걸린다.
    // 카운트다운은 첫 카운트 전 전주(인트로) 동안 박자에 맞춰 보여준다.
    g.play(0);
    finishing.current = false;
    setPhase('playing');
  }

  // 메인 루프: 유튜브 시간 ↔ 웹캠 싱크 + 채점
  useEffect(() => {
    if (phase !== 'playing' || !challenge) return;
    const c = challenge;
    const beat = beatDuration(c.bpm);
    let raf = 0;
    let lastBeat = -1;
    const loop = () => {
      const g = guide.current;
      const s = scorer.current;
      const v = camVideo.current;
      if (!g || !s || !v) return;
      const now = performance.now();
      const rep = g.report();
      clock.current.sync(rep.t, rep.playing, now);
      const refT = clock.current.time(now);
      // 웹캠 프레임은 화면보다 조금 늦게 들어오므로 보정값만큼 과거 시간으로 기록
      const userT = refT - syncRef.current / 1000;

      if (rep.playing) {
        if (userOffset.current === null) userOffset.current = (now - recWall.current) / 1000 - refT;
        const pose = detector.current?.detect(v) ?? null;
        s.addUser(userT, pose);
        drawPoseOverlay(camCanvas.current, v.videoWidth, v.videoHeight, skRef.current ? pose : null, '#ff3d81');
      }

      // 스켈레톤 가이드 모드: 원본 포즈 그리기 + 메트로놈
      if (!c.youtubeId) {
        const f = nearestFrame(c.ref.frames, refT, 1 / c.ref.fps);
        drawPoseOverlay(guideCanvas.current, c.ref.aspect * 1000, 1000, f?.pose ?? null, '#3ddcff');
        const b = Math.floor((refT - c.offset) / beat);
        if (rep.playing && b !== lastBeat && refT >= c.offset - 4 * beat) {
          tick(((b % 8) + 8) % 8 === 0 ? 0.9 : 0.25);
          lastBeat = b;
        }
      }

      // 첫 카운트 전 박자 카운트다운
      const untilFirst = c.offset - refT;
      setLeadIn(untilFirst > 0 && untilFirst <= 4 * beat ? Math.ceil(untilFirst / beat) : 0);
      setCount(countAt(refT, c.bpm, c.offset));

      for (const sr of s.poll(userT)) {
        show(sr, s.combo);
        setResults((rs) => [...rs, sr]);
      }
      if (rep.ended || refT >= c.duration) {
        void finish(Math.min(refT, c.duration));
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, challenge]);

  const finishing = useRef(false);
  const finish = useCallback(
    async (endT?: number) => {
      const s = scorer.current;
      const c = challenge;
      if (finishing.current || !s || !c) return;
      finishing.current = true;
      setPhase('finishing');
      guide.current?.pause();
      const end = endT ?? clock.current.time(performance.now()) - syncRef.current / 1000;
      s.flush(end);
      const { result, ref, user } = s.finalize(end);
      let userUrl: string | undefined;
      if (recorder.current) {
        const blob = await recorder.current.stop();
        if (blob.size > 0) userUrl = URL.createObjectURL(blob);
      }
      setSession({
        result,
        ref,
        user,
        userUrl,
        userOffset: userOffset.current ?? 0,
        mirror: false,
        liveRecording: true,
        source: 'challenge',
        challenge: { id: c.id, title: c.title },
      });
      setPhase('result');
      window.scrollTo({ top: 0 });
    },
    [challenge],
  );

  // 결과 화면을 나가면 녹화본 URL 정리
  useEffect(() => {
    const u = session?.userUrl;
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [session]);

  async function share() {
    if (!challenge) return;
    const url = challengeLink(challenge.id);
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ title: `${challenge.title} 챌린지`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('챌린지 링크', url);
    }
  }

  if (phase === 'result' && session) {
    return (
      <ResultScreen
        key={session.result.createdAt}
        session={session}
        title=""
        onTitleChange={() => undefined}
        onBack={() => {
          setSession(null);
          setPhase('ready');
        }}
        backLabel="다시 도전"
        debug={debug}
      />
    );
  }

  const latest = results[results.length - 1];

  return (
    <div className="screen challenge">
      <section className="panel challenge-head">
        <div className="challenge-tag">CHALLENGE</div>
        <h2>{challenge ? `${challenge.title} 챌린지` : '챌린지 불러오는 중…'}</h2>
        {challenge && (
          <p className="hint">
            {challenge.artist ? `${challenge.artist} · ` : ''}
            {challenge.bpm} BPM · {Math.round(challenge.duration)}초
            {challenge.description ? ` · ${challenge.description}` : ''}
          </p>
        )}
      </section>

      <div className="live-stage">
        <div className="live-pane">
          {challenge?.youtubeId ? (
            <div className="yt-box">
              <div ref={ytBox} />
            </div>
          ) : (
            <canvas ref={guideCanvas} className="guide-canvas" style={{ transform: 'scaleX(-1)' }} />
          )}
          <span className="pane-label ref">{challenge?.youtubeId ? '원본' : '원본 가이드'}</span>
        </div>
        <div className="live-pane">
          <video ref={camVideo} playsInline muted style={{ transform: 'scaleX(-1)' }} />
          <canvas ref={camCanvas} style={{ transform: 'scaleX(-1)' }} />
          <span className="pane-label user">나</span>
        </div>

        {phase === 'playing' && count && <CountDots count={count.count} />}
        {phase === 'playing' && leadIn > 0 && <div className="live-countdown passive">{leadIn}</div>}
        <PopupStack popups={popups} />
        {phase === 'loading' && <div className="live-msg">챌린지, 포즈 모델, 웹캠 준비 중…</div>}
        {phase === 'finishing' && <div className="live-msg">결과 계산 중…</div>}
        {phase === 'error' && <div className="live-msg error">{error}</div>}
      </div>

      <div className="live-bar">
        {phase === 'ready' && (
          <button className="btn primary big" onClick={start}>
            💃 도전 시작
          </button>
        )}
        {phase === 'playing' && (
          <button className="btn ghost" onClick={() => void finish()}>
            ■ 여기서 끝내고 결과 보기
          </button>
        )}
        {(phase === 'ready' || phase === 'error') && challenge && (
          <button className="btn ghost" onClick={() => void share()}>
            {copied ? '✓ 복사됐어요' : '🔗 챌린지 링크 공유'}
          </button>
        )}
        <label className="chip debug">
          <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} /> 스켈레톤
        </label>
        <label className="chip debug" title="웹캠이 화면보다 늦게 들어오면 + (점수가 늘 '늦어요'로 나오면 올려보세요)">
          싱크 보정
          <input
            type="range"
            min={-300}
            max={300}
            step={10}
            value={syncMs}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSyncMs(v);
              try {
                localStorage.setItem('ds.syncMs', String(v));
              } catch {
                /* 무시 */
              }
            }}
          />
          {syncMs > 0 ? '+' : ''}
          {syncMs}ms
        </label>
        {debug && phase === 'playing' && (
          <span className="hint debug">
            채점 {results.length}/{scorer.current?.segments.length ?? '-'}
            {latest ? ` · 마지막 ${latest.score}점` : ''}
          </span>
        )}
      </div>
      {phase === 'ready' && (
        <p className="hint center-text">
          전신이 다 나오게 2~3m 떨어져서 서주세요. {challenge?.youtubeId ? '소리는 스피커로!' : '메트로놈 소리에 맞춰 추면 돼요.'}
        </p>
      )}
    </div>
  );
}
