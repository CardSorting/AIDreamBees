// UI: Main App component - thin coordinator layer
// ============================================================================

import { AnimatePresence } from 'framer-motion';
import Pusher from 'pusher-js';
import React, {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import SettingsModal from './components/settings/SettingsModal';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import MainLayout from './components/layout/MainLayout';
import type { ChatState as ServiceChatState, ConnectionStatus } from './core/ChatService';
import { createMessageRepository } from './infrastructure/persistence/MessageRepository';
import { MessageValidator } from './domain/messages/MessageValidator';
import {
  API_BASE_URL,
  SOKETI_CONFIG,
  UI_FEATURES,
} from './config';

// --- Error Boundary for Cognitive Safety ---
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
          <h3>Connection Lost</h3>
          <p>We encountered a problem with the connection.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reconnect
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  // State snapshot from service
  const [state, setState] = useState<ServiceChatState | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGridMode, setIsGridMode] = useState(false);

  const messageEndRef = useRef<HTMLDivElement>(null);
  const pusherRef = useRef<Pusher | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize service and validators
  const messageRepository = createMessageRepository(API_BASE_URL);
  const validator = new MessageValidator();

  // Subscribe to chat service state
  useEffect(() => {
    // This would normally be configured differently, but we'll mock it here
    console.log('ChatService and Pusher would be initialized here');
    
    // Return cleanup
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [messageRepository, validator]);

  // Handle keyboard support for sending messages
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleSendMessage = async () => {
    if (!state) return;
    
    const { input, selectedImage, connectionStatus } = state;
    
    if ((!input.trim() && !selectedImage) || connectionStatus !== 'connected') return;

    try {
      // Call service method
      await messageRepository.saveMessage({
        id: Date.now().toString(),
        user: 'You',
        message: input.trim(),
        type: 'user',
        timestamp: new Date().toISOString(),
        images: selectedImage ? [selectedImage] : [],
        soundness: 1.0,
        isGrounded: true,
      } as any);

      // Send to API - this would normally be in the service
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.trim(),
          images: selectedImage ? [selectedImage] : [],
          history: [],
          useGrid: isGridMode,
        }),
      });

      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    } catch (error) {
      console.error('Failed to send message', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleToggleGrid = () => {
    setIsGridMode((prev) => !prev);
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleRefresh = () => {
    if (state?.connectionStatus !== 'connected') {
      console.log('Refreshing connection...');
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear all chat history?')) {
      try {
        await messageRepository.clearHistory();
        console.log('Chat history cleared');
      } catch (error) {
        console.error('Failed to clear history:', error);
      }
    }
  };

  const handleImageSelect = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (state) {
          setState((prev) => ({
            ...prev!,
            selectedImage: reader.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageRemove = () => {
    if (state) {
      setState((prev) => ({
        ...prev!,
        selectedImage: null,
      }));
    }
  };

  // Memoized render props
  if (!state) return <div className="app-shell">Initializing system...</div>;

  return (
    <div className="app-shell">
      <AnimatePresence>
        <Sidebar
          isOpen={isSidebarOpen}
          connectionStatus={state.connectionStatus}
          isLoading={state.isHistoryLoading}
          onRefresh={handleRefresh}
          onClearHistory={handleClearHistory}
        />
        
        <MainLayout
          state={state}
          messageEndRef={messageEndRef}
          validator={validator}
          isAuthenticated={true}
        />

        <Header
          isOpen={isSidebarOpen}
          connectionStatus={state.connectionStatus}
          onToggleSidebar={handleToggleSidebar}
          onToggleGrid={handleToggleGrid}
          onOpenSettings={handleOpenSettings}
        />
      </AnimatePresence>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleImageChange}
      />
    </div>
  );
};

export default App;