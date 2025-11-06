import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { setRuntimeConfig, notifyConfigChanged } from './lib/appConfig';
import { reloadSupabaseClient } from './lib/supabase';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Expor utilitário global para ajustar configuração em runtime sem rebuild
// Uso no console: Config.set({ wahaApiKey: 'xxx', wahaBaseUrl: 'http://host:3000' })
//                 Config.set({ supabaseUrl: 'https://xyz.supabase.co', supabaseAnonKey: '...' })
window.Config = {
  set(partial) {
    try {
      setRuntimeConfig(partial || {});
      notifyConfigChanged();
      // Atualizar cliente do Supabase se chaves mudarem
      if (partial?.supabaseUrl || partial?.supabaseAnonKey) {
        reloadSupabaseClient();
      }
      console.log('Config runtime atualizada.');
    } catch (e) {
      console.warn('Falha ao atualizar config:', e?.message || e);
    }
  }
};
