// Settings management module
const Settings = {
  STORAGE_KEY: 'sessionito_settings',

  defaults: {
    hideWarmupSessions: false,
    hideAgentSessions: false
  },

  // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,

  isUUID(str) {
    return this.UUID_PATTERN.test(str);
  },

  _cache: null,

  getAll() {
    if (this._cache) return this._cache;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      this._cache = stored ? { ...this.defaults, ...JSON.parse(stored) } : { ...this.defaults };
    } catch (e) {
      this._cache = { ...this.defaults };
    }
    return this._cache;
  },

  get(key) {
    return this.getAll()[key];
  },

  set(key, value) {
    const settings = this.getAll();
    settings[key] = value;
    this._cache = settings;

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }

    // Dispatch event for listeners
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: { key, value } }));
  },

  // Check if a session should be hidden based on current settings
  shouldHideSession(session) {
    if (this.get('hideWarmupSessions')) {
      const firstMessage = session.firstMessage || '';
      if (firstMessage.trim() === 'Warmup') {
        return true;
      }
    }
    if (this.get('hideAgentSessions')) {
      // Agent sessions have UUID-style IDs instead of human-readable slugs
      const sessionId = session.id || '';
      if (this.isUUID(sessionId)) {
        return true;
      }
    }
    return false;
  },

  // Filter an array of sessions based on current settings
  filterSessions(sessions) {
    return sessions.filter(s => !this.shouldHideSession(s));
  }
};

// Settings UI component
function initSettingsUI() {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');

  if (!settingsBtn || !settingsPanel) return;

  // Toggle panel
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('open');
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
      settingsPanel.classList.remove('open');
    }
  });

  // Initialize checkbox states
  const hideWarmupCheckbox = document.getElementById('hideWarmupSessions');
  if (hideWarmupCheckbox) {
    hideWarmupCheckbox.checked = Settings.get('hideWarmupSessions');
    hideWarmupCheckbox.addEventListener('change', (e) => {
      Settings.set('hideWarmupSessions', e.target.checked);
    });
  }

  const hideAgentCheckbox = document.getElementById('hideAgentSessions');
  if (hideAgentCheckbox) {
    hideAgentCheckbox.checked = Settings.get('hideAgentSessions');
    hideAgentCheckbox.addEventListener('change', (e) => {
      Settings.set('hideAgentSessions', e.target.checked);
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initSettingsUI);
