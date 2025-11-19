// Simple in-memory store to manage sending processes without database
// Provides real-time sync via subscription callbacks

const listeners = new Set();
const processes = new Map();

function genId() {
  const r = Math.random().toString(36).slice(2, 8);
  return `proc_${Date.now()}_${r}`;
}

function emit() {
  const snapshot = getAllSummaries();
  for (const fn of Array.from(listeners)) {
    try { fn(snapshot); } catch (_) {}
  }
}

function getAllSummaries() {
  const arr = [];
  processes.forEach((p) => {
    arr.push({
      id: p.id,
      filename: p.filename,
      created_at: p.createdAt,
      last_activity_at: p.lastActivityAt,
      counts_pending: p.pending.length,
      counts_sent: p.sent.length,
      counts_error: p.error.length,
      counts_skipped: p.skipped.length,
      status: p.status,
    });
  });
  // Most recent first
  arr.sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  return arr;
}

export const processStore = {
  createProcess({ filename, items = [], config = {} }) {
    const id = genId();
    const now = new Date().toISOString();
    const proc = {
      id,
      filename: filename || 'processo',
      createdAt: now,
      lastActivityAt: null,
      status: 'running', // running | paused | stopped | completed
      config,
      total: items.length,
      pending: [...items],
      sent: [],
      error: [],
      skipped: [],
    };
    processes.set(id, proc);
    emit();
    return id;
  },

  deleteProcess(id) {
    const ok = processes.delete(id);
    emit();
    return ok;
  },

  pause(id) {
    const p = processes.get(id);
    if (!p) return false;
    p.status = 'paused';
    emit();
    return true;
  },

  resume(id) {
    const p = processes.get(id);
    if (!p) return false;
    p.status = 'running';
    emit();
    return true;
  },

  stop(id) {
    const p = processes.get(id);
    if (!p) return false;
    p.status = 'stopped';
    emit();
    return true;
  },

  markSent(id, item, extras = {}) {
    const p = processes.get(id);
    if (!p) return false;
    p.sent.unshift({ ...item, status: 'sent', ...extras });
    // remove from pending by simple match on phone or id
    p.pending = p.pending.filter((x) => {
      const a = String(x.telefone_norm || x.telefone || x.id || '');
      const b = String(item.telefone_norm || item.telefone || item.id || '');
      return a !== b;
    });
    p.lastActivityAt = new Date().toISOString();
    if (p.pending.length === 0 && p.status !== 'stopped') {
      p.status = 'completed';
    }
    emit();
    return true;
  },

  markError(id, item, errorMessage) {
    const p = processes.get(id);
    if (!p) return false;
    p.error.unshift({ ...item, status: 'error', errorMessage });
    // remove item dos pendentes
    p.pending = p.pending.filter((x) => {
      const a = String(x.telefone_norm || x.telefone || x.id || '');
      const b = String(item.telefone_norm || item.telefone || item.id || '');
      return a !== b;
    });
    p.lastActivityAt = new Date().toISOString();
    if (p.pending.length === 0 && p.status !== 'stopped') {
      p.status = 'completed';
    }
    emit();
    return true;
  },

  markSkipped(id, item, reason) {
    const p = processes.get(id);
    if (!p) return false;
    p.skipped.unshift({ ...item, status: 'skipped', reason });
    // remove item dos pendentes
    p.pending = p.pending.filter((x) => {
      const a = String(x.telefone_norm || x.telefone || x.id || '');
      const b = String(item.telefone_norm || item.telefone || item.id || '');
      return a !== b;
    });
    p.lastActivityAt = new Date().toISOString();
    if (p.pending.length === 0 && p.status !== 'stopped') {
      p.status = 'completed';
    }
    emit();
    return true;
  },

  setPending(id, items) {
    const p = processes.get(id);
    if (!p) return false;
    p.pending = [...items];
    p.total = p.pending.length + p.sent.length + p.error.length + p.skipped.length;
    emit();
    return true;
  },

  getStats(id) {
    const p = processes.get(id);
    if (!p) return { total: 0, pending: 0, sent: 0, error: 0, skipped: 0 };
    return {
      total: p.total,
      pending: p.pending.length,
      sent: p.sent.length,
      error: p.error.length,
      skipped: p.skipped.length,
      status: p.status,
    };
  },

  getPending(id, limit = 500) {
    const p = processes.get(id);
    return p ? p.pending.slice(0, limit) : [];
  },

  getSent(id, limit = 500) {
    const p = processes.get(id);
    return p ? p.sent.slice(0, limit) : [];
  },

  getAll() {
    return getAllSummaries();
  },

  get(id) {
    return processes.get(id) || null;
  },

  subscribe(fn) {
    listeners.add(fn);
    try { fn(getAllSummaries()); } catch (_) {}
    return () => { listeners.delete(fn); };
  },
};