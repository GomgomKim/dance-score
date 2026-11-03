/** BPM 입력 + 탭 템포 + 자동 추정 + 첫 카운트 위치 */
import { useEffect, useRef, useState } from 'react';
import { decodeAudioFile } from '../audio/decode';
import { tick } from '../audio/sfx';
import { bpmFromTaps, estimateBpm } from '../audio/tempo';
import { countAt } from '../pose/segments';

interface Props {
  bpm: number;
  offset: number;
  onBpm: (bpm: number) => void;
  onOffset: (offset: number) => void;
  refFile: File | null;
  refVideo: HTMLVideoElement | null;
}

export function TempoControls({ bpm, offset, onBpm, onOffset, refFile, refVideo }: Props) {
  const taps = useRef<number[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [estimating, setEstimating] = useState(false);
  const [estimateMsg, setEstimateMsg] = useState('');
  const [metronome, setMetronome] = useState(false);

  function tap() {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last && now - last > 2000) taps.current = [];
    taps.current.push(now);
    setTapCount(taps.current.length);
    const b = bpmFromTaps(taps.current);
    if (b && b >= 40 && b <= 240) onBpm(b);
  }

  // T 키로 탭 (입력창 포커스 아닐 때)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyT' || (e.target as HTMLElement).tagName === 'INPUT') return;
      e.preventDefault();
      tap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 미리보기 재생 중 메트로놈 + 카운트 확인
  useEffect(() => {
    if (!metronome || !refVideo) return;
    let raf = 0;
    let last = '';
    const loop = () => {
      if (!refVideo.paused && bpm > 0) {
        const c = countAt(refVideo.currentTime, bpm, offset);
        const key = c ? `${c.segment}-${c.count}` : '';
        if (c && key !== last) tick(c.count === 1 ? 0.9 : 0.2);
        last = key;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [metronome, refVideo, bpm, offset]);

  async function autoEstimate() {
    if (!refFile) return;
    setEstimating(true);
    setEstimateMsg('');
    try {
      const { samples, sampleRate } = await decodeAudioFile(refFile, 60);
      const r = estimateBpm(samples, sampleRate);
      if (!r) {
        setEstimateMsg('소리를 찾지 못했어요. 탭 템포를 써주세요.');
        return;
      }
      onBpm(r.bpm);
      onOffset(Math.round(r.firstBeat * 100) / 100);
      setEstimateMsg(
        `추정 ${r.bpm} BPM (신뢰도 ${Math.round(r.confidence * 100)}%). 안무 "1"이 시작하는 위치는 직접 맞춰주세요.`,
      );
    } catch (e) {
      console.error(e);
      setEstimateMsg('이 브라우저에서는 오디오를 읽지 못했어요. 탭 템포를 써주세요.');
    } finally {
      setEstimating(false);
    }
  }

  const beat = bpm > 0 ? 60 / bpm : 0.5;
  const nudge = (d: number) => onOffset(Math.max(0, Math.round((offset + d) * 1000) / 1000));

  return (
    <div className="tempo">
      <div className="tempo-row">
        <label className="field small">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            step={0.1}
            value={bpm}
            onChange={(e) => onBpm(Number(e.target.value))}
          />
        </label>
        <button className="btn tap" onClick={tap}>
          TAP {tapCount > 1 ? `(${tapCount})` : ''}
        </button>
        <button className="btn ghost" onClick={() => void autoEstimate()} disabled={!refFile || estimating}>
          {estimating ? '분석 중…' : '🎵 자동 추정'}
        </button>
      </div>
      <p className="hint">노래에 맞춰 TAP 버튼(또는 T 키)을 4번 이상 눌러요.</p>
      {estimateMsg && <p className="hint accent">{estimateMsg}</p>}
      <div className="tempo-row">
        <label className="field small">
          <span>첫 카운트(1) 위치 (초)</span>
          <input type="number" min={0} step={0.01} value={offset} onChange={(e) => onOffset(Number(e.target.value))} />
        </label>
        <button
          className="btn ghost"
          disabled={!refVideo}
          onClick={() => refVideo && onOffset(Math.round(refVideo.currentTime * 100) / 100)}
        >
          📍 지금 위치를 1로
        </button>
      </div>
      <div className="tempo-row">
        <button className="btn ghost sm" onClick={() => nudge(-beat)}>
          −1박
        </button>
        <button className="btn ghost sm" onClick={() => nudge(-0.05)}>
          −0.05초
        </button>
        <button className="btn ghost sm" onClick={() => nudge(0.05)}>
          +0.05초
        </button>
        <button className="btn ghost sm" onClick={() => nudge(beat)}>
          +1박
        </button>
        <label className="chip">
          <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} /> 미리보기 메트로놈
        </label>
      </div>
      <p className="hint">원본 영상을 재생하면 화면에 카운트가 떠요. 안무의 "1"과 맞는지 확인하세요.</p>
    </div>
  );
}

/** 미리보기 영상 위에 현재 카운트 표시 */
export function CountOverlay({ video, bpm, offset }: { video: HTMLVideoElement | null; bpm: number; offset: number }) {
  const [label, setLabel] = useState<string>('');
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const loop = () => {
      const c = bpm > 0 ? countAt(video.currentTime, bpm, offset) : null;
      setLabel(c ? `${c.segment + 1}-${c.count}` : '');
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [video, bpm, offset]);
  if (!label) return null;
  const [seg, count] = label.split('-');
  return (
    <div className="count-overlay">
      <small>{seg}번째 8카운트</small>
      <b className={count === '1' ? 'one' : ''}>{count}</b>
    </div>
  );
}
