// Runtime application configuration with resilient fallbacks and overrides

// Read a value from localStorage, falling back to a default
function ls(key, fallback = null) {
  try {
    const v = window.localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch (_) {
    return fallback;
  }
}

export function getAppConfig() {
  const cfg = {
    // Supabase
    supabaseUrl: ls('supabase_url', process.env.REACT_APP_SUPABASE_URL || ''),
    supabaseAnonKey: ls('supabase_anon_key', process.env.REACT_APP_SUPABASE_ANON_KEY || ''),
    // WAHA (WhatsApp HTTP API)
    wahaBaseUrl: ls('waha_base_url', process.env.REACT_APP_WAHA_BASE_URL || 'http://localhost:3000'),
    wahaApiKey: ls('waha_api_key', process.env.REACT_APP_WAHA_API_KEY || ''),
    wahaSession: ls('waha_session', process.env.REACT_APP_WAHA_SESSION || 'default')
  };

  // Safe defaults if env missing
  if (!cfg.supabaseUrl) cfg.supabaseUrl = 'https://your-project.supabase.co';
  if (!cfg.supabaseAnonKey) cfg.supabaseAnonKey = 'your-anon-key';
  return cfg;
}

export function setRuntimeConfig(partial) {
  try {
    Object.entries(partial || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      switch (k) {
        case 'supabaseUrl': window.localStorage.setItem('supabase_url', String(v)); break;
        case 'supabaseAnonKey': window.localStorage.setItem('supabase_anon_key', String(v)); break;
        case 'wahaBaseUrl': window.localStorage.setItem('waha_base_url', String(v)); break;
        case 'wahaApiKey': window.localStorage.setItem('waha_api_key', String(v)); break;
        case 'wahaSession': window.localStorage.setItem('waha_session', String(v)); break;
        default: break;
      }
    });
  } catch (_) {}
}

// Expose a light-weight runtime config update hook
const listeners = new Set();
export function subscribeConfigChanges(cb) { if (cb) listeners.add(cb); return () => listeners.delete(cb); }
export function notifyConfigChanged() { listeners.forEach(cb => { try { cb(getAppConfig()); } catch (_) {} }); }