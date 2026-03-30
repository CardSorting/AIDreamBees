import {
  AlertCircle,
  Bee,
  Bot,
  Flame,
  Image as ImageIcon,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import Pusher from 'pusher-js';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import SettingsModal from './components/settings/SettingsModal';

const API_BASE_URL = 'http://localhost:3001';
const PUSHER_KEY = 'app-key';
const PUSHER_CLUSTER = 'mt1';
const PUSHER_HOST = '127.0.0.1';
const PUSHER_PORT = 6001;

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
}

const App = () => {
  // --- Data Fetching & Sync ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // Base64 string
  const [isThinking, setIsThinking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [_isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [_systemHealth, setSystemHealth] = useState<SystemHealth>({
    entropy: 0.1,
    health: 'Initializing...',
    violations: 0,
    nodeCount: 0,
  });
  const [gridMode, setGridMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pusherRef = useRef<Pusher | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Initial Bootstrap from Persistent Backend ---
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [histRes, healthRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/history`),
          fetch(`${API_BASE_URL}/api/health`),
        ]);

        if (histRes.ok) {
          const data = await histRes.json();
          if (data.length > 0) {
            setMessages(data);
          } else {
            setMessages([
              {
                id: '1',
                user: 'DreamBeesAI',
                message: 'Hive Mind online. Pollinating the substrate with intelligence.',
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
          setSystemHealth(health);
        }
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    bootstrap();
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // --- Pusher Initialization ---
  useEffect(() => {
    const pusher = new Pusher(PUSHER_KEY, {
      wsHost: PUSHER_HOST,
      wsPort: PUSHER_PORT,
      forceTLS: false,
      cluster: PUSHER_CLUSTER,
      disableStats: true,
      enabledTransports: ['ws', 'wss'],
      authEndpoint: `${API_BASE_URL}/broadcasting/auth`,
    });

    pusher.connection.bind('state_change', (states: { current: string }) => {
      setConnectionStatus(states.current);
    });

    const channel = pusher.subscribe('presence-chat');
    pusherRef.current = pusher;

    channel.bind('bot-message', (data: {
      user: string;
      message: string;
      images?: string[];
      sourceImages?: string[];
      soundness?: number;
      isGrounded?: boolean;
    }) => {
      const msgId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          user: data.user,
          message: data.message,
          type: 'bot',
          timestamp: new Date().toISOString(),
          images: data.images || [],
          sourceImages: data.sourceImages || [],
          soundness: data.soundness || 1.0,
          isGrounded: data.isGrounded || false,
        },
      ]);
    });

    // Handle Proactive Suggestions from Substrate
    channel.bind('substrate-suggestions', (data: { suggestions: Suggestion[] }) => {
      // Find the last bot message and attach suggestions
      setMessages((prev) => {
        const lastBot = [...prev].reverse().find((m) => m.type === 'bot');
        if (lastBot) {
          return prev.map((m) =>
            m.id === lastBot.id ? { ...m, suggestions: data.suggestions } : m,
          );
        }
        return prev;
      });
    });

    channel.bind('system-update', (data: { health: SystemHealth }) => {
      setSystemHealth(data.health);
    });

    channel.bind('bot-thinking', (data: { isThinking: boolean }) => {
      setIsThinking(data.isThinking);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe('presence-chat');
      pusher.disconnect();
    };
  }, []);

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setInputValue(suggestion.action);
    // Explicitly focus input if needed
  };

  // --- Image Selection ---
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Multimodal Message API Call ---
  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !selectedImage) || connectionStatus !== 'connected') return;

    const userMsg = inputValue;
    const userImg = selectedImage;

    // Optimistically update UI
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
          history: messages,
          useGrid: gridMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
    } catch (err) {
      console.error('Chat Failed:', err);
      setErrorStatus('Failed to send message. Is the backend server running?');
    }
  };

  const clearChat = async () => {
    if (window.confirm('Are you sure you want to clear your chat history forever?')) {
      try {
        await fetch(`${API_BASE_URL}/api/history`, { method: 'DELETE' });
        setMessages([
          {
            id: '1',
            user: 'DreamBeesAI',
            message: 'Hive history purged. A fresh colony begins.',
            type: 'bot',
            timestamp: new Date().toISOString(),
            images: [],
          },
        ]);
      } catch (err) {
        console.error('Failed to clear history:', err);
        alert('Failed to clear history on the server.');
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="logo-container">
          <div className="logo-icon">
            <Bee size={20} />
          </div>
          <span className="logo-text">DreamBeesAI</span>
        </div>

        <nav>
          <div className="nav-item active">
            <Zap size={18} />
            <span>Hive Mode</span>
          </div>
          <button type="button" className="nav-item button-like" onClick={clearChat}>
            <Trash2 size={18} />
            <span>Purge Hive</span>
          </button>
        </nav>

        <div className="sidebar-section">
          <div className="section-title">Nectar Yields</div>
          <button
            type="button"
            className={`nav-item button-like ${gridMode ? 'active' : ''}`}
            onClick={() => setGridMode(!gridMode)}
          >
            <div className={`toggle-switch ${gridMode ? 'on' : ''}`}>
              <div className="toggle-knob" />
            </div>
            <span>Comb Layout</span>
          </button>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button
            type="button"
            className="nav-item button-like"
            onClick={() => setIsSettingsOpen(true)}
            style={{ width: '100%', textAlign: 'left' }}
          >
            <Settings size={18} />
            <span>Hive Configuration</span>
          </button>
        </div>
      </aside>

      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="main-chat">
        <header className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="menu-toggle"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              {isSidebarOpen ? <X size={20} /> : <Bee size={20} />}
            </button>
            <div className="status-badge">
              <div
                className={`status-dot ${connectionStatus !== 'connected' ? 'connecting' : ''}`}
              />
              <span className="status-text">
                {connectionStatus === 'connected' ? 'Hive Mind Online' : 'Connecting...'}
              </span>
            </div>
          </div>
          <div className="header-title">
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Swarm-Powered AI</span>
          </div>
        </header>

        {errorStatus && (
          <div
            style={{
              backgroundColor: '#450a0a',
              color: '#fecaca',
              padding: '12px 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.9rem',
            }}
          >
            <AlertCircle size={18} />
            <span>{errorStatus}</span>
          </div>
        )}

        <div className="messages-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-wrapper ${msg.type}`}>
              <div className="message-meta">
                {msg.type === 'bot' ? (
                  <Bee size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                ) : null}
                {msg.type === 'bot' ? 'Swarm Logic' : msg.user} •{' '}
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className={`message ${msg.type}`}>
                {msg.message}
                {msg.images && msg.images.length > 0 && (
                  <div className="message-image-container">
                    {msg.images.map((img) => (
                      <div key={`${msg.id}-img-wrapper-${img.substring(0, 32)}`} className="image-wrapper">
                        <button
                          key={`${msg.id}-img-${img.substring(0, 32)}`}
                          type="button"
                          className="image-button"
                          onClick={() =>
                            window.open(
                              img.startsWith('data:') ? img : `data:image/png;base64,${img}`,
                              '_blank',
                            )
                          }
                        >
                          <img
                            src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`}
                            className="message-image"
                            alt="Cognitive Generation"
                          />
                        </button>
                        {msg.sourceImages && msg.sourceImages.length > 0 && (
                          <div className="upscale-controls">
                            {msg.sourceImages.map((srcImg, idx) => (
                              <button
                                key={`${msg.id}-upscale-${idx}`}
                                className="upscale-btn"
                                onClick={() =>
                                  window.open(
                                    srcImg.startsWith('data:') ? srcImg : `data:image/png;base64,${srcImg}`,
                                    '_blank',
                                  )
                                }
                              >
                                U{idx + 1}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="suggestions-bar">
                    {msg.suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="suggestion-chip"
                        onClick={() => handleSuggestionClick(s)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="message-wrapper bot">
              <div className="message bot">
                <div className="thinking-container">
                  <span className="thinking-text">Pollinating Response</span>
                  <div className="dots-wrapper">
                    <div className="dot" />
                    <div className="dot" />
                    <div className="dot" />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          {selectedImage && (
            <div className="image-preview-bar">
              <div className="preview-thumbnail">
                <img src={selectedImage} alt="Preview" />
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => setSelectedImage(null)}
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          )}

          <div className="input-box">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleImageSelect}
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon size={20} />
            </button>
            <textarea
              placeholder="Ask DreamBeesAI to pollinate ideas or generate visions..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={1}
            />
            <button
              type="button"
              className="send-button"
              onClick={handleSendMessage}
              disabled={(!inputValue.trim() && !selectedImage) || connectionStatus !== 'connected'}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="disclaimer">
            Pollinating Visions: Describe your request in detail for the Hive Mind.
          </p>
        </div>
      </main>
    </>
  );
};

export default App;
