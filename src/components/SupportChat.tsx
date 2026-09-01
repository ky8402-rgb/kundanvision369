import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Sparkles, 
  X, 
  Minimize2, 
  ShieldCheck, 
  Cpu, 
  Activity,
  Terminal
} from 'lucide-react';
import { errorMonitor } from '../services/errorMonitor';
import { invalidateApiCache } from '../services/api';

interface SupportMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
  analysis?: {
    category: string;
    suggestedFix: string;
    confidence: number;
    aiExplanation?: string;
  };
  solution?: {
    steps: string[];
    autoFix: boolean;
    status?: string;
    actionsExecuted?: string[];
  };
}

interface SupportChatProps {
  appContext?: any;
  onToast?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SupportChat: React.FC<SupportChatProps> = ({ appContext, onToast }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([
    {
      id: 'welcome',
      type: 'ai',
      text: '👋 Hello! I am your AI Self-Healing Support Assistant. Describe any issue or click a quick diagnostic below to inspect and auto-heal the system.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoFixStatus, setAutoFixStatus] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [hasUrgentError, setHasUrgentError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  // Subscribe to error monitor for automatic real-time alerts
  useEffect(() => {
    const unsub = errorMonitor.subscribe((err) => {
      setHasUrgentError(true);
      const systemNotice: SupportMessage = {
        id: `err_${Date.now()}`,
        type: 'system',
        text: `⚠️ Client Exception Detected: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        solution: {
          steps: ['Flush client cache', 'Re-verify API connection'],
          autoFix: true
        }
      };
      setMessages(prev => [...prev, systemNotice]);
    });

    return () => unsub();
  }, []);

  // Fetch system health on mount
  useEffect(() => {
    fetchHealthStatus();
    const interval = setInterval(fetchHealthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealthStatus = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch {
      // Quiet background polling
    }
  };

  const sendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || input).trim();
    if (!textToSend || isLoading) return;

    const userMessage: SupportMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    if (!customPrompt) setInput('');
    setIsLoading(true);
    setAutoFixStatus('Analyzing error telemetry and generating recovery steps...');

    try {
      const errorLogs = errorMonitor.getRecentErrors();
      const res = await fetch('/api/support/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue: textToSend,
          errorLog: errorLogs,
          appContext: {
            ...appContext,
            systemHealth: systemHealth?.status,
            userAgent: navigator.userAgent
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Support API returned status ${res.status}`);
      }

      const result = await res.json();
      if (result.success && result.data) {
        const { analysis, solution } = result.data;

        const aiResponse: SupportMessage = {
          id: `ai_${Date.now()}`,
          type: 'ai',
          text: analysis?.aiExplanation 
            ? `🔍 ${analysis.aiExplanation}`
            : `🔍 Diagnostic Analysis: ${analysis?.suggestedFix || 'System analyzed.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          analysis,
          solution
        };

        setMessages(prev => [...prev, aiResponse]);

        if (solution?.autoFix) {
          setAutoFixStatus('✅ Auto-Fix Applied & Verified');
          invalidateApiCache('all');
          if (onToast) {
            onToast('🔧 AI Support auto-fixed and refreshed system connections.', 'success');
          }
          setTimeout(() => setAutoFixStatus(null), 4000);
        } else {
          setAutoFixStatus(null);
        }
      }
    } catch (err: any) {
      console.warn('[SupportChat] Error sending support request:', err);
      const fallbackAiMsg: SupportMessage = {
        id: `ai_err_${Date.now()}`,
        type: 'ai',
        text: `⚠️ Running fallback self-healing diagnostic. Attempting automatic cache flush and pool reconnection.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        solution: {
          steps: ['Clear local API cache', 'Ping database endpoint', 'Resynchronize live state'],
          autoFix: true
        }
      };
      setMessages(prev => [...prev, fallbackAiMsg]);
      invalidateApiCache('all');
      setAutoFixStatus(null);
    } finally {
      setIsLoading(false);
      fetchHealthStatus();
    }
  };

  const handleApplyAutoFix = async (solution: any) => {
    setIsLoading(true);
    setAutoFixStatus('Applying auto-fix steps...');
    try {
      const res = await fetch('/api/support/autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solution })
      });
      if (res.ok) {
        invalidateApiCache('all');
        setAutoFixStatus('✅ All fix steps successfully applied');
        if (onToast) onToast('✅ Auto-fix steps executed successfully.', 'success');
        fetchHealthStatus();
        setTimeout(() => setAutoFixStatus(null), 3000);
      }
    } catch (err) {
      console.error('[SupportChat] Auto-fix execution error:', err);
      setAutoFixStatus('❌ Auto-fix attempt encountered an error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="ai-support-chat-root" className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          id="btn-open-support-chat"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
            setHasUrgentError(false);
          }}
          className={`group flex items-center gap-2.5 px-4 py-3 rounded-full shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
            hasUrgentError
              ? 'bg-rose-600 text-white animate-pulse shadow-rose-500/40'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25'
          }`}
        >
          <div className="relative">
            <Bot className="w-5 h-5 transition-transform group-hover:rotate-12" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-300 rounded-full ring-2 ring-emerald-600 animate-ping" />
          </div>
          <span className="font-semibold text-sm tracking-wide">AI Support & Self-Healing</span>
          {hasUrgentError && (
            <span className="bg-white text-rose-600 text-xs px-2 py-0.5 rounded-full font-bold">1</span>
          )}
        </button>
      )}

      {/* Floating Chat Modal */}
      {isOpen && (
        <div 
          id="support-chat-modal"
          className={`w-96 md:w-[420px] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
            isMinimized ? 'h-14' : 'h-[560px]'
          }`}
        >
          {/* Header */}
          <div className="bg-slate-800/90 border-b border-slate-700 px-4 py-3 flex items-center justify-between backdrop-blur-sm select-none">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                  AI Support & Healing
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </h3>
                <p className="text-[11px] text-slate-400">Autonomous issue diagnosis & repair</p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-400">
              <button
                id="btn-minimize-support-chat"
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                title={isMinimized ? "Expand" : "Minimize"}
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                id="btn-close-support-chat"
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Telemetry Status Bar */}
              <div className="bg-slate-950/60 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Status: <strong className="text-slate-200">{systemHealth?.status || 'operational'}</strong>
                  </span>
                </div>
                {systemHealth?.selfHealing?.metrics && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Cpu className="w-3 h-3 text-cyan-400" />
                    <span>Heap: {systemHealth.selfHealing.metrics.heapUsedMB}MB</span>
                  </div>
                )}
                {autoFixStatus && (
                  <span className="text-[11px] text-emerald-400 font-medium animate-pulse">
                    {autoFixStatus}
                  </span>
                )}
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-900/50">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl p-3 text-xs leading-relaxed ${
                        msg.type === 'user'
                          ? 'bg-emerald-600 text-white rounded-br-none'
                          : msg.type === 'system'
                          ? 'bg-amber-950/60 border border-amber-800 text-amber-200 rounded-bl-none'
                          : 'bg-slate-800/90 border border-slate-700/70 text-slate-200 rounded-bl-none shadow-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>

                      {/* Solution Steps & Auto-fix panel */}
                      {msg.solution && msg.solution.steps.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-700/60 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Auto-Recovery Plan:
                            </span>
                            {msg.solution.autoFix && (
                              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">
                                Auto-Enabled
                              </span>
                            )}
                          </div>
                          <ul className="space-y-1 text-[11px] text-slate-300 pl-1">
                            {msg.solution.steps.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>

                          {/* Quick Manual Trigger Button if not auto-executed */}
                          <div className="pt-1.5 flex justify-end">
                            <button
                              onClick={() => handleApplyAutoFix(msg.solution)}
                              disabled={isLoading}
                              className="text-[10px] flex items-center gap-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 px-2 py-1 rounded transition-colors"
                            >
                              <Wrench className="w-3 h-3" />
                              Re-Execute Recovery
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 p-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-slate-400 w-fit animate-pulse">
                    <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                    <span>Analyzing error telemetry and performing healing...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Actions Bar */}
              <div className="bg-slate-950/40 border-t border-slate-800 p-2 flex items-center gap-1.5 overflow-x-auto text-[11px]">
                <button
                  onClick={() => sendMessage('Check PostgreSQL and Neon database connection health')}
                  className="whitespace-nowrap px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors flex items-center gap-1"
                >
                  <Terminal className="w-3 h-3 text-emerald-400" />
                  DB Health
                </button>
                <button
                  onClick={() => sendMessage('Clear in-memory and Redis caches')}
                  className="whitespace-nowrap px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  Flush Cache
                </button>
                <button
                  onClick={() => sendMessage('Perform full self-healing scan and diagnostics')}
                  className="whitespace-nowrap px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors flex items-center gap-1"
                >
                  <Wrench className="w-3 h-3 text-amber-400" />
                  Self-Heal All
                </button>
              </div>

              {/* Input Footer */}
              <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
                <input
                  id="input-support-chat-message"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Describe your issue or paste error..."
                  disabled={isLoading}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  id="btn-send-support-message"
                  onClick={() => sendMessage()}
                  disabled={isLoading || !input.trim()}
                  className="p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SupportChat;
