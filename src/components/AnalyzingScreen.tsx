import { useEffect, useRef, useState } from 'react';
import { drawSkeleton, containRect } from '../pose/draw';
import { extractPoseSequence, loadVideo } from '../pose/extract';
import { createPoseDetector } from '../pose/landmarker';
import { analyzeSequences } from '../pose/scoring';
import type { PoseFrame } from '../pose/types';
import type { SetupState } from '../lib/setup';
import type { ScoreSession } from '../lib/session';

interface Props {
  setup: SetupState;
  refUrl: string;
  userUrl: string;
  onDone: (s: ScoreSession) => void;
  onCancel: () => void;
}

const STAGES = ['모델 불러오는 중', '원본 영상 포즈 추출', '내 영상 포즈 추출', '채점 중'];

export function AnalyzingScreen({ setup, refUrl, userUrl, onDone, onCancel }: Props) {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [detected, setDetected] = useState({ ok: 0, total: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const ac = new AbortController();
    const preview = (frame: PoseFrame, aspect: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#14141f';
      ctx.fillRect(0, 0, c.width, c.height);
      if (frame.pose) {
        drawSkeleton(ctx, frame.pose, containRect(aspect, 1, { x: 0, y: 0, w: c.width, h: c.height }), {
          color: '#3ddcff',
        });
      }
    };
    void (async () => {
      try {
        setStage(0);
        const [refVideo, userVideo] = await Promise.all([loadVideo(refUrl), loadVideo(userUrl)]);
        const aspectR = refVideo.videoWidth / refVideo.videoHeight;
        const aspectU = userVideo.videoWidth / userVideo.videoHeight;
        // VIDEO 모드는 프레임 간 트래킹을 해서 영상마다 따로 만든다
        const refDetector = await createPoseDetector(setup.model);
        let ok = 0;
        let total = 0;
        setStage(1);
        const ref = await extractPoseSequence(refVideo, refDetector, {
          fps: setup.fps,
          mirror: setup.mirror,
          signal: ac.signal,
          onProgress: (r, f) => {
            setProgress(r);
            total++;
            if (f.pose) ok++;
            if (total % 3 === 0) {
              setDetected({ ok, total });
              preview(f, aspectR);
            }
          },
        });
        refDetector.close();
        const refDuration = refVideo.duration;

        const userDetector = await createPoseDetector(setup.model);
        ok = 0;
        total = 0;
        setStage(2);
        setProgress(0);
        const user = await extractPoseSequence(userVideo, userDetector, {
          fps: setup.fps,
          timeOffset: setup.userOffset,
          start: 0,
          end: refDuration,
          signal: ac.signal,
          onProgress: (r, f) => {
            setProgress(r);
            total++;
            if (f.pose) ok++;
            if (total % 3 === 0) {
              setDetected({ ok, total });
              preview(f, aspectU);
            }
          },
        });
        userDetector.close();

        setStage(3);
        setProgress(1);
        await new Promise((r) => setTimeout(r, 30));
        const result = analyzeSequences(ref, user, { bpm: setup.bpm, offset: setup.offset });
        done.current({
          result,
          ref,
          user,
          refUrl,
          userUrl,
          userOffset: setup.userOffset,
          mirror: setup.mirror,
          source: 'analysis',
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        console.error(e);
        setError((e as Error).message || '분석 중 오류가 났어요');
      }
    })();
    return () => ac.abort();
  }, [setup, refUrl, userUrl]);

  const overall = stage === 0 ? 0 : stage === 1 ? progress * 0.5 : stage === 2 ? 0.5 + progress * 0.5 : 1;

  return (
    <div className="screen analyzing">
      <section className="panel center">
        <h2>AI가 채점 중… 🤖</h2>
        <div className="big-progress">
          <div className="big-progress-fill" style={{ width: `${overall * 100}%` }} />
          <span>{Math.floor(overall * 100)}%</span>
        </div>
        <p className="stage">
          {STAGES[stage]}
          {stage === 1 || stage === 2 ? ` ${Math.floor(progress * 100)}%` : ''}
        </p>
        {error ? (
          <>
            <p className="error">{error}</p>
            <button className="btn primary" onClick={onCancel}>
              돌아가기
            </button>
          </>
        ) : (
          <button className="btn ghost" onClick={onCancel}>
            취소
          </button>
        )}
        <div className="debug analyzing-preview">
          <canvas ref={canvasRef} width={270} height={480} />
          <p className="hint">
            포즈 인식률 {detected.total ? Math.round((detected.ok / detected.total) * 100) : 0}% · {setup.fps}fps ·{' '}
            {setup.model}
          </p>
        </div>
      </section>
    </div>
  );
}
