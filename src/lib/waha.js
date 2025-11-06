// Wrapper de integração com WAHA (WhatsApp HTTP API)
// Atenção: usar chave da API no frontend expõe o segredo. Em produção,
// prefira um proxy no backend para ocultar 'X-Api-Key'.

import axios from 'axios';
import { getAppConfig } from './appConfig';

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) throw new Error('Telefone vazio ou inválido');
  // Se não começar com 55 e tiver 11 dígitos (Brasil), prefixar 55
  if (!digits.startsWith('55') && digits.length === 11) {
    return '55' + digits;
  }
  return digits;
}

function buildEndpoints() {
  const cfg = getAppConfig();
  const base = (cfg.wahaBaseUrl || '').replace(/\/$/, '');
  const sendUrl = base.endsWith('/api') ? `${base}/sendText` : `${base}/api/sendText`;
  return { sendUrl, apiKey: cfg.wahaApiKey || '', session: cfg.wahaSession || 'default' };
}

async function sendText({ session, chatId, text }) {
  const { sendUrl, apiKey } = buildEndpoints();
  const headers = { 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
  const body = { session, chatId, text };
  try {
    const res = await axios.post(sendUrl, body, { headers, timeout: 15000 });
    return res.data;
  } catch (err) {
    // Tentar fallback alternando o caminho /api
    const altUrl = sendUrl.includes('/api/sendText')
      ? sendUrl.replace('/api/sendText', '/sendText')
      : sendUrl.replace('/sendText', '/api/sendText');
    try {
      const res2 = await axios.post(altUrl, body, { headers, timeout: 15000 });
      return res2.data;
    } catch (err2) {
      const detail = err2?.response?.data || err2?.message || String(err2);
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  }
}

export const wahaApi = {
  /**
   * Envia uma mensagem de texto para um número.
   * @param {string} phone Número destino (com ou sem 55; sem símbolos)
   * @param {string} message Texto da mensagem
   */
  async sendMessage(phone, message) {
    const normalized = normalizePhone(phone);
    const chatId = `${normalized}@c.us`;
    try {
      const { session } = buildEndpoints();
      const data = await sendText({ session, chatId, text: message, reply_to: null, linkPreview: false, linkPreviewHighQuality: false });
      return data;
    } catch (err) {
      const detail = err?.response?.data || err?.message || String(err);
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  }
};

export default wahaApi;