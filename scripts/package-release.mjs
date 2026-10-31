/**
 * 크롬 웹스토어 제출용 zip 패키지를 생성한다.
 *
 * - dist/ 내용만 포함한다 (소스/테스트/문서 제외)
 * - manifest.json 이 zip 루트에 오도록 한다 (크롬 웹스토어 요구사항)
 * - 외부 도구(pwsh/zip) 없이 Node 표준 라이브러리만 사용한다
 *
 * 사용법: node scripts/package-release.mjs [출력경로]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = import.meta.url;
const __dirname = path.dirname(fileURLToPath(__filename));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('dist/ 가 없습니다. 먼저 npm run build 를 실행하세요.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf-8'));
const version = manifest.version;
const outPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'release', `job-blocking-v2-v${version}.zip`);

/** dist 이하의 모든 파일을 상대경로(/)로 수집한다 */
function collectFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, base));
    } else if (entry.isFile()) {
      out.push({ full, rel: path.relative(base, full).split(path.sep).join('/') });
    }
  }
  return out;
}

// CRC32 테이블
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, day };
}

const files = collectFiles(DIST).sort((a, b) => a.rel.localeCompare(b.rel));

/** zip 로컬 파일 헤더 + 데이터 + 중앙 디렉터리를 직접 조립한다 */
const localParts = [];
const centralParts = [];
let offset = 0;
const now = new Date();
const { time: dosTime, day: dosDay } = dosDateTime(now);

for (const file of files) {
  const data = fs.readFileSync(file.full);
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const nameBuf = Buffer.from(file.rel, 'utf-8');

  // 로컬 파일 헤더
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // flags: UTF-8
  local.writeUInt16LE(8, 8); // method: deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDay, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra length

  localParts.push(local, nameBuf, compressed);

  // 중앙 디렉터리 엔트리
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8); // flags: UTF-8
  central.writeUInt16LE(8, 10); // method
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDay, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(offset, 42); // local header offset

  centralParts.push(central, nameBuf);
  offset += local.length + nameBuf.length + compressed.length;
}

const centralBuf = Buffer.concat(centralParts);
const localBuf = Buffer.concat(localParts);

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(localBuf.length, 16);
end.writeUInt16LE(0, 20);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([localBuf, centralBuf, end]));

const size = fs.statSync(outPath).size;
console.log(`패키지 생성: ${outPath}`);
console.log(`  버전: ${version}`);
console.log(`  크기: ${Math.round(size / 1024)} KB`);
console.log(`  엔트리: ${files.length}개`);
console.log(`  루트 manifest.json: ${files.some((f) => f.rel === 'manifest.json') ? 'OK' : 'MISSING'}`);

// 필수 파일 검증
const required = [
  'manifest.json',
  'service-worker-loader.js',
  'src/popup/index.html',
  'src/options/index.html',
  'src/welcome/index.html',
];
const missing = required.filter((r) => !files.some((f) => f.rel === r));
if (missing.length > 0) {
  console.error(`  ❌ 필수 파일 누락: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`  필수 파일: 전부 포함 OK`);
process.exit(0);
