import React from 'react';
import { Radar, Zap, ExternalLink, Sun, Moon, Key, Gift } from 'lucide-react';

export default function Header({ 
  onReset, 
  onShowReceipt, 
  hasResults, 
  theme, 
  onToggleTheme,
  onOpenKeyModal,
  apiKey,
  trialInfo
}) {
  const isCustomKey = Boolean(apiKey);
  const runsUsed = trialInfo?.runsUsed ?? 0;
  const maxRuns = trialInfo?.maxRuns ?? 3;
  const runsRemaining = Math.max(0, maxRuns - runsUsed);

  return (
    <header className="header-bar">
      <div className="header-inner">
        {/* Brand Logo & Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); onReset(); }} 
            className="brand-wrapper"
            title="Ratina.ai - Home"
          >
            <div className="brand-icon-box">
              {/* R + Radar Scanning SVG Emblem */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" strokeOpacity="0.6" />
                <path d="M12 4 C16.4 4 20 7.6 20 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                {/* Clean stylized R inside radar */}
                <path d="M9 16V8H13C14.5 8 15.5 8.8 15.5 10.2C15.5 11.5 14.5 12.3 13 12.3H9M12.5 12.3L15.5 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <span className="brand-wordmark">
              ratina<span>.ai</span>
            </span>
          </a>

          {/* Navigation Category Badge */}
          <div className="nav-badge">
            <Radar size={13} style={{ color: 'var(--accent-lime)' }} />
            <span>Product Intelligence</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Interactive Monid Connection & Key Button */}
          <button 
            onClick={onOpenKeyModal}
            className={`monid-badge-btn ${isCustomKey ? 'custom' : 'trial'}`}
            title={isCustomKey ? 'Custom Monid API key connected. Click to manage.' : 'Sponsored free trial active. Click to connect your own Monid account.'}
          >
            <span className={`monid-dot ${isCustomKey ? 'live' : 'trial'}`}></span>
            <span>{isCustomKey ? 'Monid Account' : 'Free Trial'}</span>
            <span className={`balance-pill ${isCustomKey ? 'custom' : 'trial'}`}>
              {isCustomKey ? 'Connected' : `${runsRemaining} Left`}
            </span>
          </button>

          {hasResults && (
            <button 
              onClick={onReset}
              className="btn-secondary"
              style={{ height: '36px', fontSize: '0.8rem' }}
            >
              <Zap size={14} />
              New Investigation
            </button>
          )}

          <a 
            href="https://monid.ai" 
            target="_blank" 
            rel="noreferrer"
            className="footer-link"
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
          >
            <span>Monid Docs</span>
            <ExternalLink size={12} />
          </a>

          {/* Vertical Utility Divider */}
          <div className="nav-divider" />

          {/* Far-Right Theme Toggle (Icon-Only Sleek Anchor) */}
          <button
            onClick={onToggleTheme}
            className="theme-toggle-icon-btn"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Light/Dark Theme"
          >
            {theme === 'dark' ? (
              <Sun size={17} style={{ color: '#F59E0B' }} />
            ) : (
              <Moon size={17} style={{ color: '#6366F1' }} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
