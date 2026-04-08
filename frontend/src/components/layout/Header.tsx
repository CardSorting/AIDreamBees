// UI: Presentation component - chat header
// ============================================================================

import {
  Layers,
  Settings,
  Bug as Bee,
  X,
} from 'lucide-react';
import type { ConnectionStatus } from '../../core/ChatService';

interface HeaderProps {
  isOpen: boolean;
  connectionStatus: ConnectionStatus;
  onToggleSidebar: () => void;
  onToggleGrid: () => void;
  onOpenSettings: () => void;
}

export default function Header({
  isOpen,
  connectionStatus,
  onToggleSidebar,
  onToggleGrid,
  onOpenSettings,
}: HeaderProps) {
  const connectionClasses = getSyncDotClass(connectionStatus);
  const connectionText = getConnectionText(connectionStatus);

  return (
    <header className="viewport-header">
      <div className="header-left">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleSidebar}
        >
          {isOpen ? <X size={20} /> : <Bee size={22} />}
        </button>
        <div className="sync-badge">
          <div className={`sync-dot ${connectionClasses}`} />
          <span className="sync-text">{connectionText}</span>
        </div>
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="action-btn"
          onClick={onToggleGrid}
          title="Toggle Grid View"
        >
          <Layers size={18} />
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={onOpenSettings}
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}

function getSyncDotClass(status: ConnectionStatus): string {
  if (status === 'connected') return 'synced';
  if (status === 'unavailable' || status === 'failed') return 'error';
  return 'pulsing';
}

function getConnectionText(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'CONNECTED';
    case 'unavailable':
    case 'failed':
      return 'DISCONNECTED';
    default:
      return 'CONNECTING...';
  }
}