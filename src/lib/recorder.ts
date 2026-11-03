/** MediaRecorder 헬퍼 */

const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function extensionFor(mime: string) {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

export interface Recording {
  stop(): Promise<Blob>;
}

export function startRecording(stream: MediaStream, bitsPerSecond = 8_000_000): Recording {
  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: bitsPerSecond } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start(250);
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' }));
        if (rec.state !== 'inactive') rec.stop();
        else resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
      }),
  };
}

const audioTaps = new WeakMap<HTMLMediaElement, { ctx: AudioContext; dest: MediaStreamAudioDestinationNode }>();

/**
 * 영상 소리를 녹화 스트림에 넣기 위한 오디오 트랙.
 * MediaElementSource는 요소당 한 번만 만들 수 있어서 캐시해둔다.
 */
export function audioTrackOf(media: HTMLMediaElement): MediaStreamTrack | null {
  try {
    let tap = audioTaps.get(media);
    if (!tap) {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(media);
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ctx.destination);
      tap = { ctx, dest };
      audioTaps.set(media, tap);
    }
    if (tap.ctx.state === 'suspended') void tap.ctx.resume();
    return tap.dest.stream.getAudioTracks()[0] ?? null;
  } catch (e) {
    console.warn('오디오 트랙을 가져오지 못했어요', e);
    return null;
  }
}

/**
 * Chrome의 MediaRecorder webm은 duration이 Infinity라 seek이 안 되는 문제 우회.
 * 끝으로 한 번 점프시키면 브라우저가 길이를 계산한다.
 */
export function fixInfiniteDuration(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (Number.isFinite(video.duration)) {
      resolve();
      return;
    }
    const onChange = () => {
      if (!Number.isFinite(video.duration)) return;
      video.removeEventListener('durationchange', onChange);
      video.currentTime = 0;
      resolve();
    };
    video.addEventListener('durationchange', onChange);
    video.currentTime = 1e101;
    setTimeout(resolve, 3000);
  });
}
