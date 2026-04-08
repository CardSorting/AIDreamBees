// UI: Presentation component - connection errors
// ============================================================================

import { AlertCircle, RefreshCw } from 'lucide-react';
import type { Message } from '../../domain/messages/types';

interface ErrorBannerProps {
  error: string;
  onRetry: () => void;
}

export default function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  return (
    <div className="error-banner">
      <AlertCircle size={16} />
      <span>{error}</span>
      <button
        type="button"
        className="retry-btn"
        onClick={onRetry}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}