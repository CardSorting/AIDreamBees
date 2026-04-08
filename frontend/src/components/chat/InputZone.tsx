// UI: Presentation component - chat input area
// ============================================================================

import {
  ImageIcon,
  Send,
  X,
} from 'lucide-react';
import type { ConnectionStatus } from '../../core/ChatService';

interface InputZoneProps {
  value: string;
  onValueChange: (value: string) => void;
  selectedImage: string | null;
  onImageSelect: () => void;
  onImageRemove: () => void;
  onSendMessage: () => void;
  hasKeyboardSupport: boolean;
  connectionStatus: ConnectionStatus;
  disabled: boolean;
}

export default function InputZone({
  value,
  onValueChange,
  selectedImage,
  onImageSelect,
  onImageRemove,
  onSendMessage,
  hasKeyboardSupport,
  connectionStatus,
  disabled,
}: InputZoneProps) {
  const isReadyToSend = (value.trim() || selectedImage) && connectionStatus === 'connected';

  return (
    <footer className="input-zone">
      <div className="input-wrapper">
        <div className="input-actions-left">
          <button
            type="button"
            className="action-icon"
            onClick={onImageSelect}
          >
            <ImageIcon size={20} />
          </button>
        </div>

        <textarea
          placeholder="Ask me anything..."
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          rows={1}
          style={{ resize: 'none' }}
        />

        <button
          type="button"
          className="send-trigger"
          onClick={onSendMessage}
          disabled={!isReadyToSend}
        >
          <Send size={18} />
        </button>
      </div>

      <div className="input-preview-row">
        {selectedImage && (
          <div className="image-preview-mini">
            <img src={selectedImage} alt="Neural Source" />
            <button
              type="button"
              className="remove-preview"
              onClick={onImageRemove}
            >
              <X size={10} />
            </button>
          </div>
        )}
        <div className="input-footer-text">
          SYSTEM STATUS: SECURE
        </div>
      </div>
    </footer>
  );
}