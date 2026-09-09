import React, { useEffect, useState } from 'react';
import { Database, CheckCircle2, Loader2, Cpu, FileSpreadsheet } from 'lucide-react';

export default function AnalysisProgress({ asin }) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { title: `Connecting to Monid Gateway for ASIN: ${asin}...`, icon: Database },
    { title: "Retrieving live Amazon product & review payload...", icon: FileSpreadsheet },
    { title: "Normalizing customer feedback & verified purchase ratings...", icon: Cpu },
    { title: "Extracting recurring product failure pattern clusters...", icon: Cpu },
    { title: "Synthesizing sourcing directives & listing opportunity rewrites...", icon: CheckCircle2 },
    { title: "Calculating measured Monid API compute receipt...", icon: CheckCircle2 }
  ];

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStep(1), 1200);
    const timer2 = setTimeout(() => setCurrentStep(2), 2500);
    const timer3 = setTimeout(() => setCurrentStep(3), 4200);
    const timer4 = setTimeout(() => setCurrentStep(4), 6000);
    const timer5 = setTimeout(() => setCurrentStep(5), 7500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
  }, [asin]);

  return (
    <div className="card-surface loading-state-card">
      <div className="loading-radar-ring"></div>
      <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.4rem' }}>
        Running Live Monid Amazon Extraction
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        Extracting verified reviews & analyzing manufacturing defect patterns
      </p>

      <div className="loading-step-list">
        {steps.map((step, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep;

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
