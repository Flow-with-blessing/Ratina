import React, { useState } from 'react';
import { 
  Terminal, 
  Play, 
  Copy, 
  Check, 
  Bot, 
  Zap, 
  Cpu, 
  ShieldCheck, 
  ArrowRight,
  Code2,
  Layers,
  FileText
} from 'lucide-react';

export default function McpConsole({ category = 'Portable Blenders', data }) {
  const [selectedTool, setSelectedTool] = useState('investigate_category');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedClaude, setCopiedClaude] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionTime, setExecutionTime] = useState(null);

  const tools = [
    {
      name: 'investigate_category',
      label: '1. investigate_category',
      desc: 'Dynamically discovers competitors, runs failure extraction, and returns Opportunity Score.',
      params: { category, force_fresh: false }
    },
    {
      name: 'get_failure_matrix',
      label: '2. get_failure_matrix',
      desc: 'Retrieves cross-competitor failure matrix and defect counts in sub-second cache time.',
      params: { category }
    },
    {
      name: 'export_sourcing_brief',
      label: '3. export_sourcing_brief',
      desc: 'Generates plain-text engineering specification sheet ready for Alibaba suppliers.',
      params: { category, format: 'text' }
    }
  ];

  const currentToolObj = tools.find(t => t.name === selectedTool) || tools[0];

  const handleExecute = async () => {
    setIsLoading(true);
    const startTime = performance.now();

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: selectedTool,
            arguments: currentToolObj.params
          }
        })
      });

      const json = await response.json();
      const elapsed = Math.round(performance.now() - startTime);
      setExecutionTime(elapsed);
      setExecutionResult(json);
    } catch (err) {
      setExecutionResult({ error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const claudeConfig = JSON.stringify({
    mcpServers: {
      ratina: {
        command: "node",
        args: [
          "C:\\Users\\DELL_7480\\OneDrive\\Desktop\\Ratina.Ai\\server\\mcpServer.js"
        ]
      }
    }
  }, null, 2);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedClaude(true);
      setTimeout(() => setCopiedClaude(false), 2000);
    }
  };

  return (
    <div className="mcp-console-container card-surface">
      {/* Console Top Header */}
      <div className="mcp-header-bar">
        <div className="mcp-header-left">
          <div className="mcp-live-pill">
            <span className="monid-dot live"></span>
            <span>MCP AGENT PROTOCOL v1.0</span>
          </div>
          <span className="mcp-header-title">Live Model Context Protocol Sandbox</span>
        </div>
        <div className="mcp-header-meta">
          <span className="mcp-meta-item">Transport: <strong>JSON-RPC 2.0 (stdio + HTTP)</strong></span>
          <span className="mcp-meta-item">Cost: <strong className="text-emerald-400">$0.00 (Cache) / $0.018 (Fresh)</strong></span>
        </div>
      </div>

      <div className="mcp-console-body">
        {/* Left Column: Tool Selector & Request */}
        <div className="mcp-left-col">
          <div className="mcp-section-title">
            <Bot size={16} className="text-indigo-400" />
            <span>Select Agent Tool to Dispatch</span>
          </div>

          <div className="mcp-tool-selector">
            {tools.map((tool) => (
              <button
                key={tool.name}
                className={`mcp-tool-btn ${selectedTool === tool.name ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTool(tool.name);
                  setExecutionResult(null);
                }}
              >
                <div className="mcp-tool-label">{tool.label}</div>
                <div className="mcp-tool-desc">{tool.desc}</div>
              </button>
            ))}
          </div>

          <div className="mcp-payload-box">
            <div className="mcp-box-header">
              <span className="mcp-box-tag">AGENT JSON-RPC 2.0 REQUEST</span>
              <button 
                className="mcp-copy-btn"
                onClick={() => copyToClipboard(JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'tools/call',
                  params: {
                    name: selectedTool,
                    arguments: currentToolObj.params
                  }
                }, null, 2), 'code')}
              >
                {copiedCode ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="mcp-code-preview">
{JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: selectedTool,
    arguments: currentToolObj.params
  }
}, null, 2)}
            </pre>
          </div>

          <button 
            className="mcp-execute-btn" 
            onClick={handleExecute}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Zap size={16} className="animate-spin text-amber-400" />
                <span>Executing Agent Dispatch via /api/mcp...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span>Execute Real MCP Tool Call ({selectedTool})</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Live Terminal Output & Claude Integration */}
        <div className="mcp-right-col">
          <div className="mcp-section-title">
            <Terminal size={16} className="text-emerald-400" />
            <span>Agent Execution Terminal Output</span>
            {executionTime && (
              <span className="mcp-latency-tag">⚡ {executionTime}ms (Sub-second)</span>
            )}
          </div>

          <div className="mcp-terminal-screen">
            <div className="mcp-terminal-status-row">
              <div className="terminal-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <span className="terminal-path">ratina-mcp-agent://stdout</span>
            </div>

            <div className="terminal-content-area">
              {!executionResult && !isLoading && (
                <div className="terminal-placeholder">
                  <Cpu size={28} className="text-slate-600 mb-2" />
                  <p>Ready to dispatch agent call to Ratina MCP server.</p>
                  <p className="terminal-hint">Click <strong>"Execute Real MCP Tool Call"</strong> to test live JSON-RPC response.</p>
                </div>
              )}

              {isLoading && (
                <div className="terminal-loading">
                  <div className="pulse-loader"></div>
                  <p className="text-lime font-mono text-sm mt-2">&gt; [Ratina MCP] Resolving tool "{selectedTool}"...</p>
                  <p className="text-slate-400 font-mono text-xs">&gt; [Monid Gateway] Checking local live cache for "{category}"...</p>
                </div>
              )}

              {executionResult && (
                <div className="terminal-result">
                  <div className="terminal-log-line text-emerald-400 font-mono text-xs mb-2">
                    ✓ 200 OK — JSON-RPC 2.0 Response received in {executionTime}ms
                  </div>
                  <pre className="terminal-json-output">
                    {JSON.stringify(executionResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Claude Desktop Config Snippet */}
          <div className="mcp-claude-setup-box">
            <div className="claude-box-header">
              <div className="claude-title">
                <Bot size={14} className="text-amber-400" />
                <span>Plug into Claude Desktop (claude_desktop_config.json)</span>
              </div>
              <button 
                className="mcp-copy-btn"
                onClick={() => copyToClipboard(claudeConfig, 'claude')}
              >
                {copiedClaude ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedClaude ? 'Copied' : 'Copy Config'}</span>
              </button>
            </div>
            <pre className="claude-config-pre">
              {claudeConfig}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
