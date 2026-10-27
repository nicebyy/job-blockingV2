/**
 * 수집한 "렌더링 완료 DOM" 픽스처를 테스트용으로 정리한다.
 *
 * - <script> 태그 제거: happy-dom 에서 외부 스크립트 로딩 시도/에러를 막는다
 *   (DOM 구조는 이미 렌더링된 상태이므로 스크립트가 필요 없다)
 * - <link rel=preload/prefetch>, <style> 은 유지해도 무방하나 크기 절감을 위해 link 만 제거
 * - 원본 구조/클래스는 절대 변경하지 않는다
 *
 * 사용법: node scripts/clean-rendered-fixture.mjs <입력.html> <출력.html>
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('사용법: node scripts/clean-rendered-fixture.mjs <입력.html> <출력.html>');
  process.exit(1);
}

const input = path.resolve(inputArg);
const output = path.resolve(outputArg);
const html = fs.readFileSync(input, 'utf-8');

const before = html.length;

const cleaned = html
  // 외부/인라인 스크립트 전부 제거
  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  // preload/prefetch/dns-prefetch 링크 제거 (네트워크 유발)
  .replace(/<link\b[^>]*rel=["']?(preload|prefetch|dns-prefetch|preconnect)["']?[^>]*>/gi, '')
  // iframe 제거
  .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  // noscript 제거
  .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

fs.writeFileSync(output, cleaned, 'utf-8');

const after = cleaned.length;
console.log(`정리 완료: ${path.basename(output)}`);
console.log(`  ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
process.exit(0);
