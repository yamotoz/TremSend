import React, { useState, useEffect } from 'react';
import UserPanel from './UserPanel';
import toast from 'react-hot-toast';
import UploadCSV from './UploadCSV';
import { LogOut, User } from 'lucide-react';

const Dashboard = () => {
  const [activeModal, setActiveModal] = useState(null);
  const [showUserPanel, setShowUserPanel] = useState(false);
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

      {/* Painel do Usuário */}
      {showUserPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUserPanel(false)}></div>
          <div className="relative bg-dark-800 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <UserPanel onClose={() => setShowUserPanel(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
