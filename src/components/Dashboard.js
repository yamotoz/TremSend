import React, { useState, useEffect } from 'react';
import UserPanel from './UserPanel';
import ProcessProgressModal from './ProcessProgressModal';
import toast from 'react-hot-toast';
import UploadCSV from './UploadCSV';
import { LogOut, User, Trash2 } from 'lucide-react';
import { database, supabase } from '../lib/supabase';

const Dashboard = () => {
  const [activeModal, setActiveModal] = useState(null);
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [activeUploads, setActiveUploads] = useState([]);
  const [allUploads, setAllUploads] = useState([]);
  const [lastActivityMap, setLastActivityMap] = useState({});
  const [showOnlyRunning, setShowOnlyRunning] = useState(true);
  const [showProgressUploadId, setShowProgressUploadId] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('userData');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const raw = localStorage.getItem('userData');
    if (raw) {
      try {
        setCurrentUser(JSON.parse(raw));
      } catch {}
    }
  }, []);

  // Polling de uploads e atividade recente para detectar "executando"
  useEffect(() => {
    let t;
    const ensureSession = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) {
          await supabase.auth.signInAnonymously();
        }
      } catch (_) {}
    };
    const poll = async () => {
      await ensureSession();
      const [resAll, resActive] = await Promise.all([
        database.getAllUploads(50),
        database.getActiveUploads(50)
      ]);
      if (resAll.success) setAllUploads(resAll.data || []);
      if (resActive.success) setActiveUploads(resActive.data || []);

      // Buscar última atividade por upload (apenas para os que têm pendentes)
      const targets = (resAll.success ? resAll.data : []).filter(u => (u?.counts_pending || 0) > 0);
      const activityEntries = await Promise.all(targets.map(async u => {
        const la = await database.getUploadLastActivity(u.id);
        return [u.id, la.success ? la.data : null];
      }));
      const map = {};
      activityEntries.forEach(([id, ts]) => { map[id] = ts; });
      setLastActivityMap(map);
    };
    poll();
    t = setInterval(poll, 3000);
    return () => { if (t) clearInterval(t); };
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('username');
      localStorage.removeItem('userData');
      toast.success('Logout realizado com sucesso!');
      window.location.reload();
    } catch (error) {
      toast.error('Erro ao fazer logout');
      console.error('Erro:', error);
    }
  };

  const handleDeleteUpload = async (uploadId, filename) => {
    if (!uploadId) return;
    const ok = window.confirm(`Apagar o processo "${filename || 'upload'}"?\nIsto remove todos os itens associados.`);
    if (!ok) return;
    try {
      const res = await database.deleteUpload(uploadId);
      if (!res.success) {
        toast.error(res.error || 'Não foi possível apagar o processo.');
        return;
      }
      toast.success('Processo apagado.');
      // Remoção otimista nas listas locais
      setAllUploads(prev => prev.filter(u => u.id !== uploadId));
      setActiveUploads(prev => prev.filter(u => u.id !== uploadId));
    } catch (e) {
      toast.error(e.message || String(e));
    }
  };

  const cards = [
    {
      id: 'upload-csv',
      title: 'Upload de Planilha',
      subtitle: 'Faça upload das planilhas e automatize todas as mensagens',
      image: '/vid_img/img_cards/enviomsg.jpg',
      buttonText: 'Subir Planilha',
      action: () => setActiveModal('upload-csv')
    }
  ];

  const renderModal = () => {
    switch (activeModal) {
      case 'upload-csv':
        return <UploadCSV onClose={() => setActiveModal(null)} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Vídeo de fundo */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          className="w-full h-full object-cover"
        >
          <source src="vid_img/imoveis_vid.mp4" type="video/mp4" />
        </video>
        <div className="video-overlay"></div>
      </div>

      {/* Partículas de fundo */}
      <div className="particles">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              width: Math.random() * 6 + 3 + 'px',
              height: Math.random() * 6 + 3 + 'px',
              top: Math.random() * 100 + '%',
            }}
          />
        ))}
      </div>

      {/* Conteúdo principal */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="bg-dark-800/90 border-b border-dark-700">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
            <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
                <img
                  src="/vid_img/Logo.png"
                  alt="METROBYTE Logo"
                  className="h-10 w-auto object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    console.log('Erro ao carregar logo:', e.target.src);
                  }}
                />
              {currentUser && (
                <button
                  onClick={() => setShowUserPanel(true)}
                  className="flex items-center gap-2 px-3 py-1 rounded-md bg-dark-700 hover:bg-dark-600 border border-dark-600"
                  title="Perfil do usuário"
                >
                  <User className="w-4 h-4" />
                  <span className="text-sm text-white/90">{currentUser.username}</span>
                  {currentUser.admin ? (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-600/20 text-green-400 border border-green-700/40">admin</span>
                  ) : (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-sky-600/20 text-sky-300 border border-sky-700/40">usuário</span>
                  )}
                </button>
              )}
              </div>
                   <button
                     onClick={handleLogout}
                     className="btn-secondary flex items-center space-x-2"
                   >
                     <LogOut className="w-4 h-4" />
                     <span>Sair</span>
                   </button>
            </div>
          </div>
        </header>

        {/* Conteúdo principal */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-12 animate-fade-in">
            <h2 className="text-4xl sm:text-5xl font-bebas text-white mb-4 tracking-wider">
              Automação de Mensagens via WhatsApp
            </h2>
            <p className="text-white/90 font-mulish text-lg max-w-2xl mx-auto">
              Gerencie suas mensagens enviadas automaticamente em um só lugar.
            </p>
          </div>

          {/* Processos em andamento movido para o header */}

          {/* Grid de cards (quando só houver 1 card, centralizamos no meio da tela) */}
          {cards.length === 1 ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              {cards.map((card, index) => (
                <div
                  key={card.id}
                  className="max-w-sm mx-auto card group cursor-pointer transform transition-all duration-300 hover:scale-105 animate-slide-up overflow-hidden"
                  style={{ animationDelay: `${index * 0.1}s` }}
                  onClick={card.action}
                >
                  <div className="text-center space-y-4 p-4">
                    {/* Imagem do card */}
                    <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
                      <img
                        src={card.image}
                        alt={card.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300"></div>
                    </div>

                    {/* Título */}
                    <h3 className="text-xl font-bebas text-white tracking-wide">
                      {card.title}
                    </h3>

                    {/* Subtítulo */}
                    <p className="text-dark-300 font-mulish text-sm leading-relaxed">
                      {card.subtitle}
                    </p>

                    {/* Botão de ação */}
                    <button className="btn-primary w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 py-2 px-4 text-sm">
                      {card.buttonText}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              {cards.map((card, index) => (
                <div
                  key={card.id}
                  className="card group cursor-pointer transform transition-all duration-300 hover:scale-105 animate-slide-up overflow-hidden"
                  style={{ animationDelay: `${index * 0.1}s` }}
                  onClick={card.action}
                >
                  <div className="text-center space-y-4">
                    {/* Imagem do card */}
                    <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
                      <img
                        src={card.image}
                        alt={card.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300"></div>
                    </div>

                    {/* Título */}
                    <h3 className="text-xl font-bebas text-white tracking-wide">
                      {card.title}
                    </h3>

                    {/* Subtítulo */}
                    <p className="text-dark-300 font-mulish text-sm leading-relaxed">
                      {card.subtitle}
                    </p>

                    {/* Botão de ação */}
                    <button className="btn-primary w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 py-2 px-4 text-sm">
                      {card.buttonText}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </main>
      </div>

      {/* Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-dark-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {renderModal()}
          </div>
        </div>
      )}

      {/* Painel flutuante à direita: Processos em andamento */}
      <div className="fixed right-3 top-20 sm:top-20 z-40">
        <div className="bg-dark-800/80 backdrop-blur border border-dark-700 rounded-md shadow-lg w-[240px] sm:w-[280px]">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-dark-100">Processos em andamento</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] sm:text-xs text-dark-300">
                {activeUploads.length} ativos
              </span>
              <button
                className="text-[11px] sm:text-xs px-2 py-0.5 rounded border border-dark-600 bg-dark-700/60 hover:bg-dark-700"
                onClick={() => setShowOnlyRunning(s => !s)}
                title={showOnlyRunning ? 'Mostrar todos' : 'Somente executando'}
              >
                {showOnlyRunning ? 'Mostrar todos' : 'Somente executando'}
              </button>
            </div>
          </div>
          <div className="px-2 pb-2 max-h-[40vh] overflow-y-auto">
            {(() => {
              const now = Date.now();
              const WINDOW_MS = 3 * 60 * 1000; // 3 min para considerar "executando"
              const base = showOnlyRunning ? allUploads.filter(u => {
                const pend = u?.counts_pending || 0;
                if (pend <= 0) return false;
                const ts = lastActivityMap[u.id] ? new Date(lastActivityMap[u.id]).getTime() : 0;
                return ts > 0 && (now - ts) <= WINDOW_MS;
              }) : allUploads;

              if (base.length === 0) {
                return <div className="text-dark-300 text-xs px-1">Nenhum processo.</div>;
              }

              return base.map(u => {
                const created = u?.created_at ? new Date(u.created_at) : null;
                const lastAct = lastActivityMap[u.id] ? new Date(lastActivityMap[u.id]) : null;
                const isRunning = (u?.counts_pending || 0) > 0 && lastAct && (now - lastAct.getTime()) <= WINDOW_MS;
                return (
                  <div
                    key={u.id}
                    className={`w-full px-2 py-2 mb-2 rounded-md border ${isRunning ? 'border-sky-600/50' : 'border-dark-600'} ${isRunning ? 'bg-sky-900/30' : 'bg-dark-700/60'} hover:bg-dark-700`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="flex-1 text-left"
                        onClick={() => setShowProgressUploadId(u.id)}
                        title="Ver progresso"
                      >
                        <div className="text-dark-100 text-xs sm:text-sm font-medium truncate">{u.filename || 'Upload'}</div>
                        <div className="text-dark-300 text-[11px] sm:text-xs">Pendentes: {u.counts_pending} • Enviadas: {u.counts_sent}</div>
                        {created && (
                          <div className="text-dark-400 text-[10px] sm:text-[11px]">Criado: {created.toLocaleDateString()} {created.toLocaleTimeString()}</div>
                        )}
                        {lastAct && (
                          <div className="text-dark-400 text-[10px] sm:text-[11px]">Última atividade: {lastAct.toLocaleDateString()} {lastAct.toLocaleTimeString()}</div>
                        )}
                        {!isRunning && (
                          <div className="text-[10px] sm:text-[11px] text-dark-500">Inativo</div>
                        )}
                      </button>
                      <button
                        className="p-1 rounded hover:bg-dark-600 border border-dark-600"
                        title="Apagar processo"
                        onClick={(e) => { e.stopPropagation(); handleDeleteUpload(u.id, u.filename); }}
                      >
                        <Trash2 className="w-4 h-4 text-red-300" />
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Painel do Usuário */}
      {showUserPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUserPanel(false)}></div>
          <div className="relative bg-dark-800 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <UserPanel onClose={() => setShowUserPanel(false)} />
          </div>
        </div>
      )}

      {/* Progresso do Processo */}
      {showProgressUploadId && (
        <ProcessProgressModal uploadId={showProgressUploadId} onClose={() => setShowProgressUploadId(null)} />
      )}
    </div>
  );
};

export default Dashboard;
