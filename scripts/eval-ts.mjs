#!/usr/bin/env node
/**
 * @file eval-ts.mjs
 * TypeScript 코드 조각이나 .ts 파일을 안전하게 실행하는 유틸리티.
 * Windows PowerShell / cmd.exe 환경에서 multiline 줄바꿈에 따른 REPL 무한 대기(Hang) 및
 * stdin 블로킹 문제를 방지하기 위해 stdio[0]='ignore' 및 10초 타임아웃을 강제합니다.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
사용법:
  node scripts/eval-ts.mjs "TS_CODE"
  node scripts/eval-ts.mjs <FILE_PATH.ts>
  npm run eval:ts -- "TS_CODE"

예시:
  npm run eval:ts -- "import { parseClosingDateToTimestamp } from './src/utils/date'; console.log(parseClosingDateToTimestamp('~ 12/22(화)'));"
`);
  process.exit(0);
}

const input = args.join(' ').trim();
const tsxCliPath = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

if (!fs.existsSync(tsxCliPath)) {
  console.error('[eval-ts] tsx 패키지가 설치되어 있지 않습니다. npm install -D tsx 를 실행해주세요.');
  process.exit(1);
}

// 입력이 실제 존재하는 .ts 파일인지 확인
const isFile = fs.existsSync(path.resolve(process.cwd(), args[0]));
const spawnArgs = isFile
  ? [tsxCliPath, path.resolve(process.cwd(), args[0]), ...args.slice(1)]
  : [tsxCliPath, '-e', input];

// Windows에서 직접 node.exe를 호출하여 cmd.exe/npx.cmd를 거치지 않음
const child = spawn(process.execPath, spawnArgs, {
  cwd: process.cwd(),
  stdio: ['ignore', 'inherit', 'inherit'], // stdin을 닫아 REPL 진입 및 키보드 입력 무한 대기를 원천 차단
  windowsHide: true,
  env: {
    ...process.env,
    NODE_ENV: 'test',
  },
});

// 최대 10초 타임아웃 강제
const timeoutMs = 10000;
const timer = setTimeout(() => {
  console.error(`\n[eval-ts] 오류: ${timeoutMs / 1000}초 타임아웃을 초과하여 프로세스를 강제 종료합니다.`);
  child.kill('SIGKILL');
  process.exit(1);
}, timeoutMs);

child.on('close', (code) => {
  clearTimeout(timer);
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  clearTimeout(timer);
  console.error('[eval-ts] 실행 오류:', err.message);
  process.exit(1);
});
