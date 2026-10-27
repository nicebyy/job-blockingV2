/**
 * 사람인 검색목록 샘플에서 테스트 픽스처를 생성한다.
 *
 * 원본 샘플(saramin_search_sample.html)은 2.4MB 로 저장소에 넣기 부적절하므로,
 * 실제 DOM 구조(item_recruit 카드 + 컨테이너)를 그대로 보존한 축소 픽스처를 만든다.
 * 셀렉터/구조를 임의로 바꾸지 않고 원본 HTML 에서 그대로 잘라낸다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/ -> worktree 루트
const WORKTREE_ROOT = path.resolve(__dirname, '..');
// 워크트리 경로(.agents/worktrees/test/platform-integration)에서 메인 저장소 루트로 이동
const REPO_ROOT = path.resolve(WORKTREE_ROOT, '../../../..');
const SRC = path.join(REPO_ROOT, 'saramin_search_sample.html');
const OUT = path.join(WORKTREE_ROOT, 'tests/fixtures/saramin_search.html');
const CARD_LIMIT = 8;

if (!fs.existsSync(SRC)) {
  console.error('원본 샘플이 없습니다:', SRC);
  process.exit(1);
}

const html = fs.readFileSync(SRC, 'utf-8');

const listStart = html.indexOf('id="recruit_info_list"');
if (listStart === -1) {
  console.error('#recruit_info_list 를 찾지 못했습니다.');
  process.exit(1);
}

// 카드 시작 위치 수집
const cardStarts = [];
let searchFrom = listStart;
while (cardStarts.length < CARD_LIMIT) {
  const idx = html.indexOf('class="item_recruit"', searchFrom);
  if (idx === -1) break;
  const divStart = html.lastIndexOf('<div', idx);
  cardStarts.push(divStart === -1 ? idx : divStart);
  searchFrom = idx + 10;
}

if (cardStarts.length === 0) {
  console.error('item_recruit 카드를 찾지 못했습니다.');
  process.exit(1);
}

// div 깊이를 추적해 요소 종료 위치 계산
function findElementEnd(source, start) {
  let depth = 0;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let m;
  while ((m = tagRe.exec(source)) !== null) {
    if (m[1] === '/') {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

const lastCardEnd = findElementEnd(html, cardStarts[cardStarts.length - 1]);
if (lastCardEnd === -1) {
  console.error('카드 종료 지점을 찾지 못했습니다.');
  process.exit(1);
}

const firstCardStart = cardStarts[0];
const containerStart = html.lastIndexOf('<div', listStart);
const prefix = html.slice(containerStart, firstCardStart);
const cardsHtml = html.slice(firstCardStart, lastCardEnd);

const fixture = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>사람인 채용검색 (통합테스트 픽스처)</title></head>
<body>
<div id="default_list_wrap">
${prefix}${cardsHtml}
</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, fixture, 'utf-8');

const size = fs.statSync(OUT).size;
console.log(`생성 완료: ${OUT}`);
console.log(`크기: ${Math.round(size / 1024)} KB`);
console.log(`카드 수: ${cardStarts.length}`);
process.exit(0);
