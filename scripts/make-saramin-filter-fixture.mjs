/**
 * 사람인 목록 페이지에서 "검색 필터 패널" 영역만 추출해 소형 픽스처를 만든다.
 *
 * 목적:
 *   필터 패널(.main_option)이 광고 숨김 로직에 의해 display:none 되는 회귀를
 *   저장소 내 픽스처로 영구 검증하기 위함.
 *
 * 원본(saramin_filter_check.html, 2.2MB)에서 .main_option 블록만 잘라낸다.
 * DOM 구조/클래스는 원본 그대로 보존하고 주변 광고/카드 영역만 제외한다.
 *
 * 사용법: node scripts/make-saramin-filter-fixture.mjs [원본경로] [출력경로]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const srcPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(ROOT, '../saramin_filter_check.html');
const outPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(ROOT, 'tests/fixtures/saramin_filter_panel.html');

if (!fs.existsSync(srcPath)) {
  console.error('원본 HTML 이 없습니다:', srcPath);
  console.error('먼저 다음을 실행하세요:');
  console.error('  npm run fetch:sample -- "https://www.saramin.co.kr/zf_user/jobs/list/domestic" saramin_filter_check.html 15');
  process.exit(1);
}

const html = fs.readFileSync(srcPath, 'utf-8');

/** start 위치에서 시작하는 div 요소의 끝 위치를 깊이 추적해 찾는다 */
function findDivEnd(source, start) {
  let depth = 0;
  const re = /<(\/?)div\b[^>]*>/gi;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(source)) !== null) {
    if (m[1] === '/') {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

// .main_option 블록 찾기
const openTagRe = /<div[^>]*class="[^"]*\bmain_option\b[^"]*"[^>]*>/i;
const m = openTagRe.exec(html);
if (!m) {
  console.error('.main_option 블록을 찾지 못했습니다. 사람인 DOM 구조가 바뀌었을 수 있습니다.');
  process.exit(1);
}
const start = m.index;
const end = findDivEnd(html, start);
if (end === -1) {
  console.error('.main_option 블록의 끝을 찾지 못했습니다.');
  process.exit(1);
}

const block = html.slice(start, end);

// 필터 패널이 실제로 포함하는 컨트롤 수 집계 (진단 출력)
const count = (re) => (block.match(re) || []).length;
const stats = {
  'wrap_section_contents': count(/wrap_section_contents/g),
  'area_section': count(/area_section/g),
  'job_category_section': count(/job_category_section/g),
  'keyword_section': count(/keyword_section/g),
  'detail_section': count(/detail_section/g),
  '<input': count(/<input\b/gi),
  '<select': count(/<select\b/gi),
  '<button': count(/<button\b/gi),
  '파워링크(.powerlink)': count(/powerlink/g),
  '상품배너(list_product)': count(/list_product/g),
};

const fixture = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>사람인 목록 — 검색 필터 패널 (회귀 검증 픽스처)</title></head>
<body>
<!-- 원본: https://www.saramin.co.kr/zf_user/jobs/list/domestic 의 .main_option 블록 -->
${block}
</body>
</html>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, fixture, 'utf-8');

const size = fs.statSync(outPath).size;
console.log('필터 패널 픽스처 생성 완료');
console.log('  출력:', outPath);
console.log(`  크기: ${Math.round(size / 1024)} KB (원본 ${Math.round(html.length / 1024)} KB)`);
console.log('  내부 구성:');
for (const [k, v] of Object.entries(stats)) {
  if (v > 0) console.log(`    ${k}: ${v}`);
}
process.exit(0);
