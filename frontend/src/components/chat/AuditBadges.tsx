// UI: Presentation component - message validation badges
// ============================================================================

import {
  Database,
  ShieldCheck,
} from 'lucide-react';
import type { Message } from '../../domain/messages/types';
import type { MessageValidator } from '../../domain/messages/MessageValidator';

interface AuditBadgesProps {
  message: Message;
  validator: MessageValidator;
}

export default function AuditBadges({ message, validator }: AuditBadgesProps) {
  const confidence = validator.getConfidencePercentage(message);
  const isGrounded = MessageValidator.isMessageGrounded(message);

  if (!isGrounded && !validator.isMessageSound(message)) return null;

  return (
    <div className="audit-badges">
      {isGrounded && (
        <div
          className="badge grounded"
          title="Grounding verified via substrate"
        >
          <Database size={10} />
          <span>VERIFIED</span>
        </div>
      )}
      <div className="badge soundness" title="Confidence Score">
        <ShieldCheck size={10} />
        <span>{confidence}</span>
      </div>
    </div>
  );
}