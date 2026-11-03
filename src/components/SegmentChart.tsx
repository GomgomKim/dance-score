/** 8카운트별 점수 막대 그래프 */
import { GRADE_COLORS } from '../pose/grading';
import type { SegmentResult } from '../pose/types';

interface Props {
  segments: SegmentResult[];
  worstIndex: number;
  selected: number | null;
  onSelect: (index: number) => void;
  /** true가 되면 막대가 자라는 애니메이션 */
  revealed: boolean;
}

export function SegmentChart({ segments, worstIndex, selected, onSelect, revealed }: Props) {
  return (
    <div className="chart" role="list" aria-label="8카운트별 점수">
      {segments.map((s, i) => (
        <button
          key={s.index}
          role="listitem"
          className={`bar ${selected === s.index ? 'selected' : ''} ${s.index === worstIndex ? 'worst' : ''}`}
          onClick={() => onSelect(s.index)}
          title={`${s.index + 1}번째 8카운트 · ${s.score}점 · ${s.grade}\n${s.comment}`}
        >
          <span className="bar-score">{Math.round(s.score)}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{
                height: revealed ? `${Math.max(3, s.score)}%` : '0%',
                background: GRADE_COLORS[s.grade],
                transitionDelay: `${i * 70}ms`,
              }}
            />
          </span>
          <span className="bar-label">{s.index + 1}</span>
          {s.index === worstIndex && <span className="bar-worst">최저</span>}
        </button>
      ))}
    </div>
  );
}
