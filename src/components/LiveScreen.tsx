/**
 * 라이브 모드: 원본 재생 + 웹캠. 8카운트가 끝날 때마다 실시간으로 등급 팝업.
 */
import { useEffect, useRef, useState } from 'react';
import { createPoseDetector, type PoseDetector } from '../pose/landmarker';
import { mirrorPose } from '../pose/landmarks';
import { countAt } from '../pose/segments';
import type { SegmentResult } from '../pose/types';
import { startRecording, type Recording } from '../lib/recorder';
import type { SetupState } from '../lib/setup';
import type { ScoreSession } from '../lib/session';
import { LiveScorer } from '../live/liveScorer';
import { cameraErrorMessage, CountDots, drawPoseOverlay, openWebcam, PopupStack, runCountdown, usePopups } from '../live/ui';

interface Props {
  setup: SetupState;
  refUrl: string;
  onDone: (s: ScoreSession) => void;
  onCancel: () => void;
  debug: boolean;
}

type Phase = 'loading' | 'ready' | 'countdown' | 'playing' | 'finishing' | 'error';

export function LiveScreen({ setup, refUrl, onDone, onCancel, debug }: Props) {
  const refVideo = useRef<HTMLVideoElement>(null);
  const camVideo = useRef<HTMLVideoElement>(null);
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const camCanvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [count, setCount] = useState<{ segment: number; count: number } | null>(null);
  const [results, setResults] = useState<SegmentResult[]>([]);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [fpsInfo, setFpsInfo] = useState(0);
  const { popups, show } = usePopups();

  const detectors = useRef<{ ref: PoseDetector; cam: PoseDetector } | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<Recording | null>(null);
  const recStartRefTime = useRef(0);
  const scorer = useRef<LiveScorer | null>(null);
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
          openWebcam(),
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
        setPhase('ready');
      } catch (e) {
        console.error(e);
        setError(cameraErrorMessage(e));
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
        drawPoseOverlay(camCanvas.current, v.videoWidth, v.videoHeight, showSkeletonRef.current ? pose : null, '#ff3d81');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  async function start() {
    const rv = refVideo.current!;
    const cv = camVideo.current!;
    rv.currentTime = 0;
    scorer.current = new LiveScorer({
      bpm: setup.bpm,
      offset: setup.offset,
      duration: rv.duration,
      refAspect: rv.videoWidth / Math.max(1, rv.videoHeight),
      userAspect: cv.videoWidth / Math.max(1, cv.videoHeight),
    });
    setResults([]);
    setPhase('countdown');
    await runCountdown(setCountdown);
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
      const s = scorer.current;
      const rv = refVideo.current!;
      const cv = camVideo.current!;
      if (!d || !s) return;
      const t = rv.currentTime;
      if (t !== lastRefT) {
        lastRefT = t;
        let refPose = d.ref.detect(rv);
        if (refPose && setup.mirror) refPose = mirrorPose(refPose);
        const camPose = d.cam.detect(cv);
        s.addRef(t, refPose);
        s.addUser(t, camPose);
        const sk = showSkeletonRef.current;
        drawPoseOverlay(refCanvas.current, rv.videoWidth, rv.videoHeight, sk ? refPose : null, '#3ddcff');
        drawPoseOverlay(camCanvas.current, cv.videoWidth, cv.videoHeight, sk ? camPose : null, '#ff3d81');
        frames++;
      }
      const now = performance.now();
      if (now - fpsT > 1000) {
        setFpsInfo(Math.round((frames * 1000) / (now - fpsT)));
        frames = 0;
        fpsT = now;
      }
      setCount(countAt(t, setup.bpm, setup.offset));
      for (const sr of s.poll(t)) {
        show(sr, s.combo);
        setResults((rs) => [...rs, sr]);
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
    const s = scorer.current;
    if (finishing.current || !s) return;
    finishing.current = true;
    setPhase('finishing');
    const rv = refVideo.current!;
    rv.pause();
    const end = rv.currentTime;
    s.flush(end);
    const { result, ref, user } = s.finalize(end);
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

        {count && phase === 'playing' && <CountDots count={count.count} />}
        {countdown > 0 && <div className="live-countdown">{countdown}</div>}
        <PopupStack popups={popups} />
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
            {fpsInfo}fps · 채점 {results.length}/{scorer.current?.segments.length || '-'}
            {latest ? ` · 마지막 ${latest.score}점` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
