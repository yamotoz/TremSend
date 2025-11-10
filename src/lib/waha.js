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
  // Seguir padrão oficial: primeiro tenta `${base}/api/...`, depois fallback `${base}/...`
  const sendTextUrlPrimary = `${base}/api/sendText`;
  const sendFileUrlPrimary = `${base}/api/sendFile`;
  const sendImageUrlPrimary = `${base}/api/sendImage`;
  const sendTextUrlFallback = `${base}/sendText`;
  const sendFileUrlFallback = `${base}/sendFile`;
  const sendImageUrlFallback = `${base}/sendImage`;
  return {
    sendTextUrlPrimary,
    sendFileUrlPrimary,
    sendImageUrlPrimary,
    sendTextUrlFallback,
    sendFileUrlFallback,
    sendImageUrlFallback,
    apiKey: cfg.wahaApiKey || '',
    session: cfg.wahaSession || 'default'
  };
}

async function sendText({ session, chatId, text, reply_to = null, linkPreview = false, linkPreviewHighQuality = false }) {
  const { sendTextUrlPrimary, sendTextUrlFallback, apiKey } = buildEndpoints();
  const headers = { 'Content-Type': 'application/json', 'X-Api-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };
  const body = { session, chatId, text, reply_to, linkPreview, linkPreviewHighQuality };
  if (!apiKey) {
    throw new Error('WAHA: X-Api-Key não configurada. Defina REACT_APP_WAHA_API_KEY ou use setRuntimeConfig({ wahaApiKey }).');
  }
  try {
    const res = await axios.post(sendTextUrlPrimary, body, { headers, timeout: 15000 });
    return res.data;
  } catch (err) {
    const status1 = err?.response?.status;
    try {
      const res2 = await axios.post(sendTextUrlFallback, body, { headers, timeout: 15000 });
      return res2.data;
    } catch (err2) {
      const status2 = err2?.response?.status;
      const detail = err2?.response?.data || err2?.message || String(err2);
      const textMsg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      const finalStatus = status2 || status1;
      throw new Error(finalStatus ? `HTTP ${finalStatus}: ${textMsg}` : textMsg);
    }
  }
}

async function sendFile({ session, chatId, file, caption }) {
  const { sendFileUrlPrimary, sendFileUrlFallback, apiKey } = buildEndpoints();
  const headers = { 'Content-Type': 'application/json', 'X-Api-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };
  const body = { session, chatId, file, caption: caption || '' };
  if (!apiKey) {
    throw new Error('WAHA: X-Api-Key não configurada. Defina REACT_APP_WAHA_API_KEY ou use setRuntimeConfig({ wahaApiKey }).');
  }
  // Validação leve para evitar 422 por payload incorreto
  if (!body.file || !body.file.filename) {
    throw new Error('WAHA: file.filename é obrigatório.');
  }
  if (!body.file.url && !body.file.data) {
    throw new Error('WAHA: informe file.url (HTTP/HTTPS) ou file.data (BASE64).');
  }
  try {
    const res = await axios.post(sendFileUrlPrimary, body, { headers, timeout: 30000 });
    return res.data;
  } catch (err) {
    const status1 = err?.response?.status;
    try {
      const res2 = await axios.post(sendFileUrlFallback, body, { headers, timeout: 30000 });
      return res2.data;
    } catch (err2) {
      const status2 = err2?.response?.status;
      const detail = err2?.response?.data || err2?.message || String(err2);
      const textMsg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      const finalStatus = status2 || status1;
      throw new Error(finalStatus ? `HTTP ${finalStatus}: ${textMsg}` : textMsg);
    }
  }
}

// Envio específico de imagem (JPEG recomendado) via WAHA
async function sendImage({ session, chatId, file, caption }) {
  const { sendImageUrlPrimary, sendImageUrlFallback, apiKey } = buildEndpoints();
  const headers = { 'Content-Type': 'application/json', 'X-Api-Key': apiKey, 'Authorization': `Bearer ${apiKey}` };
  const body = { session, chatId, file, caption: caption || '' };
  if (!apiKey) {
    throw new Error('WAHA: X-Api-Key não configurada. Defina REACT_APP_WAHA_API_KEY ou use setRuntimeConfig({ wahaApiKey }).');
  }
  if (!body.file || !body.file.filename) {
    throw new Error('WAHA: file.filename é obrigatório para imagem.');
  }
  if (!body.file.data) {
    throw new Error('WAHA: informe file.data (BASE64) para imagem.');
  }
  if (String(body.file.mimetype || '').toLowerCase() !== 'image/jpeg') {
    throw new Error('WAHA: imagens devem ser enviadas como image/jpeg. Converta antes de enviar.');
  }
  try {
    const res = await axios.post(sendImageUrlPrimary, body, { headers, timeout: 30000 });
    return res.data;
  } catch (err) {
    const status1 = err?.response?.status;
    try {
      const res2 = await axios.post(sendImageUrlFallback, body, { headers, timeout: 30000 });
      return res2.data;
    } catch (err2) {
      const status2 = err2?.response?.status;
      const detail = err2?.response?.data || err2?.message || String(err2);
      const textMsg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      const finalStatus = status2 || status1;
      throw new Error(finalStatus ? `HTTP ${finalStatus}: ${textMsg}` : textMsg);
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
  },

  /**
   * Envia um texto contendo um link com preview habilitado.
   * @param {string} phone Número destino
   * @param {string} url Texto/URL a ser enviado
   */
  async sendLinkMessage(phone, url) {
    const normalized = normalizePhone(phone);
    const chatId = `${normalized}@c.us`;
    try {
      const { session } = buildEndpoints();
      const data = await sendText({ session, chatId, text: url, reply_to: null, linkPreview: true, linkPreviewHighQuality: true });
      return data;
    } catch (err) {
      const detail = err?.response?.data || err?.message || String(err);
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  },

  /**
   * Envia um arquivo (documento/imagem/etc) para um número.
   * O arquivo pode ser passado por URL pública ou base64 (file.data).
   * @param {string} phone Número destino
   * @param {{ filename: string, mimetype?: string, url?: string, data?: string }} filePayload
   * @param {string} [caption] Texto de legenda opcional
   */
  async sendFileToChat(phone, filePayload, caption = '') {
    const normalized = normalizePhone(phone);
    const chatId = `${normalized}@c.us`;
    try {
      const { session } = buildEndpoints();
      const data = await sendFile({ session, chatId, file: filePayload, caption });
      return data;
    } catch (err) {
      const detail = err?.response?.data || err?.message || String(err);
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  },

  // Envia imagem JPEG (BASE64) com legenda opcional
  async sendImageToChat(phone, imagePayload, caption = '') {
    const normalized = normalizePhone(phone);
    const chatId = `${normalized}@c.us`;
    try {
      const { session } = buildEndpoints();
      const data = await sendImage({ session, chatId, file: imagePayload, caption });
      return data;
    } catch (err) {
      const detail = err?.response?.data || err?.message || String(err);
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  }
};

export default wahaApi;