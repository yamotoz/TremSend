-- Criar tabela de usuários (mantendo o nome "usuarios" conforme Supabase atual)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  nome_completo VARCHAR(255),
  email VARCHAR(255),
  admin BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir usuário master "Stenio" (apenas primeira vez)
INSERT INTO usuarios (username, password, nome_completo, email, admin)
VALUES ('stenio', 'stenioadmin', 'Stenio (Master Admin)', 'stenio@steniomello.com', true)
ON CONFLICT (username) DO NOTHING;

-- Habilitar RLS (Row Level Security)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir leitura e autenticação
CREATE POLICY "Permitir leitura de usuários para autenticação" ON usuarios 
FOR SELECT USING (true);

-- Função para verificar credenciais
CREATE OR REPLACE FUNCTION verificar_login(p_username TEXT, p_password TEXT)
RETURNS TABLE(
  id INTEGER,
  username VARCHAR(50),
  nome_completo VARCHAR(255),
  email VARCHAR(255),
  admin BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u.nome_completo,
    u.email,
    u.admin
  FROM usuarios u
  WHERE u.username = p_username 
    AND u.password = p_password 
    AND u.ativo = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: criar_usuario (apenas admins; somente o master 'Stenio' pode setar admin = true)
CREATE OR REPLACE FUNCTION criar_usuario(
  p_solicitante_username TEXT,
  p_username TEXT,
  p_password TEXT,
  p_nome_completo TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_admin BOOLEAN DEFAULT false
) RETURNS TABLE(
  id INTEGER,
  username VARCHAR(50),
  admin BOOLEAN
) AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Verificar se solicitante é admin
  SELECT u.admin INTO v_is_admin FROM usuarios u WHERE u.username = p_solicitante_username AND u.ativo = true;
  IF v_is_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Apenas administradores podem criar usuários';
  END IF;

  -- Se tentar criar admin, apenas o master pode
  IF p_admin = true AND p_solicitante_username <> 'stenio' THEN
    RAISE EXCEPTION 'Somente o administrador master pode criar outros administradores';
  END IF;

  -- Verificar se usuário já existe
  IF EXISTS (SELECT 1 FROM usuarios u WHERE u.username = p_username) THEN
    RAISE EXCEPTION 'Usuário já existe';
  END IF;

  INSERT INTO usuarios (username, password, nome_completo, email, admin, ativo)
  VALUES (p_username, p_password, p_nome_completo, p_email, COALESCE(p_admin, false), true);

  RETURN QUERY
  SELECT u.id, u.username, u.admin FROM usuarios u WHERE u.username = p_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: trocar_senha (usuário troca a própria senha)
CREATE OR REPLACE FUNCTION trocar_senha(
  p_username TEXT,
  p_senha_atual TEXT,
  p_nova_senha TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM usuarios u
    WHERE u.username = p_username AND u.password = p_senha_atual AND u.ativo = true
  ) INTO v_exists;

  IF v_exists IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  UPDATE usuarios u SET password = p_nova_senha, updated_at = NOW()
  WHERE u.username = p_username;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
