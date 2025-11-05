// Wrapper de integração com WAHA (WhatsApp HTTP API)
// Atenção: usar chave da API no frontend expõe o segredo. Em produção,
// prefira um proxy no backend para ocultar 'X-Api-Key'.

import axios from 'axios';

const RAW_BASE_URL = process.env.REACT_APP_WAHA_BASE_URL || 'http://localhost:3000';
const SEND_TEXT_URL = RAW_BASE_URL.endsWith('/api')
  ? `${RAW_BASE_URL}/sendText`
  : `${RAW_BASE_URL}/api/sendText`;
const API_KEY = process.env.REACT_APP_WAHA_API_KEY || '0989e67e6a8e48e991f7a26031e19fb1';
const DEFAULT_SESSION = process.env.REACT_APP_WAHA_SESSION || 'default';

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) throw new Error('Telefone vazio ou inválido');
  // Se não começar com 55 e tiver 11 dígitos (Brasil), prefixar 55
  if (!digits.startsWith('55') && digits.length === 11) {
    return '55' + digits;
  }
  return digits;
}

async function sendText({ session = DEFAULT_SESSION, chatId, text }) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': API_KEY
  };
  const body = { session, chatId, text };
  const res = await axios.post(SEND_TEXT_URL, body, { headers });
  return res.data;
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
      const data = await sendText({ session: DEFAULT_SESSION, chatId, text: message, reply_to: null, linkPreview: false, linkPreviewHighQuality: false });
      return data;
    } catch (err) {
      const detail = err?.response?.data || err?.message || String(err);
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  }
};

export default wahaApi;