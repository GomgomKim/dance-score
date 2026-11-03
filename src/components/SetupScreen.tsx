import { useState } from 'react';
import { decodeAudioFile } from '../audio/decode';
import { unlockAudio } from '../audio/sfx';
import { estimateSyncOffset, onsetEnvelope } from '../audio/tempo';
import type { PoseModel } from '../pose/landmarker';
import type { SetupState } from '../lib/setup';
import { CountOverlay, TempoControls } from './TempoControls';
import { VideoPicker } from './VideoPicker';

export type Mode = 'analysis' | 'live';

interface Props {
  mode: Mode;
  setup: SetupState;
  update: (patch: Partial<SetupState>) => void;
  refUrl: string | null;
  userUrl: string | null;
  onStart: () => void;
  onDemo: () => void;
}

export function SetupScreen({ mode, setup, update, refUrl, userUrl, onStart, onDemo }: Props) {
  const [refVideo, setRefVideo] = useState<HTMLVideoElement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const canStart = Boolean(setup.refFile) && setup.bpm > 0 && (mode === 'live' || Boolean(setup.userFile));

  async function autoSync() {
    if (!setup.refFile || !setup.userFile) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const [a, b] = await Promise.all([decodeAudioFile(setup.refFile, 60), decodeAudioFile(setup.userFile, 80)]);
      if (a.sampleRate !== b.sampleRate) console.warn('샘플레이트가 달라요', a.sampleRate, b.sampleRate);
      const hopA = Math.round(512 * (a.sampleRate / 44100)) || 512;
      const ea = onsetEnvelope(a.samples, a.sampleRate, hopA);
      const eb = onsetEnvelope(b.samples, b.sampleRate, Math.round(ea.hop * b.sampleRate));
      const off = estimateSyncOffset(ea, eb, 20);
      update({ userOffset: Math.round(off * 100) / 100 });
      setSyncMsg(`내 영상이 원본보다 ${off >= 0 ? `${off.toFixed(2)}초 늦게` : `${(-off).toFixed(2)}초 일찍`} 시작해요.`);
    } catch (e) {
      console.error(e);
      setSyncMsg('오디오를 읽지 못했어요. 직접 입력해주세요.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="screen setup">
      <section className="panel">
        <h2>1. 원본 안무 영상</h2>
        <VideoPicker
          ref={setRefVideo}
          label="원본"
          file={setup.refFile}
          url={refUrl}
          onFile={(f) => update({ refFile: f })}
          mirror={setup.mirror}
          onMirror={(m) => update({ mirror: m })}
          overlay={<CountOverlay video={refVideo} bpm={setup.bpm} offset={setup.offset} />}
        />
      </section>

      <section className="panel">
        <h2>2. 박자 맞추기</h2>
        <TempoControls
          bpm={setup.bpm}
          offset={setup.offset}
          onBpm={(bpm) => update({ bpm })}
          onOffset={(offset) => update({ offset })}
          refFile={setup.refFile}
          refVideo={refVideo}
        />
      </section>

      {mode === 'analysis' ? (
        <section className="panel">
          <h2>3. 내 춤 영상</h2>
          <VideoPicker label="내 영상" file={setup.userFile} url={userUrl} onFile={(f) => update({ userFile: f })} />
          <div className="tempo-row">
            <label className="field small">
              <span>내 영상 싱크 (초) — 원본보다 늦게 시작하면 +</span>
              <input
                type="number"
                step={0.01}
                value={setup.userOffset}
                onChange={(e) => update({ userOffset: Number(e.target.value) })}
              />
            </label>
            <button
              className="btn ghost"
              onClick={() => void autoSync()}
              disabled={!setup.refFile || !setup.userFile || syncing}
            >
              {syncing ? '맞추는 중…' : '🔊 오디오로 자동 싱크'}
            </button>
          </div>
          {syncMsg && <p className="hint accent">{syncMsg}</p>}
          <p className="hint">같은 노래를 틀고 찍었다면 자동 싱크가 제일 정확해요.</p>
        </section>
      ) : (
        <section className="panel">
          <h2>3. 웹캠 준비</h2>
          <p>시작하면 원본 영상이 재생되고 옆에 웹캠이 켜져요. 8카운트마다 등급이 바로 떠요.</p>
          <p className="hint">전신이 다 나오게 2~3m 떨어져서 서주세요. 소리는 스피커로!</p>
        </section>
      )}

      <section className="panel debug">
        <h2>고급 설정</h2>
        <div className="tempo-row">
          <label className="field small">
            <span>포즈 모델</span>
            <select className="select" value={setup.model} onChange={(e) => update({ model: e.target.value as PoseModel })}>
              <option value="lite">lite (빠름)</option>
              <option value="full">full (기본)</option>
              <option value="heavy">heavy (정확, 느림)</option>
            </select>
          </label>
          {mode === 'analysis' && (
            <label className="field small">
              <span>분석 fps</span>
              <select className="select" value={setup.fps} onChange={(e) => update({ fps: Number(e.target.value) })}>
                <option value={10}>10 (빠름)</option>
                <option value={15}>15 (기본)</option>
                <option value={24}>24</option>
                <option value={30}>30 (정밀)</option>
              </select>
            </label>
          )}
        </div>
      </section>

      <div className="start-bar">
        <button
          className="btn primary big"
          disabled={!canStart}
          onClick={() => {
            unlockAudio();
            onStart();
          }}
        >
          {mode === 'analysis' ? '🔍 분석 시작' : '💃 라이브 시작'}
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            unlockAudio();
            onDemo();
          }}
        >
          데모 결과 보기
        </button>
        <a className="btn ghost" href="/c/sample">
          🔥 샘플 챌린지
        </a>
      </div>
    </div>
  );
}
