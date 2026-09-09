import React from 'react';
import { ShieldCheck, Sparkles, Layers, DollarSign, Zap, ExternalLink, Terminal, ChevronRight } from 'lucide-react';

export default function Hero({ onSelectBadge }) {
  return (
    <section className="hero-section">
      {/* The Kill — What Died, in the first 5 seconds */}
      <div className="hero-kill-banner">
        <div className="hero-kill-header">
          <Zap size={16} className="kill-icon" />
          <span>THE KILL</span>
        </div>
        <div className="hero-kill-comparison">
          <div className="hero-kill-dead">
            <span className="kill-label">Helium 10 Review Insights</span>
            <span className="kill-price kill-price-dead">
              <s>$99.00</s>
              <span className="kill-period">/month</span>
            </span>
            <a 
              href="https://www.helium10.com/pricing/" 
              target="_blank" 
              rel="noreferrer"
              className="kill-verify-link"
            >
              <ExternalLink size={11} />
              Verified price →
            </a>
          </div>
          <div className="hero-kill-arrow">→</div>
          <div className="hero-kill-alive">
            <span className="kill-label">Ratina API & MCP Server</span>
            <span className="kill-price kill-price-alive">
              $0.018
              <span className="kill-period">/run</span>
            </span>
            <span className="kill-via">via Monid pay-per-call</span>
          </div>
        </div>
        <div className="hero-kill-savings">
          That's <strong>5,500 analyses</strong> before you hit $99. Most sourcing decisions need 1–3.
        </div>
      </div>

      <div className="hero-pill">
        <Sparkles size={14} />
        <span>AMAZON PRODUCT INTELLIGENCE API & MCP SERVER — POWERED BY MONID</span>
      </div>

      <h1 className="hero-title">
        Search Before You Source.<br />
        <span className="hero-title-accent">Amazon Competitor Defect Intelligence. Without the $99/mo Bill.</span>
      </h1>

      <p className="hero-subtext">
        Before you manufacture or source an Amazon product, Ratina audits 5 competing brands on live customer review data to reveal every recurring failure mode, defect rate, and factory tolerance fix. Powered by Monid pay-per-call at $0.018/run. Built for humans and autonomous AI agents over MCP.
      </p>

      {/* Interactive Proof Badges Row */}
      <div className="hero-badges-row">
        <button 
          className="hero-proof-badge clickable" 
          onClick={() => onSelectBadge && onSelectBadge('decision')}
          title="Click to view live 5-competitor audit"
        >
          <ShieldCheck size={14} className="badge-icon-emerald" />
          <span>Live Amazon Data via Monid</span>
          <ChevronRight size={12} className="badge-arrow" />
        </button>
        <button 
          className="hero-proof-badge clickable" 
          onClick={() => onSelectBadge && onSelectBadge('matrix')}
          title="Click to view failure patterns across competitors"
        >
          <Layers size={14} className="badge-icon-indigo" />
          <span>Cross-Competitor Failure Matrix</span>
          <ChevronRight size={12} className="badge-arrow" />
        </button>
        <button 
          className="hero-proof-badge clickable" 
          onClick={() => onSelectBadge && onSelectBadge('receipt')}
          title="Click to inspect exact $0.01815 Monid receipt"
        >
          <DollarSign size={14} className="badge-icon-amber" />
          <span>Measured Cost: $0.01815 for 5 competitors</span>
          <ChevronRight size={12} className="badge-arrow" />
        </button>
        <button 
          className="hero-proof-badge clickable" 
          onClick={() => onSelectBadge && onSelectBadge('mcp')}
          title="Click to test live Agent MCP Console"
        >
          <Terminal size={14} className="badge-icon-blue" />
          <span>MCP Server for Claude / Cursor</span>
          <ChevronRight size={12} className="badge-arrow" />
        </button>
      </div>

      {/* MCP Quick-Start Snippet */}
      <div className="hero-mcp-snippet">
        <div className="hero-mcp-label">
          <Terminal size={13} />
          <span>Add to claude_desktop_config.json</span>
        </div>
        <pre className="hero-mcp-code">{`{
  "mcpServers": {
    "ratina-ai": {
      "command": "node",
      "args": ["server/mcpServer.js"],
      "cwd": "/path/to/Ratina.Ai"
    }
  }
}`}</pre>
      </div>
    </section>
  );
}
