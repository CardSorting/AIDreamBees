// UI: Presentation component - individual message row
// ============================================================================

import { Database } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Message } from '../../domain/messages/types';
import type { MessageValidator } from '../../domain/messages/MessageValidator';
import ImageGrid from './ImageGrid';
import AuditBadges from './AuditBadges';
import SuggestionSection from './SuggestionSection';

interface MessageRowProps {
  message: Message;
  validator: MessageValidator;
  isAuthenticated: boolean;
}

export default function MessageRow({
  message,
  validator,
  isAuthenticated,
}: MessageRowProps) {
  const displayType = MessageValidator.getDisplayType(message.type);
  const hasAttachments = MessageValidator.hasAttachments(message);
  const confidence = validator.getConfidencePercentage(message);
  const isGrounded = MessageValidator.isMessageGrounded(message);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`message-row ${message.type}`}
    >
      <div className="message-envelope">
        <div className="message-header">
          <div className="sender-info">
            {message.type === 'bot' ? (
              <Database size={14} className="bot-icon" />
            ) : null}
            <span className="sender-name">{displayType}</span>
            <span className="timestamp">
              {new Date(message.timestamp || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          {message.type === 'bot' && hasAttachments && (
            <AuditBadges message={message} validator={validator} />
          )}
        </div>

        <div className="message-bubble">
          {message.message}

          <ImageGrid
            images={message.images || []}
            sourceImages={message.sourceImages}
            messageId={message.id || ''}
          />

          <SuggestionSection
            message={message}
            onSelectSuggestion={(action) => {
              const messageHistory = [message, ...(message.type === 'user' ? [] : [])];
              // In real implementation, this would set input value and trigger send
              console.log('Selected suggestion:', action);
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}