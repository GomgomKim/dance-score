/**
 * 원본 vs 내 영상 나란히 재생 + 스켈레톤 오버레이.
 * 같은 캔버스를 MediaRecorder로 녹화해서 릴스용 비교 영상으로 저장할 수 있다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { coverRect, containRect, drawSkeleton, drawVideoFrame, type Rect } from '../pose/draw';
import { GRADE_COLORS } from '../pose/grading';
import { bodyFrame, normalizePose, projectOnto } from '../pose/normalize';
import { countAt } from '../pose/segments';
import { nearestFrame } from '../pose/sequence';
import type { SegmentResult } from '../pose/types';
import { audioTrackOf, extensionFor, fixInfiniteDuration, pickMimeType, startRecording } from '../lib/recorder';
import { dateStamp, downloadBlob } from '../lib/download';
import { drawWatermark, preloadBrandLogo } from '../lib/watermark';
import type { ScoreSession } from '../lib/session';

type Layout = 'reels' | 'wide';

const SIZES: Record<Layout, { w: number; h: number }> = {
  reels: { w: 1080, h: 1920 },
  wide: { w: 1920, h: 1080 },
};

const REF_COLOR = '#3ddcff';
const USER_COLOR = '#ff3d81';

interface Props {
  session: ScoreSession;
  /** 재생할 구간 (null이면 전체) */
  segment: SegmentResult | null;
  title?: string;
  debug?: boolean;
}

function panels(layout: Layout): { ref: Rect; user: Rect } {
  if (layout === 'reels') {
    // 위 15%(288px) 안전 영역 바로 아래부터 시작
    return { ref: { x: 0, y: 300, w: 540, h: 960 }, user: { x: 540, y: 300, w: 540, h: 960 } };
  }
  return { ref: { x: 0, y: 0, w: 960, h: 1080 }, user: { x: 960, y: 0, w: 960, h: 1080 } };
}

export function ComparisonPlayer({ session, segment, title, debug }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const [layout, setLayout] = useState<Layout>('reels');
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordRange, setRecordRange] = useState<'segment' | 'all'>('segment');
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(!session.refUrl);

  const { result, ref, user } = session;
  const hasVideo = Boolean(session.refUrl);
  const duration = ref.frames.length ? ref.frames[ref.frames.length - 1].t : 0;
  const range = segment ? { start: segment.start, end: segment.end } : { start: 0, end: duration };

  // 상태를 rAF 루프에서 읽기 위한 ref
  const st = useRef({ layout, showSkeleton, showGhost, range, playing: false, clockStart: 0, clockT: range.start, loop: true });
  st.current.layout = layout;
  st.current.showSkeleton = showSkeleton;
  st.current.showGhost = showGhost;
  // 녹화 중 "전체" 범위는 리렌더돼도 유지
  const rangeOverride = useRef<{ start: number; end: number } | null>(null);
  st.current.range = rangeOverride.current ?? range;

  const currentTime = useCallback(() => {
    const s = st.current;
    if (hasVideo && refVideo.current) return refVideo.current.currentTime;
    if (!s.playing) return s.clockT;
    return s.clockT + (performance.now() - s.clockStart) / 1000;
  }, [hasVideo]);

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      const s = st.current;
      const size = SIZES[s.layout];
      if (canvas.width !== size.w || canvas.height !== size.h) {
        canvas.width = size.w;
        canvas.height = size.h;
      }
      ctx.fillStyle = '#0b0b12';
      ctx.fillRect(0, 0, size.w, size.h);
      const p = panels(s.layout);

      const refFrame = nearestFrame(ref.frames, t, 1 / ref.fps);
      const userFrame = nearestFrame(user.frames, t, 1 / user.fps);

      // 원본 패널
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.ref.x, p.ref.y, p.ref.w, p.ref.h);
      ctx.clip();
      ctx.fillStyle = '#14141f';
      ctx.fillRect(p.ref.x, p.ref.y, p.ref.w, p.ref.h);
      let refRect = containRect(ref.aspect, 1, p.ref);
      const rv = refVideo.current;
      if (rv && hasVideo && rv.videoWidth) {
        refRect = coverRect(rv.videoWidth, rv.videoHeight, p.ref);
        drawVideoFrame(ctx, rv, refRect, session.mirror);
      }
      if (s.showSkeleton && refFrame?.pose) drawSkeleton(ctx, refFrame.pose, refRect, { color: REF_COLOR });
      ctx.restore();

      // 내 패널
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.user.x, p.user.y, p.user.w, p.user.h);
      ctx.clip();
      ctx.fillStyle = '#1a1420';
      ctx.fillRect(p.user.x, p.user.y, p.user.w, p.user.h);
      let userRect = containRect(user.aspect, 1, p.user);
      const uv = userVideo.current;
      if (uv && session.userUrl && uv.videoWidth) {
        userRect = coverRect(uv.videoWidth, uv.videoHeight, p.user);
        drawVideoFrame(ctx, uv, userRect);
      }
      const seg = result.segments.find((x) => t >= x.start && t < x.end);
      if (s.showGhost && refFrame?.pose && userFrame?.pose) {
        // 원본 동작을 내 몸 크기/위치에 맞춰서 반투명하게
        const norm = normalizePose(refFrame.pose, ref.aspect);
        const target = bodyFrame(userFrame.pose, user.aspect);
        if (norm && target) {
          drawSkeleton(ctx, projectOnto(norm, target, user.aspect), userRect, { color: REF_COLOR, alpha: 0.45 });
        }
      }
      if (s.showSkeleton && userFrame?.pose) {
        drawSkeleton(ctx, userFrame.pose, userRect, {
          color: USER_COLOR,
          highlight: seg && seg.grade !== 'PERFECT' ? seg.worstPart : null,
          highlightColor: '#ffd23f',
        });
      }
      ctx.restore();

      // 라벨
      // 원본은 왼쪽 끝, 나는 오른쪽 끝 (가운데는 등급 표시 자리). 위 15% 안전 영역 안으로.
      const label = (text: string, r: Rect, color: string, side: 'left' | 'right') => {
        ctx.font = '900 34px "Noto Sans KR", sans-serif';
        const w = ctx.measureText(text).width + 40;
        const x = side === 'left' ? r.x + 20 : r.x + r.w - 20 - w;
        const y = Math.max(r.y + 20, size.h * 0.15 + 12);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, w, 56, 28);
        ctx.fill();
        ctx.fillStyle = '#0b0b12';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 20, y + 29);
      };
      label('원본', p.ref, REF_COLOR, 'left');
      label('나', p.user, USER_COLOR, 'right');

      // 카운트 표시
      const c = countAt(t, result.bpm, result.offset);
      ctx.textBaseline = 'alphabetic';
      if (s.layout === 'reels') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = '900 64px "Noto Sans KR", sans-serif';
        ctx.fillText(title || 'AI 안무 채점', size.w / 2, 140);
        ctx.fillStyle = '#9a98b0';
        ctx.font = '700 36px "Noto Sans KR", sans-serif';
        ctx.fillText(`총점 ${result.totalScore.toFixed(1)} · ${result.totalGrade}`, size.w / 2, 205);
        if (seg) {
          ctx.fillStyle = GRADE_COLORS[seg.grade];
          // 구간 등급: 두 패널 경계 위 (안전 영역 안)
          ctx.font = '96px "Black Han Sans", sans-serif';
          ctx.lineWidth = 10;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.strokeText(seg.grade, size.w / 2, 420);
          ctx.fillText(seg.grade, size.w / 2, 420);
          ctx.fillStyle = '#fff';
          ctx.font = '900 44px "Noto Sans KR", sans-serif';
          ctx.fillText(`${seg.index + 1}번째 8카운트 · ${Math.round(seg.score)}점`, size.w / 2, 1330);
          ctx.fillStyle = '#ffd23f';
          ctx.font = '900 40px "Noto Sans KR", sans-serif';
          ctx.fillText(seg.comment, size.w / 2, 1390, size.w - 80);
        }
        if (c) {
          for (let i = 1; i <= 8; i++) {
            const x = size.w / 2 + (i - 4.5) * 96;
            const active = i === c.count;
            ctx.fillStyle = active ? '#ff3d81' : 'rgba(255,255,255,0.12)';
            ctx.beginPath();
            ctx.arc(x, 1445, active ? 34 : 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = active ? '#fff' : '#6f6d85';
            ctx.font = `900 ${active ? 38 : 28}px "Noto Sans KR", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i), x, 1447);
          }
        }
        ctx.textBaseline = 'alphabetic';
      } else if (seg) {
        // 가로: 등급/카운트를 위쪽 안전 영역 안으로 (아래는 워터마크)
        ctx.textAlign = 'center';
        if (c) {
          ctx.fillStyle = '#fff';
          ctx.font = '900 48px "Noto Sans KR", sans-serif';
          ctx.lineWidth = 8;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.strokeText(`${c.count} / 8`, size.w / 2, 230);
          ctx.fillText(`${c.count} / 8`, size.w / 2, 230);
        }
        ctx.fillStyle = GRADE_COLORS[seg.grade];
        ctx.font = '90px "Black Han Sans", sans-serif';
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(seg.grade, size.w / 2, 330);
        ctx.fillText(seg.grade, size.w / 2, 330);
      }

      // 워터마크: 하단 15% 안전 영역 바로 위 (항상 표시, 녹화본에도 그대로 들어감)
      drawWatermark(ctx, size.w, size.h);
    },
    [ref, user, result, hasVideo, session.mirror, session.userUrl, title],
  );

  // 이미지 로고를 쓰는 브랜드면 미리 로드
  useEffect(() => {
    void preloadBrandLogo().then(() => draw(st.current.clockT));
  }, [draw]);

  // 영상 로드
  useEffect(() => {
    if (!hasVideo) return;
    let cancelled = false;
    const rv = refVideo.current!;
    const uv = userVideo.current;
    const wait = (v: HTMLVideoElement) =>
      new Promise<void>((res) => (v.readyState >= 2 ? res() : v.addEventListener('loadeddata', () => res(), { once: true })));
    void (async () => {
      await wait(rv);
      if (uv && session.userUrl) {
        await wait(uv);
        if (session.liveRecording) await fixInfiniteDuration(uv);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasVideo, session.userUrl, session.liveRecording]);

  const seekTo = useCallback(
    async (t: number) => {
      st.current.clockT = t;
      setTime(t);
      const rv = refVideo.current;
      const uv = userVideo.current;
      const seeks: Promise<void>[] = [];
      const seek = (v: HTMLVideoElement, target: number) =>
        new Promise<void>((res) => {
          v.addEventListener('seeked', () => res(), { once: true });
          v.currentTime = Math.max(0, target);
          setTimeout(res, 1500);
        });
      if (hasVideo && rv) seeks.push(seek(rv, t));
      if (session.userUrl && uv) seeks.push(seek(uv, t + session.userOffset));
      await Promise.all(seeks);
      draw(t);
    },
    [draw, hasVideo, session.userUrl, session.userOffset],
  );

  // 구간이 바뀌면 처음으로
  useEffect(() => {
    if (!ready) return;
    stop();
    void seekTo(range.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, segment?.index, layout]);

  // 재생 루프
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const s = st.current;
      const t = currentTime();
      const uv = userVideo.current;
      if (uv && session.userUrl && !uv.paused) {
        const target = t + session.userOffset;
        if (Math.abs(uv.currentTime - target) > 0.12) uv.currentTime = target;
      }
      if (t >= s.range.end) {
        if (s.loop) {
          void restart();
          return;
        }
        stop();
        onEnded.current?.();
        return;
      }
      draw(t);
      setTime(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, draw, currentTime]);

  const onEnded = useRef<(() => void) | null>(null);

  async function play(loop = true) {
    st.current.loop = loop;
    const rv = refVideo.current;
    const uv = userVideo.current;
    if (hasVideo && rv) {
      rv.muted = false;
      await rv.play().catch(() => {
        rv.muted = true;
        return rv.play();
      });
    }
    if (session.userUrl && uv) await uv.play().catch(() => undefined);
    st.current.clockStart = performance.now();
    st.current.playing = true;
    setPlaying(true);
  }

  function stop() {
    refVideo.current?.pause();
    userVideo.current?.pause();
    if (st.current.playing) st.current.clockT = currentTime();
    st.current.playing = false;
    setPlaying(false);
  }

  async function restart() {
    stop();
    await seekTo(st.current.range.start);
    await play(st.current.loop);
  }

  async function record() {
    const canvas = canvasRef.current;
    if (!canvas || recording) return;
    stop();
    const r = recordRange === 'segment' ? range : { start: 0, end: duration };
    rangeOverride.current = r;
    st.current.range = r;
    await seekTo(r.start);
    const stream = canvas.captureStream(30);
    const rv = refVideo.current;
    if (hasVideo && rv) {
      const track = audioTrackOf(rv);
      if (track) stream.addTrack(track);
    }
    const rec = startRecording(stream);
    setRecording(true);
    onEnded.current = async () => {
      onEnded.current = null;
      rangeOverride.current = null;
      const blob = await rec.stop();
      stream.getVideoTracks().forEach((t) => t.stop());
      setRecording(false);
      downloadBlob(blob, `dance-score-compare-${dateStamp()}.${extensionFor(blob.type)}`);
    };
    await play(false);
  }

  const progress = range.end > range.start ? (time - range.start) / (range.end - range.start) : 0;
  const mime = pickMimeType();

  return (
    <div className="compare">
      <div className={`compare-stage ${layout}`}>
        <canvas ref={canvasRef} className="compare-canvas" onClick={() => (playing ? stop() : void play())} />
        {!playing && !recording && (
          <button className="compare-play" onClick={() => void play()} aria-label="재생">
            ▶
          </button>
        )}
        {recording && <div className="rec-badge">● REC</div>}
      </div>
      <div className="compare-progress">
        <div style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
      </div>
      <div className="compare-controls">
        <button className="btn" onClick={() => (playing ? stop() : void play())} disabled={!ready || recording}>
          {playing ? '일시정지' : '재생'}
        </button>
        <button className="btn ghost" onClick={() => void restart()} disabled={!ready || recording}>
          처음부터
        </button>
        <label className="chip">
          <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} /> 스켈레톤
        </label>
        <label className="chip">
          <input type="checkbox" checked={showGhost} onChange={(e) => setShowGhost(e.target.checked)} /> 원본 고스트
        </label>
        <select className="select" value={layout} onChange={(e) => setLayout(e.target.value as Layout)} disabled={recording}>
          <option value="reels">세로 9:16 (릴스)</option>
          <option value="wide">가로 16:9</option>
        </select>
      </div>
      <div className="compare-controls">
        <select
          className="select"
          value={recordRange}
          onChange={(e) => setRecordRange(e.target.value as 'segment' | 'all')}
          disabled={recording}
        >
          <option value="segment">이 구간만</option>
          <option value="all">전체</option>
        </select>
        <button className="btn primary" onClick={() => void record()} disabled={!ready || recording || !mime}>
          {recording ? '녹화 중…' : '🎬 비교 영상 녹화 & 다운로드'}
        </button>
      </div>
      {!mime && <p className="hint">이 브라우저는 MediaRecorder 녹화를 지원하지 않아요. 크롬이나 사파리 최신 버전을 써주세요.</p>}
      {debug && (
        <p className="hint debug">
          t={time.toFixed(2)}s · 녹화 포맷 {mime || '없음'} · 내 영상 오프셋 {session.userOffset.toFixed(2)}s
        </p>
      )}
      {hasVideo && (
        <video ref={refVideo} src={session.refUrl} playsInline preload="auto" className="hidden-video" crossOrigin="anonymous" />
      )}
      {session.userUrl && (
        <video ref={userVideo} src={session.userUrl} playsInline muted preload="auto" className="hidden-video" />
      )}
    </div>
  );
}
