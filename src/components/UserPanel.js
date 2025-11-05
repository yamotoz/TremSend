import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { database } from '../lib/supabase';

const UserPanel = ({ onClose }) => {
  const stored = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('userData') || 'null'); } catch { return null; }
  }, []);
  const username = stored?.username || '';
  const isAdmin = !!stored?.admin;
  const isMaster = username === 'stenio';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingPw, setLoadingPw] = useState(false);

  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', email: '', admin: false });
  const [loadingCreate, setLoadingCreate] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return toast.error('Preencha as senhas');
    if (newPassword !== confirmPassword) return toast.error('A confirmação não confere');
    setLoadingPw(true);
    const res = await database.changePassword({ username, currentPassword, newPassword });
    setLoadingPw(false);
    if (res.success) {
      toast.success('Senha alterada com sucesso');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toast.error(res.error || 'Não foi possível alterar a senha');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!isAdmin) return toast.error('Acesso negado');
    if (!newUser.username || !newUser.password) return toast.error('Usuário e senha são obrigatórios');
    if (newUser.admin && !isMaster) return toast.error('Somente o master pode criar admins');
    setLoadingCreate(true);
    const res = await database.createUser({
      requesterUsername: username,
      username: newUser.username,
      password: newUser.password,
      fullName: newUser.name,
      email: newUser.email,
      isAdmin: !!newUser.admin,
    });
    setLoadingCreate(false);
    if (res.success) {
      toast.success('Usuário criado');
      setNewUser({ username: '', password: '', name: '', email: '', admin: false });
    } else {
      toast.error(res.error || 'Erro ao criar usuário');
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bebas text-white">Perfil do Usuário</h3>
        <button onClick={onClose} className="btn-secondary">Fechar</button>
      </div>

      <div className="space-y-6">
        <div className="bg-dark-700 rounded-lg p-4 border border-dark-600">
          <div className="flex items-center gap-3">
            <span className="text-white/90">{username}</span>
            {stored?.admin ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-600/20 text-green-400 border border-green-700/40">admin</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-sky-600/20 text-sky-300 border border-sky-700/40">usuário</span>
            )}
            {isMaster && (
              <span className="text-xs px-2 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-700/40">master</span>
            )}
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="bg-dark-700 rounded-lg p-4 border border-dark-600 space-y-3">
          <h4 className="text-white/90 font-mulish">Trocar senha</h4>
          <input className="input-field" type="password" placeholder="Senha atual" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <input className="input-field" type="password" placeholder="Nova senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <input className="input-field" type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={loadingPw}>{loadingPw ? 'Salvando...' : 'Salvar'}</button>
        </form>

        {isAdmin && (
          <form onSubmit={handleCreateUser} className="bg-dark-700 rounded-lg p-4 border border-dark-600 space-y-3">
            <h4 className="text-white/90 font-mulish">Cadastrar novo usuário</h4>
            <input className="input-field" type="text" placeholder="Nome de usuário" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            <input className="input-field" type="password" placeholder="Senha" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <input className="input-field" type="text" placeholder="Nome completo (opcional)" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <input className="input-field" type="email" placeholder="Email (opcional)" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <label className="flex items-center gap-2 text-white/80">
              <input type="checkbox" checked={newUser.admin} onChange={(e) => setNewUser({ ...newUser, admin: e.target.checked })} disabled={!isMaster} />
              <span>Tornar administrador {isMaster ? '' : '(apenas master pode)'}</span>
            </label>
            <button type="submit" className="btn-primary" disabled={loadingCreate}>{loadingCreate ? 'Cadastrando...' : 'Cadastrar'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default UserPanel;


