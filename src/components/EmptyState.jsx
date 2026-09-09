import React from 'react';
import { ShieldAlert, Cpu, Wrench, Sparkles, ArrowRight } from 'lucide-react';

export default function EmptyState({ onQuickLoad, onLoadSaved }) {
  return (
    <div className="empty-state-wrapper">
      {/* Animated Radar Scanning Visual */}
      <div className="radar-graphic-container">
        <div className="radar-outer-ring"></div>
        <div className="radar-mid-ring"></div>
        <div className="radar-inner-ring"></div>
        <div className="radar-sweep-arm"></div>
        <div className="radar-center-dot"></div>

        {/* Abstract failure blips */}
        <div className="radar-blip blip-1" title="Pattern: Lid Leakage"></div>
        <div className="radar-blip blip-2" title="Pattern: Handle Weld Snap"></div>
        <div className="radar-blip blip-3" title="Pattern: Coating Peeling"></div>
      </div>

      <h3 className="empty-state-title">
        Automated Defect Reverse-Engineering Pipeline
      </h3>

      <p className="empty-state-subtext">
        Auditing competing products on Amazon before manufacturing prevents costly tooling revisions, high return rates, and 1-star reviews.
      </p>

      {/* Quick Interactive Demo Pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: '500' }}>
          Explore instant benchmark:
        </span>
        <button
          type="button"
          onClick={() => onQuickLoad && onQuickLoad('decision')}
          className="btn-proven-run"
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          title="Instant 5-competitor audit from cache ($0.00)"
        >
          <Sparkles size={14} style={{ color: 'var(--accent-lime)' }} />
          <span>🥤 Portable Blenders ($0.00 Cache)</span>
          <ArrowRight size={13} />
        </button>
        <button
          type="button"
          onClick={() => onLoadSaved && onLoadSaved()}
          className="btn-load-saved"
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          title="Pre-computed 5-brand benchmark"
        >
          <span>☕ French Press Benchmark</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Feature Preview Cards */}
      <div className="features-preview-grid">
        <div className="preview-item">
          <ShieldAlert className="preview-icon" size={20} />
          <div className="preview-title">Product Risk Index</div>
          <div className="preview-desc">Calculates overall risk score from 1-100 based on severe product defect mentions.</div>
        </div>

        <div className="preview-item">
          <Cpu className="preview-icon" size={20} />
          <div className="preview-title">Monid Vector Clustering</div>
          <div className="preview-desc">Group thousands of customer reviews into distinct, actionable engineering failure categories.</div>
        </div>

        <div className="preview-item">
          <Wrench className="preview-icon" size={20} />
          <div className="preview-title">Sourcing Directives</div>
          <div className="preview-desc">Concrete factory tolerances, material upgrades, and QC testing requirements.</div>
        </div>
      </div>
    </div>
  );
}
