// UI: Presentation component - main application layout
// ============================================================================

import {
  AnimationContext,
  MotionDirectionInput,
} from '../../utils/ContextSelector';
import type { ChatState } from '../../core/ChatService';

interface MainLayoutProps {
  state: ChatState;
  messageEndRef: React.RefObject<HTMLDivElement>;
  validator: any; // Should be MessageValidator
  isAuthenticated: boolean;
}

export default function MainLayout({
  state,
  messageEndRef,
  validator,
  isAuthenticated,
}: MainLayoutProps) {
  return (
    <AnimatePresence>
      <main className="main-viewport">
        <Header />
        
        <ChatContainer
          messages={state.messages}
          isThinking={state.isThinking}
          isLoading={state.isHistoryLoading}
          error={state.errorStatus}
          messageEndRef={messageEndRef}
          validator={validator}
          isAuthenticated={isAuthenticated}
        />

        <InputZone
          value={state.input}
          onValueChange={(value) => {}}
          selectedImage={state.selectedImage}
          onImageSelect={() => {}}
          onImageRemove={() => {}}
          onSendMessage={() => {}}
          hasKeyboardSupport={true}
          connectionStatus={state.connectionStatus}
          disabled={state.connectionStatus !== 'connected'}
        />
      </main>
    </AnimatePresence>
  );
}

// Helper components

import Header from './Header';
import ChatContainer from './ChatContainer';
import InputZone from '../chat/InputZone';

function ChatContainer({
  messages,
  isThinking,
  isLoading,
  error,
  messageEndRef,
  validator,
  isAuthenticated,
}: {
  messages: any[];
  isThinking: boolean;
  isLoading: boolean;
  error: string | null;
  messageEndRef: React.RefObject<HTMLDivElement>;
  validator: any;
  isAuthenticated: boolean;
}) {
  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="chat-container">
      <div className="messages-flow">
        {messages.map((msg) => (
          <MessageRow key={msg.id} message={msg} validator={validator} isAuthenticated={isAuthenticated} />
        ))}
        
        {isThinking && <ThinkingIndicator isActive={true} />}
        
        <div ref={messageEndRef} />
        
        {error && <ErrorBanner error={error} onRetry={() => {}} />}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="loading-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={`skeleton-${i}`} className="skeleton-msg">
          <div className="skeleton-meta" />
          <div className="skeleton-bubble" />
        </div>
      ))}
    </div>
  );
}