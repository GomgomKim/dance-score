// public/challenges/sample.json 생성 (vite로 TS 모듈을 바로 로드)
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { makeSampleChallenge } = await server.ssrLoadModule('/src/challenge/sample.ts');
  const file = makeSampleChallenge();
  const out = 'public/challenges/sample.json';
  writeFileSync(out, JSON.stringify(file));
  console.log(`${out} (${file.poses.data.length} frames)`);
} finally {
  await server.close();
}
