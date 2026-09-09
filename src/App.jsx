import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import AnalysisCard from './components/AnalysisCard';
import EmptyState from './components/EmptyState';
import AnalysisProgress from './components/AnalysisProgress';
import ResultsDashboard from './components/ResultsDashboard';

export default function App() {
  const [currentAsin, setCurrentAsin] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultsData, setResultsData] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Theme State with localStorage persistence (Default: Dark)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('ratina_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ratina_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Cost confirmation dialog handler
  const confirmAndExecute = (action) => {
    setPendingAction(() => action);
    setShowConfirmDialog(true);
  };

  const handleConfirmRun = () => {
    setShowConfirmDialog(false);
    if (pendingAction) pendingAction();
    setPendingAction(null);
  };

  const handleCancelRun = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  // Single ASIN analysis
  const handleStartAnalysis = async (asin) => {
    const isBenchmark = asin === 'BENCHMARK_5_ASINS';
    const cleanAsin = isBenchmark ? 'BENCHMARK_5_ASINS' : asin.trim().toUpperCase();

    const executeAnalysis = async () => {
      setCurrentAsin(cleanAsin);
      setIsLoading(true);
      setResultsData(null);
      setErrorMessage(null);
      setErrorDetails(null);

      try {
        const endpoint = isBenchmark ? '/api/analyze-multi' : '/api/analyze';
        const body = isBenchmark ? { mode: 'benchmark' } : { asin: cleanAsin };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.message || payload.error || 'Failed to retrieve product data from Monid');
        }

        setResultsData(payload.data);
      } catch (err) {
        console.error('Analysis error:', err);
        setErrorMessage(err.message || 'An error occurred while connecting to the Monid review pipeline.');
        setErrorDetails(null);
      } finally {
        setIsLoading(false);
      }
    };

    // Show confirmation for live Monid calls
    confirmAndExecute(executeAnalysis);
  };

  // Dynamic discovery investigation
  const handleStartInvestigation = async (category, searchQuery) => {
    const executeInvestigation = async () => {
      setCurrentAsin(`INVESTIGATION: ${category}`);
      setIsLoading(true);
      setResultsData(null);
      setErrorMessage(null);
      setErrorDetails(null);

      try {
        const response = await fetch('/api/investigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            category, 
            searchQuery: searchQuery || category 
          })
        });

        const payload = await response.json();

        if (!response.ok || !payload.success) {
          setErrorDetails(payload.executionMetadata || null);
          throw new Error(payload.message || payload.error || 'Investigation failed');
        }

        setResultsData(payload.data);
      } catch (err) {
        console.error('Investigation error:', err);
        setErrorMessage(err.message || 'An error occurred during the market investigation.');
      } finally {
        setIsLoading(false);
      }
    };

    confirmAndExecute(executeInvestigation);
  };

  // Load saved benchmark (no confirmation needed — no Monid cost)
  const handleLoadSaved = async () => {
    setCurrentAsin('SAVED_BENCHMARK');
    setIsLoading(true);
    setResultsData(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/saved-benchmark');
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to load saved benchmark');
      }

      setResultsData(payload.data);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setCurrentAsin(null);
    setIsLoading(false);
    setResultsData(null);
    setErrorMessage(null);
    setErrorDetails(null);
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  return (
    <div className="app-container">
      {/* Navigation Header */}
      <Header 
        onReset={handleReset} 
        hasResults={Boolean(resultsData || isLoading)} 
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Cost Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="confirm-overlay" onClick={handleCancelRun}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="confirm-title">Start live investigation?</h3>
            <p className="confirm-body">
              This investigation will make <strong>live Monid API calls</strong> and charge your Monid balance.
            </p>
            <div className="confirm-budget-box">
              <div className="confirm-budget-line">
                <span>Expected test budget:</span>
                <strong>approximately $0.02–$0.05</strong>
              </div>
              <div className="confirm-budget-note">
                Actual cost will be measured after execution.
              </div>
            </div>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={handleCancelRun}>Cancel</button>
              <button className="btn-primary" onClick={handleConfirmRun}>
                <span className="monid-dot" style={{ backgroundColor: '#22c55e' }}></span>
                Run Investigation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Hero Heading */}
        {!resultsData && !isLoading && (
          <Hero />
        )}

        {/* Input Card */}
        <AnalysisCard 
          onAnalyze={handleStartAnalysis}
          onInvestigate={handleStartInvestigation}
          onLoadSaved={handleLoadSaved}
          isLoading={isLoading} 
        />

        {/* Error State Callout */}
        {errorMessage && (
          <div className="card-surface" style={{ maxWidth: '820px', margin: '0 auto 2rem', padding: '1.5rem', borderColor: 'var(--color-failure)', backgroundColor: 'var(--color-failure-bg)' }}>
            <h4 style={{ color: 'var(--color-failure)', marginBottom: '0.4rem', fontWeight: '700' }}>
              ⚠️ Monid Live Retrieval Error
            </h4>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              {errorMessage}
            </p>
            {errorDetails && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <p>Run ID: {errorDetails.runId || 'N/A'} | Phase: {errorDetails.phase || 'N/A'}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button 
                onClick={handleReset} 
                className="btn-secondary" 
                style={{ height: '36px', fontSize: '0.8rem' }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Interactive State Rendering */}
        {isLoading && currentAsin ? (
          <AnalysisProgress 
            asin={currentAsin} 
          />
        ) : resultsData ? (
          <ResultsDashboard data={resultsData} />
        ) : !errorMessage && (
          <EmptyState onSelectSample={handleStartAnalysis} />
        )}
      </main>

      {/* Sleek Footer */}
      <footer className="footer-bar">
        <div className="footer-inner">
          <div>
            <strong>ratina.ai</strong> — Real Amazon Product Intelligence Agent. Powered by Monid.
          </div>
          <div className="footer-links">
            <a href="#" onClick={(e) => { e.preventDefault(); handleReset(); }} className="footer-link">Home</a>
            <a href="https://monid.ai" target="_blank" rel="noreferrer" className="footer-link">Monid API</a>
            <a href="#" onClick={(e) => { e.preventDefault(); alert("Ratina.ai Monid Production Integration v2.0.0"); }} className="footer-link">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
