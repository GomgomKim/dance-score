import { useCallback, useEffect, useState } from 'react';
import { setMuted } from './audio/sfx';
import { BRAND, footerParts } from './config/brand';
import { AdminPage } from './components/AdminPage';
import { AnalyzingScreen } from './components/AnalyzingScreen';
import { ChallengePage } from './components/ChallengePage';
import { LiveScreen } from './components/LiveScreen';
import { ResultScreen } from './components/ResultScreen';
import { SetupScreen, type Mode } from './components/SetupScreen';
import { createDemoSession } from './demo/demoSession';
import { DEFAULT_SETUP, type SetupState } from './lib/setup';
import type { ScoreSession } from './lib/session';
import { parseRoute } from './lib/route';
import { useObjectUrl } from './lib/useObjectUrl';

type Screen = 'setup' | 'analyzing' | 'live' | 'result';

function usePref(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? initial : s === '1';
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: boolean) => {
      setV(nv);
      try {
        localStorage.setItem(key, nv ? '1' : '0');
      } catch {
        /* 무시 */
      }
    },
    [key],
  );
  return [v, set];
}

export function App() {
  const [route] = useState(() => parseRoute(location.pathname));
  const [mode, setMode] = useState<Mode>('analysis');
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(location.search).has('demo') ? 'result' : 'setup',
  );
  const [setup, setSetup] = useState<SetupState>(DEFAULT_SETUP);
  const [runSetup, setRunSetup] = useState<SetupState | null>(null);
  const [session, setSession] = useState<ScoreSession | null>(() =>
    new URLSearchParams(location.search).has('demo') ? createDemoSession() : null,
  );
  const [title, setTitle] = useState('');
  const [portrait, setPortrait] = usePref('ds.portrait', false);
  const [recMode, setRecMode] = usePref('ds.rec', false);
  const [muted, setMutedPref] = usePref('ds.muted', false);

  const refUrl = useObjectUrl(setup.refFile);
  const userUrl = useObjectUrl(setup.userFile);

  useEffect(() => setMuted(muted), [muted]);

  // H 키: 녹화 모드(디버그 UI 숨김) 토글
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') setRecMode(!recMode);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recMode, setRecMode]);

  // 라이브 녹화본 URL 정리
  useEffect(() => {
    const u = session?.source === 'live' ? session.userUrl : undefined;
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [session]);

  const update = (patch: Partial<SetupState>) => setSetup((s) => ({ ...s, ...patch }));

  const showResult = (s: ScoreSession) => {
    setSession(s);
    setScreen('result');
    window.scrollTo({ top: 0 });
  };

  const debug = !recMode;

  return (
    <div className={`app ${portrait ? 'portrait' : ''} ${recMode ? 'rec' : ''}`}>
      <div className="frame">
        <header className="header debug">
          <div
            className="logo"
            onClick={() => (route.name === 'home' ? setScreen('setup') : location.assign('/'))}
            role="button"
            tabIndex={0}
          >
            {BRAND.logo.src ? (
              <img className="logo-mark" src={BRAND.logo.src} alt="" />
            ) : (
              <span className="logo-mark" style={{ background: BRAND.logo.background, color: BRAND.logo.color }}>
                {BRAND.logo.mark}
              </span>
            )}
            <span>
              {BRAND.appName.prefix}
              <b style={{ color: BRAND.accent }}>{BRAND.appName.accent}</b>
            </span>
          </div>
          {route.name === 'home' && screen === 'setup' && (
            <nav className="tabs">
              <button className={mode === 'analysis' ? 'on' : ''} onClick={() => setMode('analysis')}>
                분석 모드
              </button>
              <button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>
                라이브 모드
              </button>
            </nav>
          )}
          <div className="toggles">
            <label className="chip" title="세로 9:16 레이아웃">
              <input type="checkbox" checked={portrait} onChange={(e) => setPortrait(e.target.checked)} /> 9:16
            </label>
            <label className="chip" title="효과음 끄기">
              <input type="checkbox" checked={muted} onChange={(e) => setMutedPref(e.target.checked)} /> 음소거
            </label>
            <button className="chip" onClick={() => setRecMode(true)} title="녹화용으로 디버그 UI 숨기기 (H)">
              🎥 녹화 모드
            </button>
          </div>
        </header>

        {recMode && (
          <button className="rec-exit" onClick={() => setRecMode(false)} title="녹화 모드 끄기 (H)">
            UI 보이기
          </button>
        )}

        <main>
          {route.name === 'challenge' && <ChallengePage id={route.id} debug={debug} />}
          {route.name === 'admin' && <AdminPage />}
          {route.name === 'home' && screen === 'setup' && (
            <SetupScreen
              mode={mode}
              setup={setup}
              update={update}
              refUrl={refUrl}
              userUrl={userUrl}
              onStart={() => {
                setRunSetup({ ...setup });
                setScreen(mode === 'analysis' ? 'analyzing' : 'live');
              }}
              onDemo={() => showResult(createDemoSession())}
            />
          )}
          {route.name === 'home' && screen === 'analyzing' && runSetup && refUrl && userUrl && (
            <AnalyzingScreen
              setup={runSetup}
              refUrl={refUrl}
              userUrl={userUrl}
              onDone={showResult}
              onCancel={() => setScreen('setup')}
            />
          )}
          {route.name === 'home' && screen === 'live' && runSetup && refUrl && (
            <LiveScreen
              setup={runSetup}
              refUrl={refUrl}
              onDone={showResult}
              onCancel={() => setScreen('setup')}
              debug={debug}
            />
          )}
          {route.name === 'home' && screen === 'result' && session && (
            <ResultScreen
              key={session.result.createdAt}
              session={session}
              title={title}
              onTitleChange={setTitle}
              onBack={() => setScreen('setup')}
              onRegenerateDemo={session.source === 'demo' ? () => showResult(createDemoSession()) : undefined}
              debug={debug}
            />
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}

function Footer() {
  const [before, handle, after] = footerParts();
  return (
    <footer className="footer">
      {before}
      <a href={BRAND.profileUrl} target="_blank" rel="noopener noreferrer" style={{ color: BRAND.accent }}>
        {handle}
      </a>
      {after}
    </footer>
  );
}
