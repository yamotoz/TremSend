import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { database, supabase } from '../lib/supabase';

const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    // Mapear os novos nomes de campos para os nomes originais
    const fieldMapping = {
      'user': 'username',
      'pass': 'password'
    };
    
    const fieldName = fieldMapping[e.target.name] || e.target.name;
    
    setFormData({
      ...formData,
      [fieldName]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Autenticar via Supabase
      const result = await database.authenticateUser(formData.username, formData.password);
      
      if (result.success) {
        // Criar sessão no Supabase Auth (anônima) para satisfazer RLS, se habilitado
        try {
          const { data: anonSession, error: anonErr } = await supabase.auth.signInAnonymously();
          if (anonErr) {
            console.warn('Anon auth não habilitado; RLS pode bloquear inserts.', anonErr.message);
          } else {
            console.log('Sessão anônima criada:', !!anonSession?.user);
          }
        } catch (e) {
          console.warn('Falha ao criar sessão auth:', e?.message || e);
        }
        // Salvar dados do usuário no localStorage
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('username', result.user.username);
        localStorage.setItem('userData', JSON.stringify(result.user));
        if (typeof result.user.admin !== 'undefined') {
          localStorage.setItem('isAdmin', String(!!result.user.admin));
        } else {
          localStorage.removeItem('isAdmin');
        }
        
        toast.success(result.message);
        window.location.reload();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Erro inesperado. Tente novamente.');
      console.error('Erro:', error);
    } finally {
      setLoading(false);
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
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              width: Math.random() * 4 + 2 + 'px',
              height: Math.random() * 4 + 2 + 'px',
              top: Math.random() * 100 + '%',
            }}
          />
        ))}
      </div>

      {/* Conteúdo principal */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Logo e título */}
          <div className="text-center animate-fade-in">
            <div className="mb-6">
              <img
                src="/vid_img/favicon-st.jpg"
                alt="Logo"
                className="mx-auto rounded-full h-24 w-24 sm:h-32 sm:w-32 object-cover shadow-lg"
                onError={(e) => {
                  e.target.style.display = 'none';
                  console.log('Erro ao carregar logo:', e.target.src);
                }}
              />
            </div>
            <p className="text-dark-300 font-mulish text-lg">
              Interface de Automatização de Mensagens
            </p>
          </div>

          {/* Formulário de login */}
          <div className="mt-8 animate-slide-up">
            <div className="card max-w-md mx-auto">
              <form className="space-y-6 no-autocomplete" onSubmit={handleSubmit} autoComplete="off" autocorrect="off" spellcheck="false">
                {/* Campos falsos para enganar o navegador */}
                <input type="text" name="fakeuser" autoComplete="off" style={{ display: 'none' }} />
                <input type="password" name="fakepassword" autoComplete="off" style={{ display: 'none' }} />
                <input type="email" name="fakeemail" autoComplete="off" style={{ display: 'none' }} />
                <input type="tel" name="fakephone" autoComplete="off" style={{ display: 'none' }} />

                <div>
                  <label htmlFor="user" className="block text-sm font-medium text-dark-200 mb-2">
                    Nome de Usuário
                  </label>
                  <input
                    id="user"
                    name="user"
                    type="text"
                    autoComplete="new-password"
                    autocorrect="off"
                    spellCheck="false"
                    required
                    className="input-field"
                    placeholder="Digite seu nome de usuário"
                    value={formData.username}
                    onChange={handleChange}
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>

                <div>
                  <label htmlFor="pass" className="block text-sm font-medium text-dark-200 mb-2">
                    Senha
                  </label>
                  <input
                    id="pass"
                    name="pass"
                    type="password"
                    autoComplete="new-password"
                    autocorrect="off"
                    spellCheck="false"
                    required
                    className="input-field"
                    placeholder="Digite sua senha"
                    value={formData.password}
                    onChange={handleChange}
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full flex justify-center items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Entrando...</span>
                      </>
                    ) : (
                      <span>Entrar</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Informações adicionais */}
          <div className="text-center animate-fade-in">
            <p className="text-dark-400 text-sm font-mulish">
              Acesso seguro e criptografado
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
