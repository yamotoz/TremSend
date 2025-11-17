// TremSend Background Worker
// Processo independente para continuar o envio mesmo sem a aba aberta.
// Requer variáveis de ambiente (.env) com REACT_APP_* e dependências axios/@supabase/supabase-js/dotenv.

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const SUPABASE_EMAIL = process.env.REACT_APP_SUPABASE_EMAIL;
const SUPABASE_PASSWORD = process.env.REACT_APP_SUPABASE_PASSWORD;
const WAHA_URL = process.env.REACT_APP_WAHA_BASE_URL;
const WAHA_API_KEY = process.env.REACT_APP_WAHA_API_KEY;
const WAHA_SESSION = process.env.REACT_APP_WAHA_SESSION || 'default';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase env ausente: configure REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY');
  process.exit(1);
}
if (!WAHA_URL || !WAHA_API_KEY) {
  console.error('WAHA env ausente: configure REACT_APP_WAHA_BASE_URL e REACT_APP_WAHA_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Args: --upload <uuid> [--interval 60] [--rand 10,50]
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx >= 0) return args[idx + 1];
  return null;
};

const uploadId = getArg('--upload');
const fixedInterval = getArg('--interval') ? Number(getArg('--interval')) : null;
const randArg = getArg('--rand');
let randomRange = null;
if (randArg) {
  const [minS, maxS] = randArg.split(',').map(n => Number(n));
  randomRange = { min: Math.max(1, minS || 1), max: Math.max(minS || 1, maxS || minS || 1) };
}

if (!uploadId) {
  console.error('Uso: node scripts/worker.js --upload <uuid> [--interval 60] [--rand 10,50]');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nextIntervalSec = () => {
  if (randomRange) {
    const lo = randomRange.min;
    const hi = randomRange.max;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  return fixedInterval || 60;
};

function normalizeChatId(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // se 11 dígitos e não começa com 55, prefixa 55
  const with55 = digits.startsWith('55') ? digits : (digits.length === 11 ? ('55' + digits) : digits);
  return with55 + '@c.us';
}

async function fetchNextPending(limit = 1) {
  const { data, error } = await supabase
    .from('v_upload_pendentes')
    .select('*')
    .eq('upload_id', uploadId)
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function markItemSent(itemId, messageRendered, attempts) {
  const { error } = await supabase.rpc('marcar_item_enviado', {
    p_item_id: itemId,
    p_message_rendered: messageRendered || null,
    p_attempts: attempts || 1
  });
  if (error) throw error;
  // Valida se o status realmente mudou para evitar repetição por RLS/ownership
  const { data: check, error: checkErr } = await supabase
    .from('upload_items')
    .select('status')
    .eq('id', itemId)
    .single();
  if (!checkErr && check && check.status !== 'sent') {
    throw new Error('Item não marcado como enviado (possível RLS/owner).');
  }
}

async function markItemError(itemId, errorMessage, attempts) {
  const { error } = await supabase.rpc('marcar_item_erro', {
    p_item_id: itemId,
    p_error_message: errorMessage || null,
    p_attempts: attempts || 1
  });
  if (error) throw error;
}

async function sendText(chatId, text) {
  const url = `${WAHA_URL.replace(/\/$/, '')}/api/sendText`;
  const headers = { 'X-Api-Key': WAHA_API_KEY };
  const body = { session: WAHA_SESSION, chatId, text };
  const res = await axios.post(url, body, { headers, timeout: 30000 });
  return res?.data;
}

function renderMessage(tpl, row) {
  let out = String(tpl || '');
  const dict = {
    nome: row.nome || '',
    empresa: row.empresa || '',
    email: row.email || '',
    telefone: row.telefone_norm || row.telefone_raw || ''
  };
  out = out.replace(/\{(.*?)\}/g, (_, key) => String(dict[key] || ''));
  return out;
}

async function run() {
  console.log('Worker iniciado para upload:', uploadId);
  console.log('Intervalo:', randomRange ? `${randomRange.min}s~${randomRange.max}s` : `${fixedInterval || 60}s`);
  // Autenticação obrigatória para que RPCs consigam atualizar status (funções usam auth.uid())
  if (!SUPABASE_EMAIL || !SUPABASE_PASSWORD) {
    console.error('Faltam REACT_APP_SUPABASE_EMAIL/REACT_APP_SUPABASE_PASSWORD para autenticar no Supabase.');
    console.error('Sem autenticação, o worker pode reenviar o mesmo item e não sincronizar com o dashboard.');
    process.exit(1);
  }
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: SUPABASE_EMAIL,
    password: SUPABASE_PASSWORD
  });
  if (loginError) {
    console.error('Login Supabase falhou:', loginError.message || loginError);
    process.exit(1);
  }
  console.log('Autenticado no Supabase com sucesso.');
  let processed = 0;
  while (true) {
    let pendentes = [];
    try {
      pendentes = await fetchNextPending(1);
    } catch (err) {
      console.error('Erro buscando pendentes:', err.message || err);
      await sleep(2000);
      continue;
    }
    if (!pendentes.length) {
      console.log('Fila vazia — finalizando. Processados:', processed);
      break;
    }
    const item = pendentes[0];
    const chatId = normalizeChatId(item.telefone_norm || item.telefone_raw);
    if (!chatId) {
      await markItemError(item.id, 'Telefone inválido', 1);
      processed++;
      continue;
    }
    const text = renderMessage(item.message_template || '', item);
    try {
      await sendText(chatId, text);
      await markItemSent(item.id, text, (item.attempts || 0) + 1);
      processed++;
      console.log('Enviado:', item.id, chatId);
    } catch (err) {
      // Se falhou marcar enviado por RLS/owner, não reenvia o mesmo item indefinidamente
      try {
        await markItemError(item.id, String(err?.message || err), (item.attempts || 0) + 1);
      } catch (markErr) {
        console.error('Falha ao marcar erro no item', item.id, ':', markErr.message || markErr);
      }
      console.error('Erro ao enviar item', item.id, ':', err.message || err);
    }

    const waitSec = nextIntervalSec();
    await sleep(waitSec * 1000);
  }
}

run().catch(err => {
  console.error('Worker falhou:', err.message || err);
  process.exit(1);
});