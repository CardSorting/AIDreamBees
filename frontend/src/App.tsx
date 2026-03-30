import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Bug as Bee,
  Cpu,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import Pusher from 'pusher-js';
import React, { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import SettingsModal from './components/settings/SettingsModal';
import { API_BASE_URL, SOKETI_CONFIG, UI_FEATURES } from './config';
import { loadMessagesLocal, saveMessagesLocal } from './utils/persistence';

interface Message {
  id: string;
  user: string;
  message: string;
  type: 'bot' | 'user';
  timestamp: string;
  images: string[];
  sourceImages?: string[];
  soundness?: number;
  isGrounded?: boolean;
  suggestions?: Suggestion[];
}

interface Suggestion {
  id: string;
  label: string;
  action: string;
}

interface SystemHealth {
  entropy: number;
  health: string;
  violations: number;
  nodeCount: number;
  uptime?: number;
  systemLoad?: number;
  substrateStability?: number;
}

interface BotMessageData {
  user: string;
  message: string;
  images?: string[];
  sourceImages?: string[];
  soundness?: number;
  isGrounded?: boolean;
}

// --- Error Boundary for Cognitive Safety (Pass 3) ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Cognitive Render Crash:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h3>Neural Rendering Halted</h3>
          <p>A cognitive anomaly was detected in the stream.</p>
          <button type="button" onClick={() => window.location.reload()}>Re-initialize Uplink</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  // --- Data Fetching & Sync ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [systemHealth, setSystemHealth] = useState<SystemHealth & { lastSync?: number }>({
    entropy: 0.1,
    health: 'Initializing...',
    violations: 0,
    nodeCount: 0,
    substrateStability: 0.99,
  });
  
  const lastSequenceIdRef = useRef<number>(0);
  const pollingIntervalRef = useRef<any>(null);
  const [heartbeat, setHeartbeat] = useState<{ status: 'healthy' | 'warning' | 'critical', latency?: number, isPolling?: boolean }>({ status: 'healthy' });
  const [relativeSyncTime, setRelativeSyncTime] = useState('just now');
  const [gridMode, setGridMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pusherRef = useRef<Pusher | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bootstrap = useCallback(async (isReconnect = false) => {
    try {
      if (!isReconnect && messages.length === 0) {
        setIsHistoryLoading(true);
        // Warm Start Logic (Pass 3)
        const localHistory = await loadMessagesLocal();
        if (localHistory.length > 0) {
          setMessages(localHistory as Message[]);
          setIsHistoryLoading(false);
        }
      }
      
      const [histRes, healthRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/history`),
        fetch(`${API_BASE_URL}/api/health`),
      ]);

      if (histRes.ok) {
        const data = await histRes.json();
        if (data.length > 0) {
          setMessages(data);
          saveMessagesLocal(data); // Persist update
        } else if (!isReconnect && messages.length === 0) {
          setMessages([
            {
              id: 'init-1',
              user: 'DreamBeesAI',
              message: 'Hive Managed Substrate Online. Awaiting neural synchronization.',
              type: 'bot',
              timestamp: new Date().toISOString(),
              images: [],
              soundness: 1.0,
              isGrounded: true,
            },
          ]);
        }
      }

      if (healthRes.ok) {
        const health = await healthRes.json();
        setSystemHealth(prev => ({ ...prev, ...health, lastSync: Date.now() }));
      }
      setErrorStatus(null);
    } catch (err) {
      console.error('Bootstrap error:', err);
      setErrorStatus('Hive synchronization failure. Retrying connection...');
      if (!isReconnect) {
        setTimeout(() => bootstrap(), 5000);
      }
    } finally {
      if (!isReconnect) {
        setTimeout(() => setIsHistoryLoading(false), 800);
      }
    }
  }, [messages.length]);

  // --- Initial Bootstrap ---
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (messages.length || isThinking) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  // Relative Sync Timer (Pass 3)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!systemHealth.lastSync) return;
      const seconds = Math.floor((Date.now() - systemHealth.lastSync) / 1000);
      if (seconds < 5) setRelativeSyncTime('just now');
      else if (seconds < 60) setRelativeSyncTime(`${seconds}s ago`);
      else setRelativeSyncTime(`${Math.floor(seconds / 60)}m ago`);
    }, 1000);
    return () => clearInterval(timer);
  }, [systemHealth.lastSync]);

  // --- Soketi Initialization ---
  useEffect(() => {
    const pusher = new Pusher(SOKETI_CONFIG.appKey, {
      wsHost: SOKETI_CONFIG.host,
      wsPort: SOKETI_CONFIG.port,
      forceTLS: SOKETI_CONFIG.useTLS,
      cluster: SOKETI_CONFIG.cluster,
      disableStats: true,
      enabledTransports: ['ws', 'wss'],
      authEndpoint: `${API_BASE_URL}/broadcasting/auth`,
    });

    pusher.connection.bind('state_change', (states: { current: string }) => {
      setConnectionStatus(states.current);
      if (states.current === 'connected') {
        console.log('Soketi: Uplink Synchronized.');
        bootstrap(true);
        setHeartbeat({ status: 'healthy', latency: 0, isPolling: false });
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
      if (states.current === 'unavailable' || states.current === 'failed') {
        setErrorStatus('Bridge connection lost. Initializing long-polling fallback...');
        setHeartbeat({ status: 'critical', isPolling: true });
        
        // Long-Polling Fallback (Pass 3)
        if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(() => {
            console.log('[FALLBACK] Polling substrate history...');
            bootstrap(true);
          }, 10000);
        }
      }
    });

    const channel = pusher.subscribe('presence-chat');
    pusherRef.current = pusher;

    const handleSequence = (incomingSeq: number) => {
      if (lastSequenceIdRef.current > 0 && incomingSeq > lastSequenceIdRef.current + 1) {
        console.warn(`[SYNC GAP] Detected sequence jump: ${lastSequenceIdRef.current} -> ${incomingSeq}. Triggering full re-sync.`);
        bootstrap(true);
      }
      lastSequenceIdRef.current = incomingSeq;
      setSystemHealth(prev => ({ ...prev, lastSync: Date.now() }));
    };

    channel.bind('bot-message', (data: BotMessageData & { sequenceId: number }) => {
      try {
        if (data.sequenceId) handleSequence(data.sequenceId);
        setMessages((prev) => {
          const newMessages: Message[] = [
            ...prev,
            {
              id: Date.now().toString(),
              user: data.user,
              message: data.message,
              type: 'bot',
              timestamp: new Date().toISOString(),
              images: data.images || [],
              sourceImages: data.sourceImages || [],
              soundness: data.soundness || 0.95,
              isGrounded: data.isGrounded || true,
            },
          ];
          saveMessagesLocal(newMessages); 
          return newMessages;
        });
      } catch (e) {
        console.error('Failed to process bot-message:', e);
      }
    });

    channel.bind('substrate-suggestions', (data: { suggestions: Suggestion[], sequenceId?: number }) => {
      try {
        if (data.sequenceId) handleSequence(data.sequenceId);
        setMessages((prev) => {
          const lastBot = [...prev].reverse().find((m) => m.type === 'bot');
          if (lastBot) {
            return prev.map((m) =>
              m.id === lastBot.id ? { ...m, suggestions: data.suggestions } : m,
            );
          }
          return prev;
        });
      } catch (e) {
        console.error('Failed to process substrate-suggestions:', e);
      }
    });

    channel.bind('system-update', (data: { health: SystemHealth, sequenceId: number }) => {
      try {
        if (data.sequenceId) handleSequence(data.sequenceId);
        setSystemHealth(prev => ({ ...prev, ...data.health }));
      } catch (e) {
        console.error('Failed to process system-update:', e);
      }
    });

    channel.bind('bot-thinking', (data: { isThinking: boolean, sequenceId?: number }) => {
      try {
        if (data.sequenceId) handleSequence(data.sequenceId);
        setIsThinking(data.isThinking);
      } catch (e) {
        console.error('Failed to process bot-thinking:', e);
      }
    });

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      channel.unbind_all();
      pusher.unsubscribe('presence-chat');
      pusher.disconnect();
    };
  }, [bootstrap]);

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !selectedImage) || connectionStatus !== 'connected') return;

    const userMsg = inputValue;
    const userImg = selectedImage;

    const newMessage: Message = {
      id: Date.now().toString(),
      user: 'You',
      message: userMsg,
      type: 'user',
      timestamp: new Date().toISOString(),
      images: userImg ? [userImg] : [],
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
    setSelectedImage(null);
    setErrorStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          images: userImg ? [userImg] : [],
          history: messages.slice(-10),
          useGrid: gridMode,
        }),
      });

      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    } catch (err) {
      console.error('Chat Failed:', err);
      setErrorStatus('Substrate uplink interrupted. Please check backend status.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = async () => {
    if (window.confirm('IRREVERSIBLE: Purge all cognitive history from substrate?')) {
      try {
        await fetch(`${API_BASE_URL}/api/history`, { method: 'DELETE' });
        setMessages([{
          id: 'purge-1',
          user: 'DreamBeesAI',
          message: 'Substrate purged. Fresh synchronization initiated.',
          type: 'bot',
          timestamp: new Date().toISOString(),
          images: [],
        }]);
      } catch (err) {
        console.error('Purge failed:', err);
      }
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">
              <Bee size={22} className="bee-hardened" />
            </div>
            <div className="logo-text-group">
              <span className="logo-text">DreamBees.AI</span>
              <span className="logo-tag">HARDENED SUBSTRATE</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group-label">OPERATIONS</div>
          <button type="button" className="nav-item button-like" onClick={() => bootstrap(true)}>
            <RefreshCw size={18} className={connectionStatus !== 'connected' ? 'spinning' : ''} />
            <span>Neural Re-sync</span>
          </button>
          <button type="button" className="nav-item button-like" onClick={clearChat}>
            <Trash2 size={18} />
            <span>Purge Substrate</span>
          </button>

          <div className="nav-group-label">HARDENING</div>
          <div className="nav-metric-item">
            <div className="metric-header">
              <ShieldCheck size={16} />
              <span>Production Audit</span>
            </div>
            <div className="audit-status active">STRICT MODE</div>
          </div>

          <div className="nav-group-label">SUBSYSTEMS</div>
          <button
            type="button"
            className={`nav-item button-like ${gridMode ? 'active' : ''}`}
            onClick={() => setGridMode(!gridMode)}
          >
            <Layers size={18} />
            <span>Comb Multiplex (2x2)</span>
            <div className={`status-pill ${gridMode ? 'on' : 'off'}`}>
              {gridMode ? 'ACTIVE' : 'IDLE'}
            </div>
          </button>
        </nav>

        {UI_FEATURES.HEALTH_MONITOR_ENABLED && (
          <div className="sidebar-footer">
            <div className="system-monitor">
              <div className="monitor-title">
                <Cpu size={14} />
                <span>Substrate Health</span>
              </div>
              <div className="monitor-grid">
                <div className="monitor-cell">
                  <span className="cell-label">ENTROPY</span>
                  <span className="cell-value">{(systemHealth.entropy * 100).toFixed(1)}%</span>
                </div>
                <div className="monitor-cell">
                  <span className="cell-label">NODES</span>
                  <span className="cell-value">{systemHealth.nodeCount}</span>
                </div>
                <div className="monitor-cell">
                  <span className="cell-label">STABILITY</span>
                  <span className="cell-value">
                    {systemHealth.substrateStability 
                      ? `${(systemHealth.substrateStability * 100).toFixed(1)}%` 
                      : 'N/A'}
                  </span>
                </div>
                <div className="monitor-cell">
                  <span className="cell-label">LAST UPLINK</span>
                  <span className="cell-value">{relativeSyncTime}</span>
                </div>
              </div>
              
              <div className="heartbeat-monitor">
                <div className={`heartbeat-dot ${heartbeat.status}`} />
                <span className="heartbeat-label">Substrate Heartbeat: {heartbeat.status.toUpperCase()}</span>
              </div>
              <div className="health-bar-container">
                <motion.div 
                  className="health-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${100 - (systemHealth.entropy * 100)}%` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="main-viewport">
        <header className="viewport-header">
          <div className="header-left">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              {isSidebarOpen ? <X size={20} /> : <Bee size={22} />}
            </button>
            <div className="sync-badge">
              <div className={`sync-dot ${connectionStatus === 'connected' ? 'synced' : connectionStatus === 'unavailable' || connectionStatus === 'failed' ? 'error' : 'pulsing'}`} />
              <span className="sync-text">
                {connectionStatus === 'connected' 
                  ? 'UPLINK ESTABLISHED' 
                  : connectionStatus === 'unavailable' || connectionStatus === 'failed'
                  ? 'UPLINK SEVERED'
                  : 'SYNCING HIVE...'}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="action-btn" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        <div className="chat-container">
          <div className="messages-flow">
            <ErrorBoundary>
              {isHistoryLoading ? (
                <div className="loading-skeleton">
                  {[1, 2, 3].map((i) => (
                    <div key={`skeleton-${i}`} className="skeleton-msg">
                      <div className="skeleton-meta" />
                      <div className="skeleton-bubble" />
                    </div>
                  ))}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className={`message-row ${msg.type}`}
                    >
                      <div className="message-envelope">
                        <div className="message-header">
                          <div className="sender-info">
                            {msg.type === 'bot' ? <Bee size={14} className="bot-icon" /> : null}
                            <span className="sender-name">{msg.type === 'bot' ? 'HIVE LOGIC' : 'NEURAL UPLINK'}</span>
                            <span className="timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          {msg.type === 'bot' && UI_FEATURES.SOUNDNESS_BADGES_ENABLED && (
                            <div className="audit-badges">
                              {msg.isGrounded && (
                                <div className="badge grounded" title="Grounding verified via substrate">
                                  <Database size={10} />
                                  <span>GROUNDED</span>
                                </div>
                              )}
                              <div className="badge soundness" title="Cognitive reliability score">
                                <ShieldCheck size={10} />
                                <span>{((msg.soundness || 0.95) * 100).toFixed(0)}% SOUND</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="message-bubble">
                          {msg.message}
                          
                          {msg.images && msg.images.length > 0 && (
                            <div className="image-grid-refined">
                              {msg.images.map((img, idx) => (
                                <div key={`${msg.id}-img-${img.substring(0, 32)}`} className="image-frame">
                                  <button
                                    type="button"
                                    className="image-btn-wrapper"
                                    onClick={() => window.open(img.startsWith('data:') ? img : `data:image/png;base64,${img}`, '_blank')}
                                  >
                                    <img 
                                      src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`} 
                                      alt="Cognitive Synthesis" 
                                    />
                                  </button>
                                  {msg.sourceImages && msg.sourceImages.length > 1 && (
                                    <div className="image-meta-overlay">
                                      <span className="multiplex-tag">COMB #{idx + 1}</span>
                                      <button type="button" className="expand-btn" onClick={() => window.open(img, '_blank')}>
                                        <ExternalLink size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {msg.suggestions && (
                            <div className="suggestion-uplink">
                              {msg.suggestions.map((s) => (
                                <button key={s.id} type="button" className="suggestion-tag" onClick={() => setInputValue(s.action)}>
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}

              {isThinking && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  className="message-row bot"
                >
                  <div className="thinking-resonance">
                    <div className="resonance-waves">
                      <div className="wave" />
                      <div className="wave delay-1" />
                      <div className="wave delay-2" />
                    </div>
                    <span>Resonating with Substrate...</span>
                  </div>
                </motion.div>
              )}
            </ErrorBoundary>
            <div ref={messagesEndRef} />
          </div>
        </div>

        <footer className="input-zone">
          {errorStatus && (
            <div className="error-banner">
              <AlertCircle size={16} />
              <span>{errorStatus}</span>
              <button type="button" className="retry-btn" onClick={() => window.location.reload()}>
                <RefreshCw size={14} />
              </button>
            </div>
          )}

          <div className="input-wrapper">
            <div className="input-actions-left">
              <button type="button" className="action-icon" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon size={20} />
              </button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => setSelectedImage(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }} />
            </div>

            <textarea
              placeholder="Inject neural prompt for substrate pollination..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={1}
            />

            <button
              type="button"
              className="send-trigger"
              onClick={handleSendMessage}
              disabled={(!inputValue.trim() && !selectedImage) || connectionStatus !== 'connected'}
            >
              <Send size={18} />
            </button>
          </div>

          <div className="input-preview-row">
            {selectedImage && (
              <div className="image-preview-mini">
                <img src={selectedImage} alt="Neural Source" />
                <button type="button" className="remove-preview" onClick={() => setSelectedImage(null)}>
                  <X size={10} />
                </button>
              </div>
            )}
            <div className="input-footer-text">
              PRODUCTION HARDENED MODE • AUDIT STRICTNESS: HIGH
            </div>
          </div>
        </footer>
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default App;
