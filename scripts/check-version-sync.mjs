/**
 * 버전 일관성 검사.
 *
 * 배포 버전이 여러 파일에 중복 정의되어 있어, 한 곳만 갱신하면
 * Chrome 웹스토어 업로드 버전과 확장 내부 표시 버전이 어긋난다.
 * CI 에서 이 스크립트로 4개 위치가 모두 같은지 검증한다.
 *
 * 검사 대상:
 *   - package.json                       version
 *   - package-lock.json                  version + packages[""].version
 *   - src/manifest.json                  version  (실제 배포 버전)
 *   - src/constants/index.ts             APP_INFO.VERSION
 *
 * 사용법: node scripts/check-version-sync.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
}

function readAppInfoVersion() {
  const src = fs.readFileSync(path.join(ROOT, 'src/constants/index.ts'), 'utf-8');
  const m = src.match(/VERSION:\s*'([^']+)'/);
  return m ? m[1] : null;
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const manifest = readJson('src/manifest.json');
const appInfoVersion = readAppInfoVersion();

const versions = {
  'package.json': pkg.version,
  'package-lock.json (version)': lock.version,
  'package-lock.json (packages[""])': lock.packages?.['']?.version,
  'src/manifest.json': manifest.version,
  'src/constants/index.ts (APP_INFO.VERSION)': appInfoVersion,
};

console.log('버전 일관성 검사');
console.log('─'.repeat(56));

const unique = new Set(Object.values(versions));
for (const [file, version] of Object.entries(versions)) {
  const ok = version && version === pkg.version;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${version ?? '(없음)'}  ${file}`);
}

console.log('─'.repeat(56));

if (unique.size !== 1 || !pkg.version) {
  console.error('\n버전이 일치하지 않습니다. 아래 위치를 모두 같은 값으로 갱신하세요:');
  for (const [file, version] of Object.entries(versions)) {
    if (version !== pkg.version) console.error(`  - ${file}: ${version ?? '(없음)'} -> ${pkg.version}`);
  }
  console.error('\n힌트: npm version <x.y.z> --no-git-tag-version 실행 후');
  console.error('      src/manifest.json 과 src/constants/index.ts 도 수동 갱신');
  process.exit(1);
}

// Chrome 웹스토어는 최대 4자리 숫자(0~65535) 버전만 허용한다
const parts = pkg.version.split('.');
const validSemver = parts.length >= 2 && parts.length <= 4 && parts.every((p) => /^\d+$/.test(p));
if (!validSemver) {
  console.error(`\nChrome 확장 버전 형식이 올바르지 않습니다: ${pkg.version}`);
  console.error('  숫자 2~4개를 점으로 구분해야 합니다 (예: 0.2.0)');
  process.exit(1);
}

console.log(`\n모든 위치가 ${pkg.version} 으로 일치합니다.`);
process.exit(0);
