import React, { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';
import { Send, Banana, Sparkles, History, Settings, User, Bot, Clock, Trash2, AlertCircle, Image as ImageIcon, X } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3001';
const PUSHER_KEY = 'app-key';
const PUSHER_CLUSTER = 'mt1';
const PUSHER_HOST = '127.0.0.1';
const PUSHER_PORT = 6001;

const App = () => {
  // --- Data Fetching & Sync ---
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState(null); // Base64 string
  const [isThinking, setIsThinking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [errorStatus, setErrorStatus] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [systemHealth, setSystemHealth] = useState({ entropy: 0.1, health: 'Initializing...', violations: 0, nodeCount: 0 });
  const [activeSuggestions, setActiveSuggestions] = useState({}); // itemId -> suggestions[]
  
  const messagesEndRef = useRef(null);
  const pusherRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- Initial Bootstrap from Persistent Backend ---
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [histRes, healthRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/history`),
          fetch(`${API_BASE_URL}/api/health`)
        ]);
        
        if (histRes.ok) {
          const data = await histRes.json();
          if (data.length > 0) setMessages(data);
          else setMessages([{ id: '1', user: 'Nano Banana 2', message: 'Cognitive substrate online. Suggestions active.', type: 'bot', timestamp: new Date().toISOString(), images: [], soundness: 1.0, isGrounded: true }]);
        }
        
        if (healthRes.ok) {
          const health = await healthRes.json();
          setSystemHealth(health);
        }
      } catch (err) {
        console.error("Bootstrap error:", err);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    bootstrap();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

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

    pusher.connection.bind('state_change', (states) => {
      setConnectionStatus(states.current);
    });

    const channel = pusher.subscribe('presence-chat');
    pusherRef.current = pusher;

    channel.bind('bot-message', (data) => {
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
          soundness: data.soundness || 1.0,
          isGrounded: data.isGrounded || false
        }
      ]);
    });

    // Handle Proactive Suggestions from Substrate
    channel.bind('substrate-suggestions', (data) => {
      // Find the last bot message and attach suggestions
      setMessages((prev) => {
        const lastBot = [...prev].reverse().find(m => m.type === 'bot');
        if (lastBot) {
          return prev.map(m => m.id === lastBot.id ? { ...m, suggestions: data.suggestions } : m);
        }
        return prev;
      });
    });

    channel.bind('system-update', (data) => {
      setSystemHealth(data.health);
    });

    channel.bind('bot-thinking', (data) => {
      setIsThinking(data.isThinking);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe('presence-chat');
      pusher.disconnect();
    };
  }, []);

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion.action);
    // Explicitly focus input if needed
  };

  // --- Image Selection ---
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
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
    const newMessage = {
      id: Date.now().toString(),
      user: 'You',
      message: userMsg,
      type: 'user',
      timestamp: new Date().toISOString(),
      images: userImg ? [userImg] : []
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
          history: messages 
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
    } catch (err) {
      console.error("Chat Failed:", err);
      setErrorStatus("Failed to send message. Is the backend server running?");
    }
  };

  const clearChat = async () => {
    if (window.confirm("Are you sure you want to clear your chat history forever?")) {
      try {
        await fetch(`${API_BASE_URL}/api/history`, { method: 'DELETE' });
        setMessages([{ id: '1', user: 'Nano Banana 2', message: 'History purged. Fresh session started.', type: 'bot', timestamp: new Date().toISOString(), images: [] }]);
      } catch (err) {
        console.error("Failed to clear history:", err);
        alert("Failed to clear history on the server.");
      }
    }
  };


  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon"><Banana size={20} /></div>
          <span className="logo-text">Nano Banana 2</span>
        </div>

        <nav>
          <div className="nav-item active"><Sparkles size={18} /><span>Creator Mode</span></div>
          <div className="nav-item" onClick={clearChat}><Trash2 size={18} /><span>Clear Substrate</span></div>
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <div className="nav-item"><Settings size={18} /><span>Settings</span></div>
        </div>
      </aside>

      <main className="main-chat">
        <header className="chat-header">
          <div className="status-badge">
            <div className={`status-dot ${connectionStatus !== 'connected' ? 'connecting' : ''}`}></div>
            <span>{connectionStatus === 'connected' ? 'Substrate Online' : 'Linking...'}</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Multimodal AI Agent</span>
          </div>
        </header>

        {errorStatus && (
          <div style={{ backgroundColor: '#450a0a', color: '#fecaca', padding: '12px 1.5rem', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem' }}>
            <AlertCircle size={18} /><span>{errorStatus}</span>
          </div>
        )}

        <div className="messages-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-wrapper ${msg.type}`}>
              <div className="message-meta">
                {msg.type === 'bot' ? <Bot size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> : null}
                {msg.user} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className={`message ${msg.type}`}>
                {msg.message}
                {msg.images && msg.images.length > 0 && (
                  <div className="message-image-container">
                    {msg.images.map((img, idx) => (
                      <img 
                        key={idx} 
                        src={img.startsWith('data:') ? img : `data:image/png;base64,${img}`} 
                        className="message-image" 
                        alt="Cognitive Generation"
                        onClick={() => window.open(img.startsWith('data:') ? img : `data:image/png;base64,${img}`, '_blank')}
                      />
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
                  <div className="dot"></div><div className="dot"></div><div className="dot"></div>
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
                <div className="remove-btn" onClick={() => setSelectedImage(null)}><X size={10} /></div>
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
            <button className="icon-button" onClick={() => fileInputRef.current?.click()}>
              <ImageIcon size={20} />
            </button>
            <textarea
              placeholder="Ask Nano Banana 2 to generate or edit images..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              rows="1"
            />
            <button className="send-button" onClick={handleSendMessage} disabled={(!inputValue.trim() && !selectedImage) || connectionStatus !== 'connected'}>
              <Send size={18} />
            </button>
          </div>
          <p className="disclaimer">Native Image Generation: Describe the scene, don't just list keywords.</p>
        </div>
      </main>
    </>
  );
};

export default App;
