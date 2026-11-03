/**
 * 라이브 모드: 원본 재생 + 웹캠. 8카운트가 끝날 때마다 실시간으로 등급 팝업.
 */
import { useEffect, useRef, useState } from 'react';
import { countdownBeep, popup } from '../audio/sfx';
import { drawSkeleton, type Rect } from '../pose/draw';
import { GRADE_COLORS } from '../pose/grading';
import { createPoseDetector, type PoseDetector } from '../pose/landmarker';
import { mirrorPose } from '../pose/landmarks';
import { analyzeSequences } from '../pose/scoring';
import { beatDuration, countAt, splitEightCounts } from '../pose/segments';
import { resampleFrames } from '../pose/sequence';
import type { Grade, PoseFrame, Segment, SegmentResult } from '../pose/types';
import { startRecording, type Recording } from '../lib/recorder';
import type { SetupState } from '../lib/setup';
import type { ScoreSession } from '../lib/session';

interface Props {
  setup: SetupState;
  refUrl: string;
  onDone: (s: ScoreSession) => void;
  onCancel: () => void;
  debug: boolean;
}

const LIVE_FPS = 15;

type Phase = 'loading' | 'ready' | 'countdown' | 'playing' | 'finishing' | 'error';

interface Popup {
  id: number;
  grade: Grade;
  score: number;
  combo: number;
  comment: string;
}

function overlay(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, pose: PoseFrame['pose'], color: string) {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  if (!pose || !video.videoWidth) return;
  // <video>는 object-fit: contain
  const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
  const rect: Rect = {
    w: video.videoWidth * scale,
    h: video.videoHeight * scale,
    x: (w - video.videoWidth * scale) / 2,
    y: (h - video.videoHeight * scale) / 2,
  };
  drawSkeleton(ctx, pose, rect, { color });
}

export function LiveScreen({ setup, refUrl, onDone, onCancel, debug }: Props) {
  const refVideo = useRef<HTMLVideoElement>(null);
  const camVideo = useRef<HTMLVideoElement>(null);
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const camCanvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [count, setCount] = useState<{ segment: number; count: number } | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [results, setResults] = useState<SegmentResult[]>([]);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [fpsInfo, setFpsInfo] = useState(0);

  const detectors = useRef<{ ref: PoseDetector; cam: PoseDetector } | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<Recording | null>(null);
  const recStartRefTime = useRef(0);
  const refFrames = useRef<PoseFrame[]>([]);
  const userFrames = useRef<PoseFrame[]>([]);
  const segments = useRef<Segment[]>([]);
  const nextSeg = useRef(0);
  const combo = useRef(0);
  const popupId = useRef(0);
  const camAspect = useRef(16 / 9);
  const refAspect = useRef(9 / 16);
  const showSkeletonRef = useRef(showSkeleton);
  showSkeletonRef.current = showSkeleton;

  // 모델 + 웹캠 준비
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [ref, cam, media] = await Promise.all([
          createPoseDetector(setup.model),
          createPoseDetector(setup.model),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
        ]);
        if (cancelled) {
          ref.close();
          cam.close();
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        detectors.current = { ref, cam };
        stream.current = media;
        const v = camVideo.current!;
        v.srcObject = media;
        await v.play();
        camAspect.current = v.videoWidth / Math.max(1, v.videoHeight);
        setPhase('ready');
      } catch (e) {
        console.error(e);
        setError(
          (e as Error).name === 'NotAllowedError'
            ? '웹캠 권한이 필요해요. 브라우저 주소창에서 카메라를 허용해주세요.'
            : `준비 중 오류: ${(e as Error).message}`,
        );
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      detectors.current?.ref.close();
      detectors.current?.cam.close();
      detectors.current = null;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [setup.model]);

  // 웹캠 미리보기 스켈레톤 (시작 전에도 자세 확인용)
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'countdown') return;
    let raf = 0;
    const loop = () => {
      const d = detectors.current;
      const v = camVideo.current;
      if (d && v && v.readyState >= 2) {
        const pose = d.cam.detect(v);
        overlay(camCanvas.current, v, showSkeletonRef.current ? pose : null, '#ff3d81');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  function scoreSegment(seg: Segment) {
    const beat = beatDuration(setup.bpm);
    const t0 = Math.max(0, seg.start - beat);
    const t1 = seg.end + beat * 0.5;
    const ref = resampleFrames(refFrames.current, LIVE_FPS, t0, t1, refAspect.current);
    const user = resampleFrames(userFrames.current, LIVE_FPS, t0, t1, camAspect.current);
    const r = analyzeSequences(ref, user, { bpm: setup.bpm, offset: setup.offset, segments: [seg] });
    const sr = r.segments[0];
    if (!sr) return;
    combo.current = sr.grade === 'PERFECT' || sr.grade === 'GREAT' ? combo.current + 1 : 0;
    popup(sr.grade);
    const id = ++popupId.current;
    setPopups((p) => [...p.slice(-2), { id, grade: sr.grade, score: sr.score, combo: combo.current, comment: sr.comment }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1600);
    setResults((rs) => [...rs, sr]);
  }

  async function start() {
    const rv = refVideo.current!;
    rv.currentTime = 0;
    refAspect.current = rv.videoWidth / Math.max(1, rv.videoHeight);
    segments.current = splitEightCounts({ bpm: setup.bpm, offset: setup.offset, duration: rv.duration });
    nextSeg.current = 0;
    refFrames.current = [];
    userFrames.current = [];
    combo.current = 0;
    setResults([]);
    setPhase('countdown');
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      countdownBeep();
      await new Promise((r) => setTimeout(r, 800));
    }
    setCountdown(0);
    countdownBeep(true);
    // 웹캠 녹화 (결과 화면에서 다시 보기용)
    if (stream.current && typeof MediaRecorder !== 'undefined') {
      try {
        recorder.current = startRecording(stream.current, 4_000_000);
      } catch (e) {
        console.warn('웹캠 녹화 실패', e);
        recorder.current = null;
      }
    }
    recStartRefTime.current = rv.currentTime;
    await rv.play();
    setPhase('playing');
  }

  // 메인 루프: 두 영상 포즈 추출 + 8카운트 채점
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    let lastRefT = -1;
    let frames = 0;
    let fpsT = performance.now();
    const loop = () => {
      const d = detectors.current;
      const rv = refVideo.current!;
      const cv = camVideo.current!;
      if (!d) return;
      const t = rv.currentTime;
      if (t !== lastRefT) {
        lastRefT = t;
        let refPose = d.ref.detect(rv);
        if (refPose && setup.mirror) refPose = mirrorPose(refPose);
        const camPose = d.cam.detect(cv);
        refFrames.current.push({ t, pose: refPose });
        userFrames.current.push({ t, pose: camPose });
        overlay(refCanvas.current, rv, showSkeletonRef.current ? refPose : null, '#3ddcff');
        overlay(camCanvas.current, cv, showSkeletonRef.current ? camPose : null, '#ff3d81');
        frames++;
      }
      const now = performance.now();
      if (now - fpsT > 1000) {
        setFpsInfo(Math.round((frames * 1000) / (now - fpsT)));
        frames = 0;
        fpsT = now;
      }
      setCount(countAt(t, setup.bpm, setup.offset));
      const beat = beatDuration(setup.bpm);
      const seg = segments.current[nextSeg.current];
      if (seg && t >= seg.end + beat * 0.5) {
        nextSeg.current++;
        scoreSegment(seg);
      }
      if (rv.ended) {
        void finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const finishing = useRef(false);
  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setPhase('finishing');
    const rv = refVideo.current!;
    rv.pause();
    // 아직 채점 안 된 마지막 구간
    while (nextSeg.current < segments.current.length && segments.current[nextSeg.current].end <= rv.currentTime + 0.01) {
      scoreSegment(segments.current[nextSeg.current++]);
    }
    const end = rv.currentTime;
    const ref = resampleFrames(refFrames.current, LIVE_FPS, 0, end, refAspect.current);
    const user = resampleFrames(userFrames.current, LIVE_FPS, 0, end, camAspect.current);
    const result = analyzeSequences(ref, user, {
      bpm: setup.bpm,
      offset: setup.offset,
      segments: segments.current.filter((s) => s.end <= end + 0.01),
    });
    let userUrl: string | undefined;
    if (recorder.current) {
      const blob = await recorder.current.stop();
      if (blob.size > 0) userUrl = URL.createObjectURL(blob);
    }
    onDone({
      result,
      ref,
      user,
      refUrl,
      userUrl,
      userOffset: -recStartRefTime.current,
      mirror: setup.mirror,
      liveRecording: true,
      source: 'live',
    });
  }

  const latest = results[results.length - 1];

  return (
    <div className="screen live">
      <div className="live-stage">
        <div className="live-pane">
          <video
            ref={refVideo}
            src={refUrl}
            playsInline
            preload="auto"
            style={{ transform: setup.mirror ? 'scaleX(-1)' : undefined }}
          />
          <canvas ref={refCanvas} />
          <span className="pane-label ref">원본</span>
        </div>
        <div className="live-pane">
          {/* 셀카처럼 보이도록 화면만 좌우 반전 (데이터는 원본 방향 그대로) */}
          <video ref={camVideo} playsInline muted style={{ transform: 'scaleX(-1)' }} />
          <canvas ref={camCanvas} style={{ transform: 'scaleX(-1)' }} />
          <span className="pane-label user">나</span>
        </div>

        {count && phase === 'playing' && (
          <div className="live-count">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className={i + 1 === count.count ? 'on' : ''}>
                {i + 1}
              </span>
            ))}
          </div>
        )}
        {countdown > 0 && <div className="live-countdown">{countdown}</div>}
        <div className="popups">
          {popups.map((p) => (
            <div key={p.id} className={`popup grade-${p.grade.toLowerCase()}`} style={{ color: GRADE_COLORS[p.grade] }}>
              <div className="popup-grade">{p.grade}</div>
              {p.combo > 1 && <div className="popup-combo">{p.combo} COMBO</div>}
              <div className="popup-comment">{p.comment}</div>
            </div>
          ))}
        </div>
        {phase === 'loading' && <div className="live-msg">모델과 웹캠 준비 중…</div>}
        {phase === 'finishing' && <div className="live-msg">결과 계산 중…</div>}
        {phase === 'error' && <div className="live-msg error">{error}</div>}
      </div>

      <div className="live-bar">
        {phase === 'ready' && (
          <button className="btn primary big" onClick={() => void start()}>
            ▶ 시작 (3초 카운트다운)
          </button>
        )}
        {phase === 'playing' && (
          <button className="btn ghost" onClick={() => void finish()}>
            ■ 여기서 끝내고 결과 보기
          </button>
        )}
        <button className="btn ghost debug" onClick={onCancel} disabled={phase === 'finishing'}>
          ← 나가기
        </button>
        <label className="chip debug">
          <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} /> 스켈레톤
        </label>
        {debug && (
          <span className="hint debug">
            {fpsInfo}fps · 채점 {results.length}/{segments.current.length || '-'}
            {latest ? ` · 마지막 ${latest.score}점` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
