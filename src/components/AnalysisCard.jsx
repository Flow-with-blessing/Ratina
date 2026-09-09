import React, { useState } from 'react';
import { Search, ArrowRight, Layers, Database, ShieldCheck, Award, Globe, BookOpen } from 'lucide-react';

export default function AnalysisCard({ onAnalyze, onInvestigate, onLoadSaved, onQuickLoad, isLoading }) {
  const [asinInput, setAsinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showCustomInvestigation, setShowCustomInvestigation] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');

  // ─── VALIDATION ────────────────────────────────────────────────────────────

  const validateAsin = (raw) => {
    const cleaned = raw.trim().toUpperCase();
    
    if (!cleaned) {
      return { valid: false, error: 'Enter an Amazon ASIN to continue.' };
    }

    // Check for multiple ASINs
    if (cleaned.includes(',') || cleaned.includes(' ')) {
      return { valid: false, error: 'This field accepts a single ASIN. Use the Market Investigation for multi-ASIN analysis.' };
    }

    // Check length
    if (cleaned.length < 10) {
      return { valid: false, error: `ASIN too short (${cleaned.length} chars). Amazon ASINs are exactly 10 characters. Example: B00008XEWG` };
    }

    if (cleaned.length > 10) {
      return { valid: false, error: `ASIN too long (${cleaned.length} chars). Amazon ASINs are exactly 10 characters. Check for extra characters.` };
    }

    // Check format
    const asinRegex = /^[A-Z0-9]{10}$/;
    if (!asinRegex.test(cleaned)) {
      return { valid: false, error: `"${cleaned}" contains invalid characters. ASINs use only letters A-Z and digits 0-9.` };
    }

    return { valid: true, cleaned };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = validateAsin(asinInput);
    if (!result.valid) {
      setErrorMsg(result.error);
      return;
    }
    setErrorMsg('');
    onAnalyze(result.cleaned);
  };

  const handleTriggerProvenLiveBenchmark = () => {
    setErrorMsg('');
    onAnalyze('BENCHMARK_5_ASINS');
  };

  const handleCustomInvestigation = (e) => {
    e.preventDefault();
    const category = categoryInput.trim();
    if (!category) {
      setErrorMsg('Enter a product category to investigate.');
      return;
    }
    setErrorMsg('');
    onInvestigate(category, category);
  };

  return (
    <div className="card-surface analysis-card">
      {/* Live Market Investigation Banner */}
      <div className="proven-benchmark-banner">
        <div className="proven-banner-left">
          <div className="proven-icon-box">
            <Award size={20} className="text-amber-400" />
          </div>
          <div>
            <div className="proven-banner-title">
              Live Market Investigation
            </div>
            <div className="proven-banner-sub">
              5 real competitors • Live Amazon data • Evidence-backed recommendation
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => onQuickLoad ? onQuickLoad('decision') : handleTriggerProvenLiveBenchmark()}
            className="btn-proven-run"
            disabled={isLoading}
            title="Instant 5-competitor audit from cache ($0.00)"
          >
            <span>🥤 Portable Blenders ($0.00)</span>
          </button>
          <button
            type="button"
            onClick={onLoadSaved || handleTriggerProvenLiveBenchmark}
            className="btn-proven-run"
            style={{ background: 'var(--surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            disabled={isLoading}
            title="French Press multi-brand benchmark"
          >
            <Layers size={14} />
            <span>☕ French Press</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCustomInvestigation(!showCustomInvestigation)}
            className="btn-proven-run"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))', borderColor: 'rgba(99,102,241,0.3)' }}
            disabled={isLoading}
          >
            <Globe size={14} />
            <span>New Category →</span>
          </button>
        </div>
      </div>

      {/* Custom Category Investigation */}
      {showCustomInvestigation && (
        <div className="custom-investigation-panel">
          <form onSubmit={handleCustomInvestigation} className="analysis-form">
            <div className="input-row">
              <div className="input-wrapper">
                <Globe className="input-icon" size={20} />
                <input 
                  type="text"
                  value={categoryInput}
                  onChange={(e) => {
                    setCategoryInput(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Enter a product category (e.g. Portable Blender, Yoga Mat, LED Desk Lamp)"
                  className="asin-input"
                  disabled={isLoading}
                />
              </div>
              <button 
                type="submit" 
                className="btn-primary"
                disabled={isLoading}
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
              >
                {isLoading ? (
                  <>
                    <span className="monid-dot" style={{ backgroundColor: '#ffffff' }}></span>
                    <span>Discovering...</span>
                  </>
                ) : (
                  <>
                    <span>Search & Investigate</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
            <div className="custom-investigation-note">
              <Globe size={13} style={{ color: 'var(--accent-lime)' }} />
              <span>Dynamic Discovery: Ratina will search Amazon, select 5 top competitors, retrieve live data, and generate a full failure analysis.</span>
            </div>
          </form>
        </div>
      )}

      <div className="divider-line" style={{ margin: '1.25rem 0' }}>
        <span>Or analyze a single ASIN</span>
      </div>

      <form onSubmit={handleSubmit} className="analysis-form">
        <div className="input-row">
          <div className="input-wrapper">
            <Search className="input-icon" size={20} />
            <input 
              type="text"
              value={asinInput}
              onChange={(e) => {
                setAsinInput(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Enter an Amazon ASIN (e.g. B00008XEWG)"
              className="asin-input"
              disabled={isLoading}
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="monid-dot" style={{ backgroundColor: '#ffffff' }}></span>
                <span>Executing Pipeline...</span>
              </>
            ) : (
              <>
                <span>Analyze Single ASIN</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        {errorMsg && (
          <div style={{ color: 'var(--color-failure)', fontSize: '0.8rem', fontWeight: '500', marginTop: '0.5rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Card Footer */}
        <div className="input-footer">
          <div className="monid-live-note">
            <Database size={14} style={{ color: 'var(--accent-lime)' }} />
            <span>Live Monid Data Gateway • Amazon Product & Review Evidence</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-tertiary)' }}>
            <ShieldCheck size={13} />
            <span>Evidence Traceability Enabled</span>
          </div>
        </div>
      </form>
    </div>
  );
}
