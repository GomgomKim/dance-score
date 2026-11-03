import { useMemo, useState } from 'react';
import { GRADE_COLORS } from '../pose/grading';
import { PART_LABELS } from '../pose/similarity';
import type { ScoreSession } from '../lib/session';
import { ComparisonPlayer } from './ComparisonPlayer';
import { ResultCardPanel } from './ResultCardPanel';
import { ScoreReveal } from './ScoreReveal';
import { SegmentChart } from './SegmentChart';

interface Props {
  session: ScoreSession;
  title: string;
  onTitleChange: (t: string) => void;
  onBack: () => void;
  onRegenerateDemo?: () => void;
  debug: boolean;
}

export function ResultScreen({ session, title, onTitleChange, onBack, onRegenerateDemo, debug }: Props) {
  const { result } = session;
  const [replayKey, setReplayKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(result.worstSegmentIndex >= 0 ? result.worstSegmentIndex : null);
  const segment = useMemo(() => result.segments.find((s) => s.index === selected) ?? null, [result, selected]);

  if (result.segments.length === 0) {
    return (
      <div className="screen result">
        <div className="panel">
          <h2>채점할 수 있는 구간이 없어요</h2>
          <p>{result.comment}</p>
          <p className="hint">BPM과 시작 오프셋이 영상 길이 안에 있는지, 전신이 다 나오는지 확인해주세요.</p>
          <button className="btn primary" onClick={onBack}>
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen result">
      <section className="panel reveal-panel">
        {title && <div className="song-title">{title}</div>}
        <ScoreReveal
          score={result.totalScore}
          grade={result.totalGrade}
          replayKey={replayKey}
          onRevealed={() => setRevealed(true)}
        />
        <div className={`sub-scores ${revealed ? 'show' : ''}`}>
          <div>
            <span>포즈</span>
            <b>{Math.round(result.poseScore)}</b>
          </div>
          <div>
            <span>타이밍</span>
            <b>{Math.round(result.timingScore)}</b>
          </div>
          <div>
            <span>BPM</span>
            <b>{result.bpm}</b>
          </div>
        </div>
        <div className={`worst-comment ${revealed ? 'show' : ''}`}>
          <div className="worst-label">가장 많이 틀린 부위 · {PART_LABELS[result.worstPart]}</div>
          <div className="worst-text">“{result.comment}”</div>
        </div>
        <div className="row debug">
          <button
            className="btn ghost"
            onClick={() => {
              setRevealed(false);
              setReplayKey((k) => k + 1);
            }}
          >
            🔁 점수 공개 다시 보기
          </button>
          {onRegenerateDemo && (
            <button className="btn ghost" onClick={onRegenerateDemo}>
              🎲 다른 데모 결과
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>8카운트별 점수</h3>
        <SegmentChart
          segments={result.segments}
          worstIndex={result.worstSegmentIndex}
          selected={selected}
          onSelect={setSelected}
          revealed={revealed}
        />
        {segment && (
          <div className="segment-detail">
            <span className="grade-pill" style={{ background: GRADE_COLORS[segment.grade] }}>
              {segment.grade}
            </span>
            <b>{segment.index + 1}번째 8카운트</b> · {segment.score}점 (포즈 {Math.round(segment.poseScore)} / 타이밍{' '}
            {Math.round(segment.timingScore)}) — {segment.comment}
            {debug && (
              <span className="debug">
                {' '}
                · 평균 오차 {segment.meanOffsetBeats > 0 ? '+' : ''}
                {segment.meanOffsetBeats}박
              </span>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>
          {segment?.index === result.worstSegmentIndex ? '제일 못한 구간 다시 보기' : '구간 다시 보기'}
          <small className="debug"> · 막대를 누르면 다른 구간</small>
        </h3>
        <ComparisonPlayer session={session} segment={segment} title={title} debug={debug} />
      </section>

      <section className="panel">
        <h3>결과 카드</h3>
        <ResultCardPanel result={result} title={title} onTitleChange={onTitleChange} />
      </section>

      <div className="row center debug">
        <button className="btn ghost" onClick={onBack}>
          ← 처음으로
        </button>
      </div>
    </div>
  );
}
