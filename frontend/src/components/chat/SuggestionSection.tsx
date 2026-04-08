// UI: Presentation component - suggestion chips
// ============================================================================

import { ExternalLink } from 'lucide-react';
import type { Message } from '../../domain/messages/types';

interface SuggestionSectionProps {
  message: Message;
  onSelectSuggestion: (action: string) => void;
}

export default function SuggestionSection({
  message,
  onSelectSuggestion,
}: SuggestionSectionProps) {
  const suggestions = MessageValidator.extractSuggestions(message);

  if (suggestions.length === 0) return null;

  return (
    <div className="suggestion-uplink">
      {suggestions.map((s) => (
        <button
          key={s.action}
          type="button"
          className="suggestion-tag"
          onClick={() => onSelectSuggestion(s.action)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}