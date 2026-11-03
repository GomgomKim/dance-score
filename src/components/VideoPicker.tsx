import { forwardRef } from 'react';

interface Props {
  label: string;
  file: File | null;
  url: string | null;
  onFile: (f: File | null) => void;
  mirror?: boolean;
  onMirror?: (m: boolean) => void;
  overlay?: React.ReactNode;
}

/** 영상 업로드 + 미리보기 */
export const VideoPicker = forwardRef<HTMLVideoElement, Props>(function VideoPicker(
  { label, file, url, onFile, mirror, onMirror, overlay },
  ref,
) {
  return (
    <div className="picker">
      <div className="picker-head">
        <b>{label}</b>
        {onMirror && (
          <label className="chip">
            <input type="checkbox" checked={mirror} onChange={(e) => onMirror(e.target.checked)} /> 좌우 반전 (거울 모드)
          </label>
        )}
      </div>
      {url ? (
        <div className="picker-preview">
          <video
            ref={ref}
            src={url}
            controls
            playsInline
            preload="metadata"
            style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
          />
          {overlay}
        </div>
      ) : (
        <label className="dropzone">
          <input type="file" accept="video/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} hidden />
          <span className="dropzone-icon">＋</span>
          <span>영상 파일 선택</span>
          <small>영상은 서버로 전송되지 않고 브라우저 안에서만 분석돼요</small>
        </label>
      )}
      {file && (
        <div className="picker-file">
          <span title={file.name}>{file.name}</span>
          <button className="link" onClick={() => onFile(null)}>
            바꾸기
          </button>
        </div>
      )}
    </div>
  );
});
