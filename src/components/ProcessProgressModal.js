import React, { useEffect, useState } from 'react';
import { X, Send, AlertCircle, Clock } from 'lucide-react';
import { processStore } from '../lib/processStore';

const fmt = (n) => String(n).padStart(2, '0');

export default function ProcessProgressModal({ processId, onClose }) {
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0, error: 0, skipped: 0 });
  const [pending, setPending] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = processStore.subscribe(() => {
      setStats(processStore.getStats(processId));
      setPending(processStore.getPending(processId, 500));
      setSent(processStore.getSent(processId, 500));
      setLoading(false);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [processId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dark-800 border border-dark-700 rounded-xl shadow-2xl w-full max-w-3xl mx-4">
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <div className="flex items-center gap-2 text-dark-100">
            <Send className="w-5 h-5" />
            <span className="font-semibold">Progresso do Processo</span>
            <span className="text-dark-300">• ID: {processId}</span>
          </div>
          <button className="p-2 rounded hover:bg-dark-700" onClick={onClose}>
            <X className="w-5 h-5 text-dark-200" />
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="text-dark-200">Carregando…</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-700/50 rounded-lg p-3">
                <div className="text-sm text-dark-300 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Resumo</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Total: {stats.total}</div>
                  <div>Pendentes: {stats.pending}</div>
                  <div>Enviadas: {stats.sent}</div>
                  <div>Erros: {stats.error}</div>
                  <div>Pulados: {stats.skipped}</div>
                </div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-3">
                <div className="text-sm text-dark-300 mb-2">Últimas enviadas</div>
                <div className="max-h-48 overflow-auto text-sm">
                  {sent.length === 0 ? (
                    <div className="text-dark-400">Nenhuma ainda.</div>
                  ) : (
                    sent.slice(0, 15).map((row) => (
                      <div key={row.id} className="flex justify-between py-1 border-b border-dark-700/40">
                        <span className="text-dark-100">{row.nome || row.telefone_norm || row.telefone_raw || 'Contato'}</span>
                        <span className="text-dark-400">ID #{row.id}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="col-span-2 bg-dark-700/50 rounded-lg p-3">
                <div className="text-sm text-dark-300 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Pendentes</span>
                </div>
                <div className="max-h-60 overflow-auto text-sm">
                  {pending.length === 0 ? (
                    <div className="text-dark-400">Sem pendentes.</div>
                  ) : (
                    pending.slice(0, 50).map((row) => (
                      <div key={row.id} className="grid grid-cols-3 gap-2 py-1 border-b border-dark-700/40">
                        <span className="text-dark-100 truncate">{row.nome || 'Contato'}</span>
                        <span className="text-dark-300 truncate">{row.telefone_norm || row.telefone_raw || ''}</span>
                        <span className="text-dark-400">ID #{row.id}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-dark-700 flex justify-end">
          <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}