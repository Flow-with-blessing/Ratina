import React from 'react';
import { Database, CheckCircle2, Loader2, Cpu, FileSpreadsheet } from 'lucide-react';

/**
 * Live pipeline progress.
 *
 * Every step below advances only when the backend reports that the phase
 * actually completed (Server-Sent Events from /api/runs/stream). Nothing here
 * runs on a timer — if a Monid call takes 40 seconds, the step stays active
 * for 40 seconds instead of "finishing" on schedule while work is still going.
 */

// Engine phase -> display step index
const PHASE_TO_STEP = {
  DISCOVERY: 0,
  SELECTION: 0,
  DISCOVERY_FAILED: 0,
  SELECTION_FAILED: 0,
  ENRICHMENT: 1,
  ENRICHMENT_FAILED: 1,
  FAILURE_MATRIX: 3,
  SEVERITY: 3,
  OPPORTUNITY: 3,
  SOURCING_SPECS: 4,
  DECISION: 4,
  VERIFICATION: 5,
  CACHE: 5,
  DEGRADED: 5
};

export default function AnalysisProgress({ asin, events = [] }) {
  const steps = [
    { title: `Connecting to Monid Gateway for ASIN: ${asin}...`, icon: Database },
    { title: "Retrieving live Amazon product & review payload...", icon: FileSpreadsheet },
    { title: "Normalizing customer feedback & verified purchase ratings...", icon: Cpu },
    { title: "Extracting recurring product failure pattern clusters...", icon: Cpu },
    { title: "Synthesizing sourcing directives & listing opportunity rewrites...", icon: CheckCircle2 },
    { title: "Calculating measured Monid API compute receipt...", icon: CheckCircle2 }
  ];

  const phaseEvents = events.filter(e => e && e.phase);
  const latest = phaseEvents[phaseEvents.length - 1] || null;

  // Highest step reached so far, so the list never appears to move backwards.
  const currentStep = phaseEvents.reduce((max, e) => {
    const idx = PHASE_TO_STEP[e.phase];
    return idx !== undefined && idx > max ? idx : max;
  }, 0);

  // Step 2 ("Normalizing...") is reached once enrichment reports completed work.
  const enrichmentDone = phaseEvents.some(
    e => e.phase === 'ENRICHMENT' && (e.competitorsDone > 0 || e.reviewsRetrieved !== undefined)
  );
  const effectiveStep = currentStep === 1 && enrichmentDone ? 2 : currentStep;

  const detailLine = latest?.message || (
    phaseEvents.length === 0 ? 'Establishing live pipeline connection...' : null
  );

  return (
    <div className="card-surface loading-state-card">
      <div className="loading-radar-ring"></div>
      <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.4rem' }}>
        Running Live Monid Amazon Extraction
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        Extracting verified reviews & analyzing manufacturing defect patterns
      </p>

      {detailLine && (
        <p
          className="mono"
          style={{
            color: 'var(--accent-lime)',
            fontSize: '0.78rem',
            marginTop: '0.6rem',
            minHeight: '1.1rem'
          }}
        >
          {detailLine}
        </p>
      )}

      <div className="loading-step-list">
        {steps.map((step, idx) => {
          const isDone = idx < effectiveStep;
          const isCurrent = idx === effectiveStep;

          return (
            <div
              key={idx}
              className={`loading-step-item ${isCurrent ? 'active' : ''} ${isDone ? 'completed' : ''}`}
            >
              <div className="step-status-icon">
                {isDone ? (
                  <CheckCircle2 size={16} style={{ color: 'var(--accent-lime)' }} />
                ) : isCurrent ? (
                  <Loader2 size={16} className="spin-loader" style={{ color: 'var(--accent-lime)' }} />
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--border-subtle)' }} />
                )}
              </div>
              <span>{step.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
