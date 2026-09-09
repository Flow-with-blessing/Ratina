import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import AnalysisCard from './components/AnalysisCard';
import EmptyState from './components/EmptyState';
import AnalysisProgress from './components/AnalysisProgress';
import ResultsDashboard from './components/ResultsDashboard';
import MonidKeyModal from './components/MonidKeyModal';

export default function App() {
  const [currentAsin, setCurrentAsin] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultsData, setResultsData] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [dashboardTab, setDashboardTab] = useState('decision');

  // Live pipeline phase events streamed from the backend (SSE)
  const [progressEvents, setProgressEvents] = useState([]);

  // Custom Monid Key & Trial State
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [monidApiKey, setMonidApiKey] = useState(() => {
    return localStorage.getItem('ratina_monid_key') || '';
  });
  const [trialInfo, setTrialInfo] = useState({ runsUsed: 0, maxRuns: 3, runsRemaining: 3 });

  // Theme State with localStorage persistence (Default: Dark)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('ratina_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const fetchTrialStatus = async () => {
    try {
      const headers = monidApiKey ? { 'x-monid-api-key': monidApiKey } : {};
      const res = await fetch('/api/trial/status', { headers });
      const data = await res.json();
      setTrialInfo(data);
    } catch (e) {
      console.warn('Could not fetch trial status:', e);
    }
  };

  useEffect(() => {
    fetchTrialStatus();
  }, [monidApiKey]);

  const handleSaveApiKey = (newKey) => {
    setMonidApiKey(newKey);
    localStorage.setItem('ratina_monid_key', newKey);
  };

  const handleRemoveApiKey = () => {
    setMonidApiKey('');
    localStorage.removeItem('ratina_monid_key');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ratina_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  /**
   * Poll fallback for environments where EventSource is blocked (some
   * corporate proxies buffer or drop text/event-stream).
   */
  const pollRun = (runId) => new Promise((resolve, reject) => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        const payload = await res.json();
        if (Array.isArray(payload.events)) setProgressEvents(payload.events);

        if (payload.status === 'COMPLETE') {
          clearInterval(poll);
          resolve(payload.result);
        } else if (payload.status === 'ERROR') {
          clearInterval(poll);
          const err = new Error(payload.error?.error || 'Run failed');
          err.payload = payload.error;
          reject(err);
        }
      } catch (e) {
        clearInterval(poll);
        reject(e);
      }
    }, 1000);
  });

  /**
   * Start a run and follow its REAL progress over Server-Sent Events.
   * The Monid API key is sent as a header on the start request only — it is
   * never placed in the stream URL.
   */
  const streamRun = async (startUrl, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (monidApiKey) headers['x-monid-api-key'] = monidApiKey;

    const startRes = await fetch(startUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const startPayload = await startRes.json();

    if (!startRes.ok || !startPayload.runId) {
      const err = new Error(startPayload.message || startPayload.error || 'Failed to start run');
      err.status = startRes.status;
      err.payload = startPayload;
      throw err;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const es = new EventSource(`/api/runs/stream?runId=${encodeURIComponent(startPayload.runId)}`);

      es.addEventListener('progress', (ev) => {
        try {
          setProgressEvents(prev => [...prev, JSON.parse(ev.data)]);
        } catch (e) { /* ignore malformed frame */ }
      });

      es.addEventListener('complete', (ev) => {
        settled = true;
        es.close();
        try {
          resolve(JSON.parse(ev.data));
        } catch (e) {
          reject(new Error('Malformed completion payload'));
        }
      });

      es.addEventListener('failed', (ev) => {
        settled = true;
        es.close();
        let detail = {};
        try { detail = JSON.parse(ev.data); } catch (e) { /* ignore */ }
        const err = new Error(detail.error || 'Investigation failed');
        err.payload = detail;
        reject(err);
      });

      es.onerror = () => {
        if (settled) return;
        es.close();
        // Stream unavailable — fall back to polling rather than failing.
        pollRun(startPayload.runId).then(resolve, reject);
      };
    });
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
      setProgressEvents([]);

      try {
        const body = isBenchmark ? { mode: 'benchmark' } : { asin: cleanAsin };
        const payload = await streamRun('/api/analyze/start', body);

        if (!payload?.success) {
          throw new Error(payload?.error || 'Failed to retrieve product data from Monid');
        }

        setResultsData(payload.data);
      } catch (err) {
        console.error('Analysis error:', err);
        setErrorMessage(err.message || 'An error occurred while connecting to the Monid review pipeline.');
        setErrorDetails(err.payload?.executionMetadata || null);
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
      setProgressEvents([]);

      try {
        const payload = await streamRun('/api/investigate/start', {
          category,
          searchQuery: searchQuery || category
        });

        if (!payload?.success) {
          throw new Error(payload?.error || 'Investigation failed');
        }

        if (payload.trialInfo) {
          setTrialInfo(payload.trialInfo);
        }

        setResultsData(payload.data);
      } catch (err) {
        console.error('Investigation error:', err);

        // Trial exhausted — open the modal so they can connect their own key
        if (err.status === 429 && err.payload?.trialExhausted) {
          setIsKeyModalOpen(true);
          setErrorMessage(err.payload.message);
          return;
        }

        setErrorDetails(err.payload?.executionMetadata || null);
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

  // Quick load from interactive hero proof badges (Instant from cache, $0.00)
  const handleQuickLoadBadge = async (targetTab = 'decision') => {
    setDashboardTab(targetTab);
    setIsLoading(true);
    setCurrentAsin('INVESTIGATION: Portable Blenders');
    setResultsData(null);
    setErrorMessage(null);
    setProgressEvents([]);

    try {
      const payload = await streamRun('/api/investigate/start', { category: 'Portable Blenders' });
      if (!payload?.success) {
        throw new Error(payload?.error || 'Failed to load investigation');
      }
      setResultsData(payload.data);
    } catch (err) {
      console.error('Quick load error:', err);
      // Graceful fallback to saved benchmark
      handleLoadSaved();
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
    setProgressEvents([]);
  };

  return (
    <div className="app-container">
      {/* Navigation Header */}
      <Header 
        onReset={handleReset} 
        hasResults={Boolean(resultsData || isLoading)} 
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        apiKey={monidApiKey}
        trialInfo={trialInfo}
      />

      {/* Cost Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="confirm-overlay" onClick={handleCancelRun}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-header">
              <span className="confirm-icon">⚠️</span>
              <h3>Confirm Live Monid Gateway Execution</h3>
            </div>
            <div className="confirm-body">
              <p>This action will make live calls to Amazon review scrapers via the Monid platform.</p>
              <div className="confirm-pricing-box">
                <div className="pricing-row">
                  <span>Target:</span>
                  <strong>Live Amazon Catalog & Reviews</strong>
                </div>
                <div className="pricing-row">
                  <span>Per-ASIN scraper cost:</span>
                  <strong>$0.0036 / competitor</strong>
                </div>
                <div className="pricing-row highlight">
                  <span>Estimated Total Run Cost:</span>
                  <strong className="text-lime">~$0.018 USD (5 ASINs)</strong>
                </div>
              </div>
              <p className="confirm-note">
                Actual charges will be precisely tracked and displayed in the Monid Cost Receipt upon completion.
              </p>
            </div>
            <div className="confirm-actions">
              <button onClick={handleCancelRun} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleConfirmRun} className="btn-primary-confirm">
                Authorize & Run Live (~$0.018)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Hero Heading */}
        {!resultsData && !isLoading && (
          <Hero onSelectBadge={handleQuickLoadBadge} />
        )}

        {/* Input Card */}
        <AnalysisCard 
          onAnalyze={handleStartAnalysis}
          onInvestigate={handleStartInvestigation}
          onLoadSaved={handleLoadSaved}
          onQuickLoad={handleQuickLoadBadge}
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
            events={progressEvents}
          />
        ) : resultsData ? (
          <ResultsDashboard data={resultsData} initialTab={dashboardTab} />
        ) : !errorMessage && (
          <EmptyState />
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

      {/* Monid Custom API Key & Sponsored Trial Modal */}
      <MonidKeyModal 
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        apiKey={monidApiKey}
        onSaveKey={handleSaveApiKey}
        onRemoveKey={handleRemoveApiKey}
        trialInfo={trialInfo}
      />
    </div>
  );
}
