import React, { useState } from 'react';
import { 
  Key, 
  ShieldCheck, 
  ExternalLink, 
  X, 
  Check, 
  Gift, 
  Sparkles, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle 
} from 'lucide-react';

export default function MonidKeyModal({ 
  isOpen, 
  onClose, 
  apiKey, 
  onSaveKey, 
  onRemoveKey, 
  trialInfo 
}) {
  const [inputKey, setInputKey] = useState(apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (!inputKey.trim()) return;
    onSaveKey(inputKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const handleRemove = () => {
    setInputKey('');
    onRemoveKey();
  };

  const runsUsed = trialInfo?.runsUsed ?? 0;
  const maxRuns = trialInfo?.maxRuns ?? 3;
  const runsRemaining = Math.max(0, maxRuns - runsUsed);
  const isCustomKey = Boolean(apiKey);

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="monid-key-modal card-surface" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header-row">
          <div className="modal-header-left">
            <div className="modal-icon-badge">
              <Key size={18} className="text-lime" />
            </div>
            <div>
              <h3 className="modal-title">Monid API Gateway Access</h3>
              <p className="modal-subtitle">Pay-per-call live scraping infrastructure ($0.018 / run)</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Status Indicator Card */}
        <div className={`modal-status-card ${isCustomKey ? 'status-custom' : 'status-trial'}`}>
          <div className="status-card-header">
            {isCustomKey ? (
              <>
                <ShieldCheck size={16} className="text-emerald-400" />
                <span className="font-semibold text-emerald-400">Custom Monid Account Connected</span>
              </>
            ) : (
              <>
                <Gift size={16} className="text-amber-400" />
                <span className="font-semibold text-amber-400">Sponsored Free Trial Active</span>
              </>
            )}
          </div>
          <p className="status-card-desc">
            {isCustomKey ? (
              'All live Amazon investigations and MCP agent calls will use your private Monid account balance.'
            ) : (
              `Normal Helium 10 shoppers get ${maxRuns} live audits on the house, sponsored by Ratina. You have ${runsRemaining} free live audit${runsRemaining === 1 ? '' : 's'} remaining.`
            )}
          </p>
          {!isCustomKey && (
            <div className="trial-progress-bar">
              <div 
                className="trial-progress-fill" 
                style={{ width: `${(runsUsed / maxRuns) * 100}%` }}
              ></div>
            </div>
          )}
        </div>

        {/* Custom API Key Form */}
        <form onSubmit={handleSave} className="modal-form">
          <label className="modal-input-label">
            <span>Connect Custom Monid API Key (Optional)</span>
            <a 
              href="https://monid.ai" 
              target="_blank" 
              rel="noreferrer" 
              className="get-key-link"
            >
              Get a key at monid.ai <ExternalLink size={11} />
            </a>
          </label>

          <div className="modal-input-group">
            <div className="input-prefix-icon">
              <Lock size={15} />
            </div>
            <input 
              type={showKey ? 'text' : 'password'}
              className="modal-key-input"
              placeholder="monid_live_..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
            <button 
              type="button" 
              className="toggle-visibility-btn"
              onClick={() => setShowKey(!showKey)}
              tabIndex="-1"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <p className="modal-privacy-note">
            🔒 Stored locally in your browser's <code>localStorage</code>. Never committed or sent to any server other than the Monid API gateway.
          </p>

          <div className="modal-actions-row">
            {isCustomKey && (
              <button 
                type="button" 
                className="btn-remove-key"
                onClick={handleRemove}
              >
                Switch to Sponsored Trial
              </button>
            )}
            
            <button 
              type="submit" 
              className="btn-save-key"
              disabled={!inputKey.trim()}
            >
              {savedSuccess ? (
                <>
                  <Check size={16} className="text-emerald-400" />
                  <span>Key Saved!</span>
                </>
              ) : (
                <>
                  <Key size={15} />
                  <span>{isCustomKey ? 'Update Key' : 'Save & Connect Monid'}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Incumbent Kill Callout */}
        <div className="modal-footer-callout">
          <Sparkles size={14} className="text-lime" />
          <span>
            <strong>Helium 10 charges $99/month.</strong> With your own Monid account, every full 5-competitor audit costs just <strong>$0.01815</strong>.
          </span>
        </div>
      </div>
    </div>
  );
}
