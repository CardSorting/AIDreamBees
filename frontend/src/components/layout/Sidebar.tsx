// UI: Presentation component - Sidebar navigation
// ============================================================================

import {
  Bug as Bee,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { ConnectionStatus } from '../../core/ChatService';

interface SidebarProps {
  isOpen: boolean;
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  onRefresh: () => void;
  onClearHistory: () => void;
}

export default function Sidebar({
  isOpen,
  connectionStatus,
  isLoading,
  onRefresh,
  onClearHistory,
}: SidebarProps) {
  const isDisconnected = connectionStatus !== 'connected';

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon">
            <Bee size={22} className="bee-hardened" />
          </div>
          <div className="logo-text-group">
            <span className="logo-text">DreamBees</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className="nav-item button-like"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw
            size={18}
            className={isDisconnected ? 'spinning' : ''}
          />
          <span>Refresh Content</span>
        </button>
        <button
          type="button"
          className="nav-item button-like"
          onClick={onClearHistory}
        >
          <Trash2 size={18} />
          <span>Clear History</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="connection-status">
          <div
            className={`status-dot ${connectionStatus === 'connected' ? 'online' : 'offline'}`}
          />
          <span>System {connectionStatus === 'connected' ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </aside>
  );
}