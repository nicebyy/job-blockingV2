#!/usr/bin/env node
/**
 * @file fetch-sample.mjs
 * 채용 사이트(사람인, 잡코리아, 원티드 등)의 HTML 샘플을 안전하게 다운로드하는 유틸리티.
 * Windows PowerShell 5.1 Invoke-WebRequest의 mshtml 엔진 무한 행잉(Hang) 및 봇 탐지 문제를 방지합니다.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
사용법:
  node scripts/fetch-sample.mjs <URL> [저장경로] [타임아웃(초)]
  npm run fetch:sample -- "<URL>" [저장경로] [타임아웃(초)]

예시:
  npm run fetch:sample -- "https://www.saramin.co.kr/zf_user/search?loc_mcd=104000&cat_mcls=2" saramin_search_sample.html 10
`);
  process.exit(0);
}

const targetUrl = args[0];
const outputPath = args[1] || 'sample_download.html';
const timeoutSec = Number(args[2]) || 10;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function run() {
  console.log(`[FetchSample] 요청 시작: ${targetUrl}`);
  console.log(`[FetchSample] 타임아웃 제한: ${timeoutSec}초`);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutSec * 1000),
    });

    if (!response.ok) {
      console.warn(`[FetchSample] 경고: HTTP 상태 코드 ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const resolvedPath = path.resolve(process.cwd(), outputPath);
    await fs.writeFile(resolvedPath, html, 'utf-8');

    const sizeKb = (Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1);
    console.log(`[FetchSample] 성공! 저장 완료: ${resolvedPath} (${sizeKb} KB, HTTP ${response.status})`);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.error(`[FetchSample] 오류: ${timeoutSec}초 타임아웃 초과로 요청이 안전하게 중단되었습니다.`);
    } else {
      console.error(`[FetchSample] 오류 발생:`, err.message);
    }
    process.exit(1);
  }
}

run();
