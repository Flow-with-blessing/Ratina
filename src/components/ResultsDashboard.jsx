import React, { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Receipt, 
  ExternalLink, 
  Copy, 
  Wrench, 
  Sparkles, 
  Star,
  Layers,
  ChevronRight,
  ShieldCheck,
  Info,
  Award,
  DollarSign,
  FileText,
  Filter,
  Check,
  Zap,
  Flame,
  Clock,
  Download,
  Radio,
  Bot
} from 'lucide-react';
import McpConsole from './McpConsole';

export default function ResultsDashboard({ data, initialTab = 'decision' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [copiedText, setCopiedText] = useState('');

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  if (!data) return null;

  // Check if payload is multi-competitor or single ASIN
  const isMultiCompetitor = Boolean(data.strictMatrix || data.strictCompetitorSummary || data.finalDecision);

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 3000);
  };

  // Export handlers
  const handleDownloadJSON = () => {
    window.open('/api/export/json', '_blank');
  };

  const handleDownloadBrief = () => {
    window.open('/api/export/brief', '_blank');
  };

  // If single ASIN payload, render clean single report view
  if (!isMultiCompetitor) {
    return (
      <div className="results-dashboard">
        {/* Execution Indicator for single ASIN */}
        {data.executionMetadata && (
          <div className={`execution-indicator ${data.executionMetadata.isLiveExecution ? 'live' : 'saved'}`}>
            <div className="exec-status">
              <span className={`exec-dot ${data.executionMetadata.isLiveExecution ? 'live' : 'saved'}`}></span>
              <strong>{data.executionMetadata.isLiveExecution ? 'LIVE MONID EXECUTION' : 'SAVED RESULT'}</strong>
            </div>
            <div className="exec-details">
              <span>Run ID: {data.executionMetadata.runId}</span>
              <span>Executed: {new Date(data.executionMetadata.executedAt).toLocaleString()}</span>
              {data.executionMetadata.totalActualCost > 0 && (
                <span>Actual spend: ${data.executionMetadata.totalActualCost.toFixed(5)}</span>
              )}
            </div>
          </div>
        )}

        <div className="card-surface product-header-card">
          <div className="product-meta-group">
            <div className="product-info">
              <span className="product-category-tag">{data.category || 'Amazon Catalog'}</span>
              <h2 className="product-title-text">{data.productName}</h2>
              <div className="product-sub-meta">
                <div className="meta-chip">
                  <strong>ASIN:</strong> <span className="mono text-lime">{data.asin}</span>
                </div>
                {data.price && (
                  <div className="meta-chip">
                    <strong>Price:</strong> <span>{data.price}</span>
                  </div>
                )}
                <div className="meta-chip">
                  <strong>Rating:</strong> <span>{data.rating} / 5.0 ({data.totalAmazonRatings?.toLocaleString() || 'N/A'} ratings)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Verdict & Risk Summary */}
        <div className="card-surface dashboard-card" style={{ marginTop: '1.5rem' }}>
          <h3 className="section-title">
            <ShieldCheck className="text-lime" size={18} />
            <span>Ratina Single ASIN Intelligence Verdict</span>
          </h3>
          <p className="verdict-summary-text">{data.ratinaVerdict?.summary}</p>
        </div>
      </div>
    );
  }

  // ─── MULTI-COMPETITOR CROSS-ANALYSIS DASHBOARD ──────────────────────────────

  const summary = data.strictCompetitorSummary || [];
  const matrix = data.strictMatrix || [];
  const severityScores = data.strictSeverityScores || [];
  const opportunity = data.productOpportunityScore || {};
  const specs = data.strictSourcingSpecs || [];
  const decision = data.finalDecision || {};
  const receipt = data.monidReceipt || {};
  const limitations = data.dataLimitations || {};
  const execMeta = data.executionMetadata || {};
  const discovery = data.discovery || null;

  // Dynamic values from actual data
  const categoryDisplay = data.category || 'Product Category';
  const totalReviews = summary.reduce((s, c) => s + (c.reviewsRetrieved || 0), 0);
  const totalCalls = receipt.totalCallsExecuted || 0;
  const totalCost = receipt.totalMonidCostUSD || '$0.00000';
  const isLive = execMeta.isLiveExecution === true;

  // Get all unique ASINs from matrix for dynamic column headers
  const competitorAsins = summary.map(c => c.asin);

  return (
    <div className="results-dashboard multi-dashboard">
      {/* ─── EXECUTION STATUS INDICATOR ───────────────────────────────────── */}
      <div className={`execution-indicator ${isLive ? 'live' : 'saved'}`}>
        <div className="exec-status">
          <span className={`exec-dot ${isLive ? 'live' : 'saved'}`}></span>
          <strong>{isLive ? 'LIVE MONID EXECUTION' : 'SAVED RESULT (Previous Investigation)'}</strong>
        </div>
        <div className="exec-details">
          <span>Run ID: {execMeta.runId || 'N/A'}</span>
          <span>Executed: {execMeta.executedAt ? new Date(execMeta.executedAt).toLocaleString() : 'N/A'}</span>
          {execMeta.totalActualCost != null && (
            <span>Actual spend: ${(execMeta.totalActualCost || 0).toFixed(5)}</span>
          )}
        </div>
      </div>

      {/* ─── TOP HEADER BANNER ─────────────────────────────────────────── */}
      <div className="multi-header-banner">
        <div className="banner-badge-group">
          <span className={`live-status-pill ${isLive ? '' : 'saved'}`}>
            <span className={`monid-dot ${isLive ? '' : 'saved'}`}></span>
            {isLive ? 'LIVE MONID ENGINE' : 'SAVED RESULT'}
          </span>
          <span className="category-pill">
            {categoryDisplay}
          </span>
        </div>
        <h1 className="multi-header-title">
          {summary.length}-ASIN Cross-Competitor Product Intelligence
        </h1>
        <p className="multi-header-sub">
          Derived from {totalReviews} real Amazon reviews retrieved across {totalCalls} Monid API calls. Measured total run spend: <strong>{totalCost}</strong>.
        </p>

        {/* Dynamic Tab Bar */}
        <div className="dashboard-tab-bar">
          <button className={`tab-btn ${activeTab === 'decision' ? 'active' : ''}`} onClick={() => setActiveTab('decision')}>
            <Award size={15} /><span>1. Executive Verdict & Opportunity</span>
          </button>
          <button className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`} onClick={() => setActiveTab('matrix')}>
            <Layers size={15} /><span>2. Failure Matrix</span>
          </button>
          <button className={`tab-btn ${activeTab === 'severity' ? 'active' : ''}`} onClick={() => setActiveTab('severity')}>
            <Flame size={15} /><span>3. Defect Severity & Evidence</span>
          </button>
          <button className={`tab-btn ${activeTab === 'specs' ? 'active' : ''}`} onClick={() => setActiveTab('specs')}>
            <Wrench size={15} /><span>4. Sourcing Specifications</span>
          </button>
          <button className={`tab-btn ${activeTab === 'competitors' ? 'active' : ''}`} onClick={() => setActiveTab('competitors')}>
            <FileText size={15} /><span>5. Competitor Profiles</span>
          </button>
          <button className={`tab-btn ${activeTab === 'receipt' ? 'active' : ''}`} onClick={() => setActiveTab('receipt')}>
            <Receipt size={15} /><span>6. Monid Cost Receipt ({totalCost})</span>
          </button>
          <button className={`tab-btn tab-btn-mcp ${activeTab === 'mcp' ? 'active' : ''}`} onClick={() => setActiveTab('mcp')} style={{ borderColor: 'rgba(99, 102, 241, 0.4)', background: activeTab === 'mcp' ? 'rgba(99, 102, 241, 0.15)' : undefined }}>
            <Bot size={15} className="text-indigo-400" /><span>🤖 Agent View (MCP Live)</span>
          </button>
          {discovery && (
            <button className={`tab-btn ${activeTab === 'discovery' ? 'active' : ''}`} onClick={() => setActiveTab('discovery')}>
              <Radio size={15} /><span>Discovery Evidence</span>
            </button>
          )}
          <button className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
            <Zap size={15} /><span>Full Sourcing Report</span>
          </button>
        </div>
      </div>

      {/* ─── DATA LIMITATIONS WARNING ──────────────────────────────────── */}
      <div className="card-surface sparsity-warning-card">
        <div className="warning-header">
          <AlertTriangle size={18} className="text-amber-400" />
          <span>DATA LIMITATIONS & SPARSITY DISCLOSURE</span>
        </div>
        <div className="warning-grid">
          {limitations.highConfidenceDataset && limitations.highConfidenceDataset.length > 0 && (
            <div className="warning-item">
              <strong>High-Confidence Sample:</strong> {Array.isArray(limitations.highConfidenceDataset) ? limitations.highConfidenceDataset.join(', ') : limitations.highConfidenceDataset}
            </div>
          )}
          {limitations.sparseDatasetNotice && (
            <div className="warning-item">
              <strong>⚠️ Sparse Dataset Notice:</strong> {limitations.sparseDatasetNotice}
            </div>
          )}
          {limitations.zeroReviewNotice && (
            <div className="warning-item">
              <strong>⚠️ Zero Review Notice:</strong> {limitations.zeroReviewNotice}
            </div>
          )}
          {limitations.failureNotice && (
            <div className="warning-item">
              <strong>🔴 Retrieval Failure:</strong> {limitations.failureNotice}
            </div>
          )}
          {limitations.anomalyNotice && (
            <div className="warning-item">
              <strong>⚠️ Anomaly Notice:</strong> {limitations.anomalyNotice}
            </div>
          )}
        </div>
      </div>

      {/* Failed competitors warning */}
      {data.failedCompetitors && data.failedCompetitors.length > 0 && (
        <div className="card-surface sparsity-warning-card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <div className="warning-header" style={{ color: '#EF4444' }}>
            <AlertTriangle size={18} />
            <span>COMPETITOR RETRIEVAL FAILURES</span>
          </div>
          <div className="warning-grid">
            {data.failedCompetitors.map((f, i) => (
              <div key={i} className="warning-item">
                <strong>ASIN {f.asin}:</strong> {f.error || 'Data retrieval failed'} — Status: {f.status}
              </div>
            ))}
            <div className="warning-item">
              <strong>Impact:</strong> {data.failedCompetitors.length}/{summary.length + data.failedCompetitors.length} competitors failed. Evidence confidence reduced.
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION 1: EXECUTIVE VERDICT ──────────────────────────────── */}
      {(activeTab === 'decision' || activeTab === 'all') && (
        <div className="dashboard-section-group">
          <div className="decision-opportunity-row">
            <div className="card-surface decision-card">
              <div className="decision-badge-header">
                <span className="decision-pill-conditional">
                  {decision.decision || '🟡 INVESTIGATE / CONDITIONAL GO'}
                </span>
                <span className="confidence-pill-qualitative">
                  EVIDENCE CONFIDENCE: <strong className="text-amber-400">{decision.evidenceConfidence || 'MODERATE'}</strong>
                </span>
              </div>
              <h3 className="decision-title">Sourcing Decision Rationale</h3>
              <p className="decision-rationale-text">{decision.evidenceRationale}</p>
              <div className="confidence-note-box">
                <strong>Evidence Confidence Note:</strong> {decision.confidenceExplanation}
              </div>
              <div className="decision-action-box" style={{ marginTop: '1rem' }}>
                <strong>Next Actionable Step:</strong> {decision.nextStepAction}
              </div>
            </div>

            <div className="card-surface opportunity-card">
              <div className="opportunity-header">
                <span>PRODUCT OPPORTUNITY SCORE vs. EVIDENCE CONFIDENCE</span>
                <Sparkles size={16} className="text-amber-400" />
              </div>
              <div className="score-dial-box">
                <div className="score-dial-number">
                  {opportunity.score || 'N/A'}
                  <span className="score-max">/ {opportunity.maxScore || 100}</span>
                </div>
                <div className="score-tier-label">PRODUCT OPPORTUNITY SCORE: {opportunity.score || 'N/A'}/{opportunity.maxScore || 100}</div>
                <div className="confidence-tier-label">EVIDENCE CONFIDENCE: <strong>{decision.evidenceConfidence || 'MODERATE'}</strong></div>
              </div>
              <div className="score-formula-box">
                <div className="formula-line"><span>Formula:</span><strong>{opportunity.formula || 'N/A'}</strong></div>
                <div className="formula-divider"></div>
                <div className="formula-line"><span>Interpretation:</span><strong>{opportunity.interpretation || 'N/A'}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION 2: FAILURE MATRIX ─────────────────────────────────── */}
      {(activeTab === 'matrix' || activeTab === 'all') && (
        <div className="card-surface dashboard-section-card">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">
                <Layers className="text-indigo-400" size={18} />
                <span>Cross-Competitor Failure Matrix</span>
              </h3>
              <p className="section-subtitle">
                Identifies recurring manufacturing & design defects across {summary.length} competing ASINs.
              </p>
            </div>
          </div>

          <div className="matrix-table-container">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>Failure Mode / Defect Category</th>
                  {summary.map(comp => (
                    <th key={comp.asin}>
                      {(comp.name || comp.asin).substring(0, 20)}<br />
                      <code className="mono">{comp.asin}</code>
                    </th>
                  ))}
                  <th>Total Mentions</th>
                  <th>Prevalence %</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, idx) => (
                  <tr key={idx}>
                    <td className="failure-mode-cell"><strong>{row.failureMode}</strong></td>
                    {summary.map(comp => {
                      const cellData = row.countsPerProduct?.[comp.asin];
                      const count = cellData?.count || 0;
                      const sufficient = cellData?.sampleSufficient !== false;
                      return (
                        <td key={comp.asin} className={`count-cell ${count > 0 ? 'cell-high' : sufficient ? 'cell-zero' : 'cell-sparse'}`} title={sufficient ? '' : 'Sparse dataset'}>
                          {count} {!sufficient && <span className="sparse-dot">*</span>}
                        </td>
                      );
                    })}
                    <td className="total-mentions-cell"><strong>{row.totalObservedMentions}</strong></td>
                    <td className="prevalence-cell">{row.prevalenceInPrimaryDataset}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="matrix-footnote">
            * Note: ASINs with sparse datasets (&lt;5 reviews) are flagged. 0 counts may indicate insufficient sample depth, not perfect quality.
          </div>
        </div>
      )}

      {/* ─── SECTION 3: SEVERITY RANKING ───────────────────────────────── */}
      {(activeTab === 'severity' || activeTab === 'all') && (
        <div className="card-surface dashboard-section-card">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">
                <Flame className="text-rose-400" size={18} />
                <span>Failure Severity Ranking & Customer Evidence</span>
              </h3>
              <p className="section-subtitle">
                Ranked by severity score combining mention frequency, market prevalence %, and safety hazard weighting.
              </p>
            </div>
          </div>

          <div className="severity-cards-grid">
            {severityScores.map((item, idx) => (
              <div key={idx} className={`severity-card tier-${item.severityTier?.includes('P0') ? 'critical' : item.severityTier?.includes('P1') ? 'high' : 'medium'}`}>
                <div className="severity-card-header">
                  <div className="severity-rank-badge">#{idx + 1}</div>
                  <div className="severity-title-group">
                    <h4>{item.failureMode}</h4>
                    <span className="evidence-basis-tag">{item.evidenceBasis}</span>
                  </div>
                  <div className="severity-score-badge">
                    <div className="score-val">{item.severityScore}</div>
                    <div className="score-lbl">{item.severityTier}</div>
                  </div>
                </div>
                <div className="severity-card-meta">
                  <div className="meta-item">
                    <span>Mentions in Sample:</span> <strong>{item.totalObservedMentions}</strong>
                  </div>
                  <div className="meta-item">
                    <span>Safety Hazard:</span> <strong>{item.isSafetyHazard ? '⚠️ YES (+20 pts)' : 'NO'}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SECTION 4: SOURCING SPECIFICATIONS + EXPORT ───────────────── */}
      {(activeTab === 'specs' || activeTab === 'all') && (
        <div className="card-surface dashboard-section-card">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">
                <Wrench className="text-emerald-400" size={18} />
                <span>Actionable Product & Quality Sourcing Specifications</span>
              </h3>
              <p className="section-subtitle">
                Engineered requirements derived directly from retrieved market failure evidence.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => handleCopy(JSON.stringify(specs, null, 2), 'Sourcing Specs Copied!')}>
                <Copy size={14} />
                <span>{copiedText === 'Sourcing Specs Copied!' ? 'Copied!' : 'Copy Specs JSON'}</span>
              </button>
              <button className="btn-secondary" onClick={handleDownloadJSON} title="Download full investigation as JSON">
                <Download size={14} />
                <span>Download JSON</span>
              </button>
              <button className="btn-secondary" onClick={handleDownloadBrief} title="Download human-readable sourcing brief">
                <Download size={14} />
                <span>Download Sourcing Brief</span>
              </button>
            </div>
          </div>

          <div className="specs-table-container">
            <table className="specs-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Failure Mode</th>
                  <th>Observed Evidence Basis</th>
                  <th>Engineering Requirement</th>
                  <th>QA Requirement</th>
                  <th>Listing Implication</th>
                </tr>
              </thead>
              <tbody>
                {specs.map((spec, idx) => (
                  <tr key={idx}>
                    <td>
                      <span className={`priority-pill ${spec.priority?.includes('P0') ? 'p0' : spec.priority?.includes('P1') ? 'p1' : 'p2'}`}>
                        {spec.priority}
                      </span>
                    </td>
                    <td className="failure-mode-cell"><strong>{spec.failureMode || 'N/A'}</strong></td>
                    <td className="evidence-cell">{spec.evidenceObserved}</td>
                    <td className="eng-cell"><strong>{spec.engineeringRequirement}</strong></td>
                    <td className="qa-cell"><code>{spec.qaRequirement}</code></td>
                    <td className="claim-cell"><em>{spec.listingImplication}</em></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {specs.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No failure-based sourcing specifications generated. This may indicate insufficient review evidence.
            </div>
          )}
        </div>
      )}

      {/* ─── SECTION 5: MONID COST RECEIPT ─────────────────────────────── */}
      {(activeTab === 'receipt' || activeTab === 'all') && (
        <div className="card-surface dashboard-section-card">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">
                <Receipt className="text-amber-400" size={18} />
                <span>Measured Monid Spend Receipt & Execution Log</span>
              </h3>
              <p className="section-subtitle">
                Itemized invoice from {isLive ? 'live' : 'saved'} Monid API execution.
              </p>
            </div>
            <div className="receipt-summary-pill">
              Total Actual Spend: <strong>{totalCost}</strong>
            </div>
          </div>

          <div className="receipt-metrics-grid">
            <div className="receipt-metric-card">
              <span className="metric-label">Total Actual Spend</span>
              <span className="metric-value text-emerald-400">{totalCost}</span>
              <span className="metric-sub">{totalCalls} API Calls Executed</span>
            </div>
            <div className="receipt-metric-card">
              <span className="metric-label">Call Success Rate</span>
              <span className="metric-value text-lime">
                {totalCalls > 0 ? Math.round(((receipt.successfulCalls || 0) / totalCalls) * 100) : 0}%
              </span>
              <span className="metric-sub">{receipt.successfulCalls || 0} Success / {receipt.failedCalls || 0} Failed</span>
            </div>
            <div className="receipt-metric-card">
              <span className="metric-label">Execution Type</span>
              <span className={`metric-value ${isLive ? 'text-lime' : 'text-amber-400'}`}>
                {isLive ? 'LIVE' : 'SAVED'}
              </span>
              <span className="metric-sub">{isLive ? 'Fresh Monid calls executed' : 'Previously saved result'}</span>
            </div>
            <div className="receipt-metric-card">
              <span className="metric-label">Run ID</span>
              <span className="metric-value text-indigo-400" style={{ fontSize: '0.75rem' }}>{execMeta.runId || 'N/A'}</span>
              <span className="metric-sub">{execMeta.executedAt ? new Date(execMeta.executedAt).toLocaleString() : 'N/A'}</span>
            </div>
          </div>

          <div className="receipt-table-container">
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Call #</th>
                  <th>Monid Gateway Endpoint</th>
                  <th>Target ASIN</th>
                  <th>HTTP Status</th>
                  <th>Latency</th>
                  <th>Actual Charge</th>
                  {receipt.callBreakdown?.[0]?.callId && <th>Call ID</th>}
                </tr>
              </thead>
              <tbody>
                {(receipt.callBreakdown || []).map((call, idx) => (
                  <tr key={idx} className={call.error ? 'call-failed-row' : ''}>
                    <td className="mono">#{call.callIndex}</td>
                    <td className="mono font-semibold">{call.endpoint}</td>
                    <td className="mono text-lime">{call.asin || 'N/A'}</td>
                    <td>
                      <span className={call.error ? 'status-pill-err' : 'status-pill-ok'}>
                        {call.status}
                      </span>
                    </td>
                    <td className="mono">{call.latencyMs ? `${(call.latencyMs / 1000).toFixed(2)}s` : 'N/A'}</td>
                    <td className="mono font-bold text-emerald-400">${(call.costUSD || 0).toFixed(5)}</td>
                    {call.callId && <td className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>{call.callId}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── SECTION 6: COMPETITOR PROFILES ────────────────────────────── */}
      {(activeTab === 'competitors' || activeTab === 'all') && (
        <div className="card-surface dashboard-section-card">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">
                <FileText className="text-indigo-400" size={18} />
                <span>{summary.length} Real Competing Amazon Product Profiles</span>
              </h3>
              <p className="section-subtitle">
                Individual product data retrieved {isLive ? 'live' : 'from saved results'} via Monid Amazon scrapers.
              </p>
            </div>
          </div>

          <div className="competitors-cards-grid">
            {summary.map((comp, idx) => (
              <div key={idx} className="competitor-card">
                <div className="comp-card-header">
                  <div className="comp-asin-chip">{comp.asin}</div>
                  <div className="comp-status-tag">{comp.dataQualityStatus}</div>
                </div>

                <h4 className="comp-title">{comp.title || comp.name}</h4>

                <div className="comp-meta-row">
                  <div className="comp-meta-item">
                    <span>Live Price:</span> <strong>{comp.livePrice || 'UNAVAILABLE'}</strong>
                  </div>
                  <div className="comp-meta-item">
                    <span>Live Rating:</span> <strong>{comp.liveRating || 'N/A'} / 5.0</strong>
                  </div>
                  <div className="comp-meta-item">
                    <span>Reviews Retrieved:</span> <strong>{comp.reviewsRetrieved}</strong>
                  </div>
                </div>

                <div className="comp-failures-box">
                  <div className="comp-failures-title">Identified Failure Counts:</div>
                  <div className="comp-failures-tags">
                    {Object.entries(comp.failureCounts || {}).map(([key, val]) => (
                      <span key={key} className={`comp-fail-chip ${val > 0 ? 'active' : 'zero'}`}>
                        {key.split('/')[0]}: <strong>{val}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                {comp.warnings && comp.warnings.length > 0 && (
                  <div className="comp-warnings">
                    {comp.warnings.map((w, i) => (
                      <div key={i} className="comp-warning-item">⚠️ {w}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── DISCOVERY EVIDENCE TAB ────────────────────────────────────── */}
      {(activeTab === 'discovery' || activeTab === 'all') && discovery && (
        <div className="card-surface dashboard-section-card">
          <div className="section-header-row">
            <div>
              <h3 className="section-title">
                <Radio className="text-indigo-400" size={18} />
                <span>Live Amazon Discovery Evidence</span>
              </h3>
              <p className="section-subtitle">
                Search query: "{discovery.searchQuery}" — {discovery.totalCandidatesFound} candidates found, {summary.length} selected.
              </p>
            </div>
          </div>

          {/* Selection criteria */}
          {discovery.selectionCriteria && (
            <div style={{ padding: '0 1.25rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <strong>Selection Method:</strong>
              <ul style={{ margin: '0.25rem 0 0 1rem', lineHeight: '1.6' }}>
                {discovery.selectionCriteria.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {/* Selection reasons */}
          {discovery.selectionReasons && (
            <div className="specs-table-container" style={{ padding: '0 1.25rem 1.25rem' }}>
              <table className="specs-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>ASIN</th>
                    <th>Product</th>
                    <th>Score</th>
                    <th>Selection Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {discovery.selectionReasons.map((r, i) => (
                    <tr key={i}>
                      <td>#{r.rank}</td>
                      <td className="mono text-lime">{r.asin}</td>
                      <td>{(r.title || '').substring(0, 60)}</td>
                      <td><strong>{r.score}</strong></td>
                      <td style={{ fontSize: '0.75rem' }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── AGENT MCP CONSOLE ────────────────────────────────────────── */}
      {(activeTab === 'mcp' || activeTab === 'all') && (
        <McpConsole category={categoryDisplay} data={data} />
      )}
    </div>
  );
}
