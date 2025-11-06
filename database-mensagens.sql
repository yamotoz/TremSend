-- Tabela para armazenar templates de mensagens de envio
-- Execute este script no SQL Editor do seu projeto Supabase.

CREATE TABLE IF NOT EXISTS public.mensagens_modelos (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NULL,
  titulo TEXT NULL,
  conteudo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ativar RLS (ajuste as policies conforme sua necessidade)
ALTER TABLE public.mensagens_modelos ENABLE ROW LEVEL SECURITY;

-- Permitir INSERT/SELECT para usuários autenticados (ajuste para sua regra)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mensagens_modelos' AND policyname = 'mensagens_modelos_insert_auth'
  ) THEN
    CREATE POLICY mensagens_modelos_insert_auth
      ON public.mensagens_modelos
      FOR INSERT
      TO authenticated
      WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mensagens_modelos' AND policyname = 'mensagens_modelos_select_auth'
  ) THEN
    CREATE POLICY mensagens_modelos_select_auth
      ON public.mensagens_modelos
      FOR SELECT
      TO authenticated
      USING (owner_id = auth.uid() OR owner_id IS NULL);
  END IF;
END $$;

-- Opcional: índice por owner_id para consultas por usuário
CREATE INDEX IF NOT EXISTS mensagens_modelos_owner_idx ON public.mensagens_modelos (owner_id);