// Sender singleton: mantém envio em execução mesmo ao sair da tela
// Usa Supabase como fila (views v_upload_pendentes/enviados) e WAHA API.
import { database } from './supabase';
import { wahaApi } from './waha';

const state = {
  running: false,
  paused: false,
  completed: false,
  uploadId: null,
  attempts: 0,
};

let abort = false;
let loopPromise = null;
let useMemoryQueue = false;
let pendingItems = [];
let config = {
  sendTextEnabled: true,
  sendText2Enabled: false,
  sendText3Enabled: false,
  messageTemplate: '',
  messageTemplate2: '',
  messageTemplate3: '',
  sendFileEnabled: false,
  fileUrlForSend: '',
  sendImageEnabled: false,
  imageUrlForSend: '',
  useRandomInterval: false,
  randomIntervalRange: { min: 10, max: 50 },
  sendIntervalSeconds: 60,
  maxRetries: 3,
  // Callbacks para contagem regressiva no frontend
  onWaitStart: null,
  onWaitTick: null,
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function nextIntervalSec() {
  if (config.useRandomInterval) {
    const lo = Math.max(1, Number(config.randomIntervalRange?.min || 1));
    const hi = Math.max(lo, Number(config.randomIntervalRange?.max || lo));
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  return Math.max(1, Number(config.sendIntervalSeconds || 60));
}

function render(template, row) {
  const lower = {};
  Object.keys(row || {}).forEach(k => { lower[String(k).toLowerCase()] = row[k]; });
  // garantir chaves comuns
  ['nome','empresa','email','telefone','telefone_norm','telefone_raw','message_template'].forEach(k => {
    if (row && row[k] !== undefined && row[k] !== null) lower[k] = row[k];
  });
  return String(template || '').replace(/\{([^}]+)\}/g, (m, p1) => {
    const key = String(p1 || '').trim().toLowerCase();
    const val = lower[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function normalizeChatId(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const with55 = digits.startsWith('55') ? digits : (digits.length === 11 ? ('55' + digits) : digits);
  return with55 + '@c.us';
}

async function fetchNextPending(uploadId) {
  const res = await database.getPendingItems(uploadId, 1);
  if (!res.success) throw new Error(res.error || 'Falha ao buscar pendentes');
  return res.data || [];
}

async function runLoop() {
  state.running = true;
  state.completed = false;
  state.attempts = 0;
  while (!abort) {
    if (state.paused) {
      await sleep(300);
      continue;
    }
    let item = null;
    if (useMemoryQueue) {
      item = pendingItems.length ? pendingItems.shift() : null;
    } else {
      let pendentes = [];
      try {
        pendentes = await fetchNextPending(state.uploadId);
      } catch (err) {
        // aguarda um pouco e tenta novamente
        await sleep(2000);
        continue;
      }
      item = pendentes.length ? pendentes[0] : null;
    }
    if (!item) {
      state.completed = true;
      break;
    }
    const phoneDigits = item.telefone_norm || item.telefone_raw || '';
    const chatId = normalizeChatId(phoneDigits);
    if (!chatId) {
      if (item.id) { try { await database.markItemError({ itemId: item.id, errorMessage: 'Telefone inválido', attempts: (item.attempts || 0) + 1 }); } catch {} }
      continue;
    }

    const msg1 = render(config.messageTemplate || item.message_template || '', item);
    const msg2 = config.sendText2Enabled ? render(config.messageTemplate2 || '', item) : '';
    const msg3 = config.sendText3Enabled ? render(config.messageTemplate3 || '', item) : '';

    let attempt = 0;
    let ok = false;
    while (attempt < config.maxRetries && !ok && !abort) {
      if (state.paused) { await sleep(300); continue; }
      try {
        if (config.sendTextEnabled && msg1) await wahaApi.sendMessage(phoneDigits, msg1);
        if (config.sendText2Enabled && msg2) await wahaApi.sendMessage(phoneDigits, msg2);
        if (config.sendText3Enabled && msg3) await wahaApi.sendMessage(phoneDigits, msg3);
        if (config.sendFileEnabled && config.fileUrlForSend) await wahaApi.sendLinkMessage(phoneDigits, String(config.fileUrlForSend).trim());
        if (config.sendImageEnabled && config.imageUrlForSend) await wahaApi.sendLinkMessage(phoneDigits, String(config.imageUrlForSend).trim());
        ok = true;
        if (item.id) { try { await database.markItemSent({ itemId: item.id, messageRendered: msg1, attempts: (item.attempts || 0) + (attempt + 1) }); } catch {} }
      } catch (err) {
        attempt += 1;
        if (attempt >= config.maxRetries) {
          if (item.id) { try { await database.markItemError({ itemId: item.id, errorMessage: String(err?.message || err), attempts: (item.attempts || 0) + attempt }); } catch {} }
        } else {
          await sleep(1500 * attempt);
        }
      }
    }
    const waitSec = nextIntervalSec();
    if (typeof config.onWaitStart === 'function') {
      try { config.onWaitStart(waitSec); } catch {}
    }
    for (let t = waitSec; t > 0 && !abort; t--) {
      if (state.paused) { await sleep(300); t++; continue; }
      if (typeof config.onWaitTick === 'function') {
        try { config.onWaitTick(t); } catch {}
      }
      await sleep(1000);
    }
    if (typeof config.onWaitTick === 'function') {
      try { config.onWaitTick(0); } catch {}
    }
  }
  state.running = false;
}

export const Sender = {
  start(opts) {
    if (state.running) return;
    abort = false;
    config = { ...config, ...(opts || {}) };
    state.uploadId = opts?.uploadId || null;
    useMemoryQueue = Array.isArray(opts?.items) && opts.items.length > 0;
    pendingItems = useMemoryQueue ? [...opts.items] : [];
    if (!useMemoryQueue && !state.uploadId) throw new Error('Sender.start requer uploadId ou items');
    loopPromise = runLoop();
  },
  pause() { state.paused = true; },
  resume() { state.paused = false; },
  stop() { abort = true; state.paused = true; },
  getState() { return { ...state }; },
};

export default Sender;