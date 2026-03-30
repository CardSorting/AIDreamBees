import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import React, { useState } from 'react';
import { useProviders } from '../../hooks/useProviders';
import {
  type ProviderType,
  PROVIDER_LABELS,
  PROVIDER_ICONS,
} from '../../types/provider';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    providers,
    isLoading,
    error,
    createProvider,
    updateProvider,
    deleteProvider,
    validateProvider,
  } = useProviders();

  const [isAdding, setIsAdding] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    type: 'gemini' as ProviderType,
    apiKey: '',
  });
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [validating, setValidating] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProvider(newProvider);
      setIsAdding(false);
      setNewProvider({ name: '', type: 'gemini', apiKey: '' });
    } catch (err) {
      console.error('Failed to add provider:', err);
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateProvider(id, { isActive: !currentStatus });
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleValidate = async (id: string) => {
    setValidating((prev) => ({ ...prev, [id]: true }));
    try {
      await validateProvider(id);
    } catch (err) {
      console.error('Validation error:', err);
    } finally {
      setValidating((prev) => ({ ...prev, [id]: false }));
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setShowKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <ShieldCheck className="title-icon" size={20} />
            <h2>API Key Management</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Configure your AI providers. Your keys are encrypted and stored locally.
          </p>

          {error && (
            <div className="error-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="providers-list">
            {providers.map((provider) => (
              <div key={provider.id} className={`provider-card ${!provider.isActive ? 'disabled' : ''}`}>
                <div className="provider-info">
                  <span className="provider-icon">{PROVIDER_ICONS[provider.type]}</span>
                  <div className="provider-details">
                    <div className="provider-name-row">
                      <h3>{provider.name}</h3>
                      <span className="provider-badge">{PROVIDER_LABELS[provider.type]}</span>
                    </div>
                    <div className="provider-key-row">
                      <code>{provider.apiKey}</code>
                    </div>
                  </div>
                </div>

                <div className="provider-actions">
                  <div className="status-indicators">
                    {provider.isValid === true && (
                      <div className="status-badge valid" title="Key is valid">
                        <CheckCircle2 size={14} />
                        <span>Valid</span>
                      </div>
                    )}
                    {provider.isValid === false && (
                      <div className="status-badge invalid" title="Key is invalid">
                        <AlertCircle size={14} />
                        <span>Invalid</span>
                      </div>
                    )}
                  </div>

                  <div className="button-group">
                    <button
                      className="action-button"
                      onClick={() => handleValidate(provider.id)}
                      disabled={validating[provider.id]}
                      title="Validate API Key"
                    >
                      <RefreshCw size={16} className={validating[provider.id] ? 'spin' : ''} />
                    </button>
                    <button
                      className={`action-button ${provider.isActive ? 'active' : ''}`}
                      onClick={() => toggleStatus(provider.id, provider.isActive)}
                      title={provider.isActive ? 'Deactivate' : 'Activate'}
                    >
                      <div className={`status-toggle ${provider.isActive ? 'on' : ''}`} />
                    </button>
                    <button
                      className="action-button delete"
                      onClick={() => {
                        if (confirm('Delete this provider?')) deleteProvider(provider.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!isAdding ? (
              <button className="add-provider-btn" onClick={() => setIsAdding(true)}>
                <Plus size={18} />
                <span>Add New Provider</span>
              </button>
            ) : (
              <form className="add-provider-form" onSubmit={handleAdd}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Friendly Name</label>
                    <input
                      type="text"
                      placeholder="e.g., My Gemini Pro"
                      value={newProvider.name}
                      onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Provider Type</label>
                    <select
                      value={newProvider.type}
                      onChange={(e) =>
                        setNewProvider({ ...newProvider, type: e.target.value as ProviderType })
                      }
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </div>
                  <div className="form-group full-width">
                    <label>API Key</label>
                    <div className="key-input-wrapper">
                      <input
                        type="password"
                        placeholder="Paste your API key here"
                        value={newProvider.apiKey}
                        onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={() => setIsAdding(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    Save Provider
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <div className="helper-text">
            <ExternalLink size={12} />
            <span>Need a key? Visit the provider's developer console.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
