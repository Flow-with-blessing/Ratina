import React from 'react';
import { ShieldAlert, Cpu, Wrench } from 'lucide-react';

export default function EmptyState() {
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
        Enter an Amazon ASIN to uncover recurring customer pain points.
      </h3>

      <p className="empty-state-subtext">
        Ratina extracts reviews via Monid, runs failure pattern clustering, and delivers actionable factory directives before you commit capital.
      </p>

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
