/** 9:16 결과 카드 이미지 미리보기/저장 */
import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../pose/types';
import { canvasToBlob, drawResultCard, ensureFonts } from '../lib/resultCard';
import { dateStamp, shareOrDownload } from '../lib/download';

interface Props {
  result: AnalysisResult;
  title: string;
  onTitleChange: (t: string) => void;
}

export function ResultCardPanel({ result, title, onTitleChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [handle, setHandle] = useState(() => {
    try {
      return localStorage.getItem('ds.handle') ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    let cancelled = false;
    void ensureFonts().then(() => {
      if (!cancelled && canvasRef.current) drawResultCard(canvasRef.current, result, { title, handle });
    });
    return () => {
      cancelled = true;
    };
  }, [result, title, handle]);

  async function save() {
    const canvas = canvasRef.current!;
    await ensureFonts();
    drawResultCard(canvas, result, { title, handle });
    const blob = await canvasToBlob(canvas);
    await shareOrDownload(blob, `dance-score-${dateStamp()}.png`);
  }

  return (
    <div className="card-panel">
      <canvas ref={canvasRef} className="card-preview" />
      <div className="card-form">
        <label className="field">
          <span>곡 제목</span>
          <input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="예: 뉴진스 - Supernatural" />
        </label>
        <label className="field">
          <span>닉네임 (선택)</span>
          <input
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              try {
                localStorage.setItem('ds.handle', e.target.value);
              } catch {
                /* 무시 */
              }
            }}
            placeholder="@my_dance"
          />
        </label>
        <button className="btn primary big" onClick={() => void save()}>
          📸 결과 카드 저장
        </button>
      </div>
    </div>
  );
}
