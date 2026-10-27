/**
 * 배포 산출물(dist/) 무결성 검사.
 *
 * 빌드 결과물이 실제로 로드 가능한 확장인지 검증한다.
 * manifest.json 이 참조하는 파일이 없으면 Chrome 이 확장 로드에 실패하므로
 * 배포 전에 반드시 통과해야 한다.
 *
 * 검사 항목:
 *   1. dist/manifest.json 존재 및 MV3 필수 필드
 *   2. manifest 가 참조하는 모든 파일의 실존 여부
 *   3. 팝업/옵션 HTML 이 참조하는 script/stylesheet 실존 여부
 *   4. service worker 로더 체인 해석 가능 여부
 *   5. 원격 코드 로딩(웹스토어 정책 위반) 흔적 검사
 *
 * 사용법: node scripts/check-dist-integrity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function exists(rel) {
  return fs.existsSync(path.join(DIST, rel));
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ 가 없습니다. 먼저 npm run build 를 실행하세요.');
  process.exit(1);
}

// ── 1. manifest 기본 검증 ──────────────────────────────────
const manifestPath = path.join(DIST, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('dist/manifest.json 이 없습니다.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

if (manifest.manifest_version !== 3) fail(`manifest_version 이 3이 아닙니다: ${manifest.manifest_version}`);
if (!manifest.name) fail('name 필드가 없습니다.');
if (!manifest.version) fail('version 필드가 없습니다.');
if (!manifest.action?.default_popup && !manifest.action?.default_title) {
  warn('action.default_popup 이 없습니다 (툴바 아이콘 클릭 시 동작 없음)');
}
if (!manifest.minimum_chrome_version) {
  warn('minimum_chrome_version 이 없습니다 — 구버전 브라우저에서 content script 가 실패할 수 있습니다');
}

console.log('배포 산출물 무결성 검사');
console.log('─'.repeat(60));
console.log(`  manifest_version : ${manifest.manifest_version}`);
console.log(`  version          : ${manifest.version}`);
console.log(`  min_chrome       : ${manifest.minimum_chrome_version ?? '(미선언)'}`);

// ── 2. manifest 참조 파일 실존 검증 ────────────────────────
const referenced = [];
const push = (v, label) => {
  if (typeof v === 'string' && v) referenced.push({ rel: v, label });
};

push(manifest.background?.service_worker, 'background.service_worker');
for (const [size, rel] of Object.entries(manifest.icons ?? {})) push(rel, `icons.${size}`);
for (const [size, rel] of Object.entries(manifest.action?.default_icon ?? {})) {
  push(rel, `action.default_icon.${size}`);
}
push(manifest.action?.default_popup, 'action.default_popup');
push(manifest.options_ui?.page, 'options_ui.page');
for (const cs of manifest.content_scripts ?? []) {
  (cs.js ?? []).forEach((rel) => push(rel, 'content_scripts.js'));
  (cs.css ?? []).forEach((rel) => push(rel, 'content_scripts.css'));
}

let missingCount = 0;
for (const { rel, label } of referenced) {
  if (!exists(rel)) {
    fail(`${label} 참조 파일 누락: ${rel}`);
    missingCount++;
  }
}
console.log(`  참조 파일        : ${referenced.length}개 (누락 ${missingCount}개)`);

// web_accessible_resources 실존 검증
let warCount = 0;
for (const war of manifest.web_accessible_resources ?? []) {
  for (const rel of war.resources ?? []) {
    // 와일드카드(*)는 개별 검증 생략
    if (rel.includes('*')) continue;
    warCount++;
    if (!exists(rel)) fail(`web_accessible_resources 파일 누락: ${rel}`);
  }
}
console.log(`  WAR 리소스       : ${warCount}개`);

// ── 3. HTML 자산 참조 검증 ────────────────────────────────
let htmlChecked = 0;
const htmlRefs = [];

if (exists(manifest.action?.default_popup ?? '')) {
  htmlRefs.push(manifest.action.default_popup);
}
if (exists(manifest.options_ui?.page ?? '')) {
  htmlRefs.push(manifest.options_ui.page);
}

for (const htmlRel of new Set(htmlRefs)) {
  const html = fs.readFileSync(path.join(DIST, htmlRel), 'utf-8');
  const dir = path.dirname(htmlRel);
  const refs = [
    ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+href="([^"]+)"/g),
  ].map((m) => m[1]);

  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) {
      warn(`${htmlRel} 이 원격 리소스를 참조합니다: ${ref}`);
      continue;
    }
    // 절대경로(/assets/x) 와 상대경로 모두 dist 루트 기준으로 해석
    const resolved = ref.startsWith('/') ? ref.slice(1) : path.posix.join(dir, ref);
    if (!exists(resolved)) fail(`${htmlRel} 참조 파일 누락: ${ref} (-> ${resolved})`);
    htmlChecked++;
  }
}
console.log(`  HTML 자산 참조   : ${htmlChecked}개`);

// ── 4. service worker 로더 체인 해석 ─────────────────────
const swRel = manifest.background?.service_worker;
if (swRel && exists(swRel)) {
  const sw = fs.readFileSync(path.join(DIST, swRel), 'utf-8');
  const importMatch = sw.match(/import\s+['"](.+?)['"]/);
  if (importMatch) {
    const target = path.posix.join(path.dirname(swRel), importMatch[1]);
    if (!exists(target)) fail(`service worker 로더가 참조하는 번들 누락: ${target}`);
    else console.log(`  SW 로더 체인     : ${swRel} -> ${target} OK`);
  }
}

// ── 5. 원격 코드 로딩 흔적 검사 (웹스토어 정책) ──────────
const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(full);
  }
})(DIST);

let remoteRefs = 0;
for (const file of jsFiles) {
  const code = fs.readFileSync(file, 'utf-8');
  // eval 기반 동적 스크립트 삽입 패턴 (오탐 줄이기 위해 구체적 패턴만)
  if (/document\.createElement\(['"]script['"]\)/.test(code)) {
    warn(`동적 script 태그 생성 코드 발견: ${path.relative(DIST, file)} (웹스토어 심사 확인 필요)`);
    remoteRefs++;
  }
  if (/\beval\s*\(/.test(code)) {
    warn(`eval() 사용 발견: ${path.relative(DIST, file)} (웹스토어 정책 위반 가능)`);
    remoteRefs++;
  }
}
console.log(`  원격코드 흔적    : ${remoteRefs}건`);

// ── 결과 ─────────────────────────────────────────────────
console.log('─'.repeat(60));

if (warnings.length > 0) {
  console.log(`\n경고 ${warnings.length}건:`);
  warnings.forEach((w) => console.log(`  ! ${w}`));
}

if (errors.length > 0) {
  console.error(`\n오류 ${errors.length}건 — 배포 불가:`);
  errors.forEach((e) => console.error(`  X ${e}`));
  process.exit(1);
}

console.log(`\n무결성 검사 통과 (참조 파일 ${referenced.length + warCount}개, JS ${jsFiles.length}개)`);
process.exit(0);
