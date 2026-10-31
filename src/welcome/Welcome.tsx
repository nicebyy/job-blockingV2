import React, { useState } from 'react';
import { WELCOME_CONFIG, SUPPORT_CONFIG, INLINE_BUTTON_CONFIG } from '../constants';

export const Welcome: React.FC = () => {
  const [demoState, setDemoState] = useState<'normal' | 'job_hidden' | 'company_blocked'>('normal');

  const handleOpenOptions = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      window.open(chrome.runtime.getURL('src/options/index.html'), '_blank');
    }
  };

  return (
    <div className="welcome-page">
      <div className="welcome-container">
        {/* 상단 히어로 배너 */}
        <header className="welcome-hero">
          <div className="welcome-badge">
            <span className="welcome-badge-dot" />
            {WELCOME_CONFIG.LABELS.BADGE_TEXT}
          </div>
          <div className="welcome-logo-row">
            <img src="/icons/icon-48.png" alt="Job Blocking V2" className="welcome-logo" />
            <h1>{WELCOME_CONFIG.LABELS.HERO_TITLE}</h1>
          </div>
          <p className="welcome-subtitle">{WELCOME_CONFIG.LABELS.HERO_SUBTITLE}</p>
        </header>

        {/* 브라우저 상단 핀(Pin) 고정 안내 */}
        <section className="pin-tip-card">
          <div className="pin-tip-content">
            <h2>{WELCOME_CONFIG.LABELS.PIN_TIP_TITLE}</h2>
            <p>{WELCOME_CONFIG.LABELS.PIN_TIP_DESC}</p>
          </div>
          <div className="pin-tip-visual" aria-hidden="true">
            <div className="browser-bar-mock">
              <span className="mock-ext-item">
                <img src="/icons/icon-16.png" alt="" />
                <span>Job Blocking V2</span>
              </span>
              <span className="mock-pin-icon">📌 고정됨</span>
            </div>
          </div>
        </section>

        {/* 인터랙티브 미리보기 데모 */}
        <section className="welcome-section">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">{WELCOME_CONFIG.LABELS.DEMO_SECTION_TITLE}</h2>
              <p className="section-desc">{WELCOME_CONFIG.LABELS.DEMO_SECTION_DESC}</p>
            </div>
            {demoState !== 'normal' && (
              <button
                type="button"
                className="demo-reset-btn"
                onClick={() => setDemoState('normal')}
              >
                🔄 {WELCOME_CONFIG.LABELS.DEMO_RESET_BTN}
              </button>
            )}
          </div>

          <div className="demo-stage">
            <div className={`demo-job-card ${demoState !== 'normal' ? 'is-blocked' : ''}`}>
              <div className="demo-card-top">
                <span className="demo-platform-tag">채용공고 예시 카드</span>
                <div className="demo-toolbar">
                  <button
                    type="button"
                    className="demo-btn-hide"
                    onClick={() => setDemoState('job_hidden')}
                  >
                    {INLINE_BUTTON_CONFIG.LABELS.HIDE_JOB}
                  </button>
                  <span className="demo-divider">|</span>
                  <button
                    type="button"
                    className="demo-btn-block"
                    onClick={() => setDemoState('company_blocked')}
                  >
                    {INLINE_BUTTON_CONFIG.LABELS.BLOCK_COMPANY}
                  </button>
                </div>
              </div>

              <h3 className="demo-job-title">{WELCOME_CONFIG.LABELS.DEMO_MOCK_TITLE}</h3>

              <div className="demo-company-row">
                <span className="demo-company-name">{WELCOME_CONFIG.LABELS.DEMO_MOCK_COMPANY}</span>
                <span className="demo-rating-badge jp">★ 4.2 잡플래닛</span>
                <span className="demo-rating-badge blind">★ 4.0 블라인드</span>
              </div>

              <p className="demo-job-meta">{WELCOME_CONFIG.LABELS.DEMO_MOCK_META}</p>
            </div>

            {demoState !== 'normal' && (
              <div className="demo-blocked-notice" role="status">
                <span>✅ {WELCOME_CONFIG.LABELS.DEMO_BLOCKED_MSG}</span>
                <button
                  type="button"
                  className="demo-reset-inline-btn"
                  onClick={() => setDemoState('normal')}
                >
                  {WELCOME_CONFIG.LABELS.DEMO_RESET_BTN}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 핵심 기능 4단계 가이드 */}
        <section className="welcome-section">
          <h2 className="section-title">{WELCOME_CONFIG.LABELS.STEPS_SECTION_TITLE}</h2>
          <div className="steps-grid">
            {WELCOME_CONFIG.STEPS.map((step) => (
              <div key={step.badge} className="step-card">
                <div className="step-header">
                  <span className="step-badge">{step.badge}</span>
                  <span className="step-icon">{step.icon}</span>
                </div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 지원 채용 사이트 바로가기 */}
        <section className="welcome-section">
          <h2 className="section-title">{WELCOME_CONFIG.LABELS.PLATFORMS_SECTION_TITLE}</h2>
          <p className="section-desc">{WELCOME_CONFIG.LABELS.PLATFORMS_SECTION_DESC}</p>
          <div className="platforms-grid">
            {WELCOME_CONFIG.PLATFORMS.map((platform) => (
              <a
                key={platform.id}
                href={platform.url}
                target="_blank"
                rel="noreferrer"
                className="platform-card"
              >
                <span className="platform-name">{platform.name}</span>
                <span className="platform-desc">{platform.desc} ↗</span>
              </a>
            ))}
          </div>

          <div className="welcome-cta-row">
            <button type="button" className="btn-open-options" onClick={handleOpenOptions}>
              {WELCOME_CONFIG.LABELS.CTA_OPEN_OPTIONS}
            </button>
          </div>
        </section>

        {/* 하단 푸터 */}
        <footer className="welcome-footer">
          <div className="welcome-footer-links">
            <a href={SUPPORT_CONFIG.FEEDBACK_URL} target="_blank" rel="noreferrer">
              💬 {SUPPORT_CONFIG.LABELS.FEEDBACK}
            </a>
            <span>·</span>
            <a href={SUPPORT_CONFIG.PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
              🔒 {SUPPORT_CONFIG.LABELS.PRIVACY}
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
