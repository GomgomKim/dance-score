/** 영상/오디오 파일 → 모노 샘플 (브라우저 전용) */
export async function decodeAudioFile(file: Blob, maxSeconds = 90): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const len = Math.min(audio.length, Math.floor(maxSeconds * audio.sampleRate));
    const samples = new Float32Array(len);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < len; i++) samples[i] += ch[i] / audio.numberOfChannels;
    }
    return { samples, sampleRate: audio.sampleRate };
  } finally {
    void ctx.close();
  }
}
