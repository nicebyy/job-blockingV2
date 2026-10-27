import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const iconBase64 = fs.readFileSync(path.join(rootDir, 'public/icons/icon-128.png')).toString('base64');
const iconDataUrl = `data:image/png;base64,${iconBase64}`;

const smallHtml = `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 440px;
    height: 280px;
    background: radial-gradient(circle at 50% 15%, #1d4ed8 0%, #0f172a 55%, #050811 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Pretendard, sans-serif;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 22px 20px 18px 20px;
    overflow: hidden;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .bg-grid {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
  }
  .glow {
    position: absolute;
    width: 260px;
    height: 260px;
    top: -50px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, transparent 70%);
    pointer-events: none;
  }
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 2;
    text-align: center;
  }
  .icon-wrapper {
    width: 68px;
    height: 68px;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.9);
    border: 2px solid rgba(96, 165, 250, 0.5);
    box-shadow: 0 0 28px rgba(59, 130, 246, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
  }
  .icon-wrapper img {
    width: 56px;
    height: 56px;
  }
  .title {
    font-size: 25px;
    font-weight: 900;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, #ffffff 40%, #bfdbfe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .subtitle {
    font-size: 14px;
    font-weight: 700;
    color: #38bdf8;
    margin-top: 3px;
    letter-spacing: -0.3px;
  }
  .chips {
    display: flex;
    gap: 7px;
    z-index: 2;
    margin-top: 4px;
  }
  .chip {
    font-size: 11.5px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .chip-block {
    background: rgba(30, 41, 59, 0.9);
    border: 1px solid #64748b;
    color: #f1f5f9;
  }
  .chip-rating {
    background: rgba(6, 78, 59, 0.9);
    border: 1px solid #10b981;
    color: #6ee7b7;
  }
  .chip-ad {
    background: rgba(127, 29, 29, 0.9);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }
  .footer {
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 7px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 11px;
    color: #cbd5e1;
    font-weight: 600;
  }
  .footer span {
    color: #38bdf8;
    font-weight: 800;
  }
</style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="glow"></div>
  <div class="header">
    <div class="icon-wrapper">
      <img src="${iconDataUrl}" alt="Job Blocking V2" />
    </div>
    <div class="title">Job Blocking V2</div>
    <div class="subtitle">채용 공고 & 블랙기업 원클릭 필터링</div>
  </div>
  
  <div class="chips">
    <div class="chip chip-block">🛡️ 회사·공고 차단</div>
    <div class="chip chip-rating">⭐ 잡플·블라인드 평점</div>
    <div class="chip chip-ad">🚫 광고·추천 숨김</div>
  </div>

  <div class="footer">
    <span>5대 플랫폼</span> 원티드 · 사람인 · 잡코리아 · 리멤버 · 점핏
  </div>
</body>
</html>
`;

const marqueeHtml = `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1400px;
    height: 560px;
    background: #070b13;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Pretendard, sans-serif;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 70px;
    overflow: hidden;
    position: relative;
  }
  /* Ambient lighting */
  .glow-left {
    position: absolute;
    width: 650px;
    height: 650px;
    left: -120px;
    top: -120px;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.26) 0%, transparent 65%);
    pointer-events: none;
  }
  .glow-right {
    position: absolute;
    width: 750px;
    height: 750px;
    right: -120px;
    bottom: -160px;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.18) 0%, transparent 65%);
    pointer-events: none;
  }
  .bg-grid {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }

  /* Left Hero Content */
  .left-content {
    width: 670px;
    z-index: 2;
    display: flex;
    flex-direction: column;
  }
  .badge-tag {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(30, 58, 138, 0.5);
    border: 1px solid rgba(96, 165, 250, 0.45);
    padding: 6px 14px;
    border-radius: 9999px;
    width: fit-content;
    font-size: 12.5px;
    font-weight: 700;
    color: #93c5fd;
    letter-spacing: 0.5px;
    margin-bottom: 18px;
  }
  .badge-tag .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 10px #38bdf8;
  }
  .title-group {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 10px;
  }
  .logo-img {
    width: 66px;
    height: 66px;
    border-radius: 17px;
    border: 2px solid rgba(59, 130, 246, 0.55);
    box-shadow: 0 0 25px rgba(59, 130, 246, 0.45);
  }
  .main-title {
    font-size: 50px;
    font-weight: 900;
    letter-spacing: -1.2px;
    background: linear-gradient(135deg, #ffffff 30%, #bfdbfe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1.1;
  }
  .headline {
    font-size: 24px;
    font-weight: 800;
    color: #38bdf8;
    letter-spacing: -0.5px;
    margin-bottom: 14px;
  }
  .description {
    font-size: 15px;
    color: #94a3b8;
    line-height: 1.6;
    margin-bottom: 24px;
  }
  .features-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 18px;
    margin-bottom: 28px;
  }
  .feature-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: #e2e8f0;
    font-weight: 600;
  }
  .feature-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .icon-blue { background: rgba(37, 99, 235, 0.25); border: 1px solid #2563eb; color: #60a5fa; }
  .icon-green { background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; color: #34d399; }
  .icon-amber { background: rgba(245, 158, 11, 0.25); border: 1px solid #f59e0b; color: #fbbf24; }
  .icon-purple { background: rgba(147, 51, 234, 0.25); border: 1px solid #9333ea; color: #c084fc; }

  .platforms-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #94a3b8;
  }
  .platforms-bar span.label {
    font-weight: 700;
    color: #cbd5e1;
  }
  .platform-tag {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.14);
    padding: 5px 11px;
    border-radius: 7px;
    font-size: 12.5px;
    font-weight: 700;
    color: #f1f5f9;
  }

  /* Right Visual / UI Mockup */
  .right-visual {
    width: 530px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  .mockup-card {
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(20px);
    border: 1.5px solid rgba(255, 255, 255, 0.16);
    border-radius: 18px;
    padding: 22px 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9);
    position: relative;
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .company-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .company-name {
    font-size: 17px;
    font-weight: 800;
    color: #ffffff;
  }
  .pill-ratings {
    display: flex;
    gap: 6px;
  }
  .rating-badge {
    font-size: 11.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .rating-jobplanet {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
  }
  .rating-blind {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  /* Floating Pill Toolbar */
  .floating-pill {
    display: flex;
    align-items: center;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 9999px;
    padding: 5px 11px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    gap: 8px;
  }
  .btn-hide {
    color: #f59e0b;
    font-size: 12px;
    font-weight: 700;
  }
  .btn-divider {
    color: #475569;
    font-size: 11px;
  }
  .btn-block {
    color: #ef4444;
    font-size: 12px;
    font-weight: 700;
  }

  .card-title {
    font-size: 19px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 8px;
    line-height: 1.35;
  }
  .card-meta {
    font-size: 13px;
    color: #94a3b8;
    display: flex;
    gap: 12px;
    font-weight: 500;
  }

  /* Blurred card preview */
  .blurred-card {
    background: rgba(30, 41, 59, 0.55);
    border: 1px dashed rgba(239, 68, 68, 0.5);
    border-radius: 14px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
  }
  .blurred-text {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fca5a5;
  }
  .unblock-chip {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: #fca5a5;
    padding: 2px 8px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  /* Stats mini bar */
  .stats-widget {
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13.5px;
  }
  .stat-group {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #cbd5e1;
    font-weight: 600;
  }
  .stat-num {
    color: #38bdf8;
    font-weight: 800;
    font-size: 15px;
  }
</style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="glow-left"></div>
  <div class="glow-right"></div>

  <!-- Left Column -->
  <div class="left-content">
    <div class="badge-tag">
      <div class="dot"></div>
      CHROME EXTENSION · MANIFEST V3 · 100% LOCAL PRIVACY
    </div>

    <div class="title-group">
      <img src="${iconDataUrl}" class="logo-img" alt="Logo" />
      <div class="main-title">Job Blocking V2</div>
    </div>

    <div class="headline">더 쾌적한 취업·이직 탐색의 시작</div>
    
    <div class="description">
      불필요한 공고와 블랙리스트 기업은 원클릭으로 흔적 없이 숨기고,<br>
      잡플래닛·블라인드 실시간 기업 평점과 함께 진짜 원하는 공고만 집중 탐색하세요.
    </div>

    <div class="features-list">
      <div class="feature-item">
        <div class="feature-icon icon-blue">⚡</div>
        <span>원클릭 [공고숨김] & [회사차단] 플로팅 툴바</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon icon-green">⭐</div>
        <span>잡플래닛·블라인드 실시간 듀얼 평점 뱃지</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon icon-amber">🧹</div>
        <span>무한 스크롤 자동 변환 & 빈 화면 자동 채우기</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon icon-purple">🛡️</div>
        <span>상단 적극채용·TOP헤드라인·광고 자동 숨김</span>
      </div>
    </div>

    <div class="platforms-bar">
      <span class="label">지원 플랫폼</span>
      <span class="platform-tag">원티드</span>
      <span class="platform-tag">사람인</span>
      <span class="platform-tag">잡코리아</span>
      <span class="platform-tag">리멤버</span>
      <span class="platform-tag">점핏</span>
    </div>
  </div>

  <!-- Right Column / UI Mockup -->
  <div class="right-visual">
    <div class="mockup-card">
      <div class="card-top">
        <div class="company-info">
          <span class="company-name">(주)카카오</span>
          <div class="pill-ratings">
            <span class="rating-badge rating-jobplanet">★ 잡플 4.2</span>
            <span class="rating-badge rating-blind">★ 블라인드 4.1</span>
          </div>
        </div>
        <div class="floating-pill">
          <span class="btn-hide">👁️ 공고숨김</span>
          <span class="btn-divider">|</span>
          <span class="btn-block">🚫 회사차단</span>
        </div>
      </div>
      <div class="card-title">시니어 프론트엔드 엔지니어 (React / TypeScript)</div>
      <div class="card-meta">
        <span>📍 경기 성남시 판교</span>
        <span>💼 경력 5~10년</span>
        <span>⏱️ D-14 마감</span>
      </div>
    </div>

    <div class="blurred-card">
      <div class="blurred-text">
        <span>🚫</span>
        <span>차단된 기업의 채용 공고입니다 (은닉/블러 처리됨)</span>
      </div>
      <span class="unblock-chip">원클릭 해제</span>
    </div>

    <div class="stats-widget">
      <div class="stat-group">
        <span>🛡️ 숨긴 공고:</span>
        <span class="stat-num">14건</span>
      </div>
      <div class="stat-group">
        <span>🚫 차단 기업:</span>
        <span class="stat-num">6곳</span>
      </div>
      <div class="stat-group">
        <span>✨ 제거된 광고:</span>
        <span class="stat-num">5개</span>
      </div>
    </div>
  </div>
</body>
</html>
`;

async function main() {
  console.log('Launching headless browser...');
  const browser = await chromium.launch({ headless: true });

  const outDir = path.join(rootDir, 'store-assets');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Small Promo Tile (440 x 280)
  console.log('Rendering Small Promo Tile (440x280)...');
  const pageSmall = await browser.newPage({
    viewport: { width: 440, height: 280 },
    deviceScaleFactor: 1,
  });
  await pageSmall.setContent(smallHtml, { waitUntil: 'networkidle' });
  await pageSmall.screenshot({
    path: path.join(outDir, 'small-promo-tile-440x280.png'),
    type: 'png',
  });
  await pageSmall.close();

  // 2. Marquee Promo Tile (1400 x 560)
  console.log('Rendering Marquee Promo Tile (1400x560)...');
  const pageMarquee = await browser.newPage({
    viewport: { width: 1400, height: 560 },
    deviceScaleFactor: 1,
  });
  await pageMarquee.setContent(marqueeHtml, { waitUntil: 'networkidle' });
  await pageMarquee.screenshot({
    path: path.join(outDir, 'marquee-promo-tile-1400x560.png'),
    type: 'png',
  });
  await pageMarquee.close();

  await browser.close();
  console.log('✅ Promo tiles successfully updated in store-assets/ !');
}

main().catch((err) => {
  console.error('Failed to generate promo tiles:', err);
  process.exit(1);
});
