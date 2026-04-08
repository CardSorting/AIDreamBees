// UI: Helper component - chat message list container
// ============================================================================

import { AnimatePresence } from 'framer-motion';
import type { Message } from '../../domain/messages/types';
import type { MessageValidator } from '../../domain/messages/MessageValidator';
import MessageRow from '../chat/MessageRow';
import ThinkingIndicator from '../chat/ThinkingIndicator';
import ErrorBanner from '../chat/ErrorBanner';

interface ChatContainerProps {
  messages: Message[];
  isThinking: boolean;
  isLoading: boolean;
  error: string | null;
  messageEndRef: React.RefObject<HTMLDivElement>;
  validator: MessageValidator;
  isAuthenticated: boolean;
}

export default function ChatContainer({
  messages,
  isThinking,
  isLoading,
  error,
  messageEndRef,
  validator,
  isAuthenticated,
}: ChatContainerProps) {
  // Scroll to bottom when messages change
  if (messages.length || isThinking) {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="chat-container">
      <div className="messages-flow">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageRow
              key={msg.id || `msg-${msg.timestamp}`}
              message={msg}
              validator={validator}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </AnimatePresence>
        
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