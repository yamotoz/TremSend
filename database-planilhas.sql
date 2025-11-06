-- Extensões recomendadas
create extension if not exists pgcrypto;

-- Tabela: uploads (uma por planilha enviada)
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid, -- se usar Supabase Auth, mapear para auth.uid()
  filename text not null,
  mime_type text,
  file_size bigint,
  storage_path text, -- caminho no supabase storage (ex: uploads/<uuid>.csv)
  source text check (source in ('csv','xlsx')),
  columns jsonb, -- cabeçalhos/estrutura original da planilha
  counts_pending integer not null default 0,
  counts_sent integer not null default 0,
  counts_error integer not null default 0,
  counts_skipped integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabela: itens de uma planilha (cada linha)
create table if not exists upload_items (
  id bigserial primary key,
  upload_id uuid not null references uploads(id) on delete cascade,
  nome text,
  empresa text,
  email text,
  telefone_raw text,   -- como veio da planilha (limpo ou sujo)
  telefone_norm text,  -- apenas dígitos, normalizado e possivelmente prefixado
  message_template text,   -- template utilizado no envio
  message_rendered text,   -- mensagem renderizada com {nome}/{empresa}
  status text not null check (status in ('pending','sent','error','skipped')),
  attempts integer not null default 0,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para evitar duplicações dentro do mesmo upload
create unique index if not exists uniq_upload_item_phone
  on upload_items (upload_id, telefone_norm)
  where telefone_norm is not null and telefone_norm <> '';

create unique index if not exists uniq_upload_item_email
  on upload_items (upload_id, email)
  where email is not null and email <> '';

-- Atualização automática de updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists uploads_set_updated_at on uploads;
create trigger uploads_set_updated_at
before update on uploads
for each row execute procedure set_updated_at();

drop trigger if exists upload_items_set_updated_at on upload_items;
create trigger upload_items_set_updated_at
before update on upload_items
for each row execute procedure set_updated_at();

-- Função auxiliar: normaliza telefone (apenas dígitos, opcional prefixo 55)
create or replace function fn_normalize_phone(p_text text, p_add_prefix_55 boolean default false)
returns text language plpgsql as $$
declare
  d text;
begin
  if p_text is null then
    return null;
  end if;
  d := regexp_replace(p_text, '\D', '', 'g');
  if d = '' then
    return null;
  end if;
  if p_add_prefix_55 and position('55' in d) <> 1 then
    d := '55' || d;
  end if;
  return d;
end;
$$;

-- Função auxiliar: alterna '9' na 9ª posição a partir da direita
-- (insere se não houver; remove se houver)
create or replace function fn_toggle_nine_at_pos(p_digits text, p_pos_from_right int default 9)
returns text language plpgsql as $$
declare
  clean text;
  idx int;
begin
  if p_digits is null then return null; end if;
  clean := regexp_replace(p_digits, '\D', '', 'g');
  if clean = '' then return null; end if;
  if length(clean) < p_pos_from_right then
    return clean;
  end if;
  idx := length(clean) - p_pos_from_right;
  if substring(clean from idx+1 for 1) = '9' then
    -- remove
    return substring(clean from 1 for idx) || substring(clean from idx+2);
  else
    -- insere
    return substring(clean from 1 for idx) || '9' || substring(clean from idx+1);
  end if;
end;
$$;

-- Agregação de contadores no uploads
create or replace function upload_items_counts_agg()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      update uploads set counts_pending = counts_pending + 1 where id = new.upload_id;
    elsif new.status = 'sent' then
      update uploads set counts_sent = counts_sent + 1 where id = new.upload_id;
    elsif new.status = 'error' then
      update uploads set counts_error = counts_error + 1 where id = new.upload_id;
    elsif new.status = 'skipped' then
      update uploads set counts_skipped = counts_skipped + 1 where id = new.upload_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'pending' then
        update uploads set counts_pending = counts_pending - 1 where id = new.upload_id;
      elsif old.status = 'sent' then
        update uploads set counts_sent = counts_sent - 1 where id = new.upload_id;
      elsif old.status = 'error' then
        update uploads set counts_error = counts_error - 1 where id = new.upload_id;
      elsif old.status = 'skipped' then
        update uploads set counts_skipped = counts_skipped - 1 where id = new.upload_id;
      end if;

      if new.status = 'pending' then
        update uploads set counts_pending = counts_pending + 1 where id = new.upload_id;
      elsif new.status = 'sent' then
        update uploads set counts_sent = counts_sent + 1 where id = new.upload_id;
      elsif new.status = 'error' then
        update uploads set counts_error = counts_error + 1 where id = new.upload_id;
      elsif new.status = 'skipped' then
        update uploads set counts_skipped = counts_skipped + 1 where id = new.upload_id;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'pending' then
      update uploads set counts_pending = counts_pending - 1 where id = old.upload_id;
    elsif old.status = 'sent' then
      update uploads set counts_sent = counts_sent - 1 where id = old.upload_id;
    elsif old.status = 'error' then
      update uploads set counts_error = counts_error - 1 where id = old.upload_id;
    elsif old.status = 'skipped' then
      update uploads set counts_skipped = counts_skipped - 1 where id = old.upload_id;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists upload_items_counts_agg_trg on upload_items;
create trigger upload_items_counts_agg_trg
after insert or update or delete on upload_items
for each row execute procedure upload_items_counts_agg();

-- Views para os painéis (pendentes e enviados)
create or replace view v_upload_pendentes as
  select *
  from upload_items
  where status = 'pending';

create or replace view v_upload_enviados as
  select *
  from upload_items
  where status = 'sent';

-- RPC: criar upload (retorna id)
create or replace function criar_upload(
  p_owner_id uuid,
  p_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_storage_path text,
  p_source text,
  p_columns jsonb
) returns uuid
language plpgsql
security definer
set search_path = public as $$
declare
  v_id uuid;
begin
  -- Garante que existe um usuário autenticado
  if auth.uid() is null and p_owner_id is null then
    raise exception 'unauthenticated: auth.uid() is null';
  end if;

  -- Define o dono como o usuário autenticado (ou o parâmetro explícito)
  insert into uploads (owner_id, filename, mime_type, file_size, storage_path, source, columns)
  values (coalesce(p_owner_id, auth.uid()), p_filename, p_mime_type, p_file_size, p_storage_path, p_source, p_columns)
  returning id into v_id;
  return v_id;
end;
$$;

-- RPC: inserir itens em lote a partir de JSONB
-- Espera array de objetos com chaves: nome, empresa, email, telefone_raw, add_prefix_55 boolean, message_template
create or replace function inserir_itens_upload(
  p_upload_id uuid,
  p_items jsonb
) returns integer
language plpgsql
security definer
set search_path = public as $$
declare
  v_inserted integer := 0;
begin
  -- Verifica se o upload pertence ao usuário autenticado
  if auth.uid() is null then
    raise exception 'unauthenticated: auth.uid() is null';
  end if;
  if not exists (select 1 from uploads where id = p_upload_id and owner_id = auth.uid()) then
    raise exception 'forbidden: upload does not belong to current user';
  end if;

  insert into upload_items (upload_id, nome, empresa, email, telefone_raw, telefone_norm, message_template, status)
  select
    p_upload_id,
    (x->>'nome'),
    (x->>'empresa'),
    (x->>'email'),
    (x->>'telefone') as telefone_raw,
    fn_normalize_phone((x->>'telefone'), coalesce((x->>'add_prefix_55')::boolean, false)) as telefone_norm,
    (x->>'message_template'),
    'pending'
  from jsonb_array_elements(p_items) as x
  on conflict (upload_id, telefone_norm) where telefone_norm is not null and telefone_norm <> ''
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- RPC: marcar item como enviado
create or replace function marcar_item_enviado(
  p_item_id bigint,
  p_message_rendered text,
  p_attempts integer default 1
) returns void
language plpgsql
security definer
set search_path = public as $$
begin
  update upload_items
  set status = 'sent',
      sent_at = now(),
      attempts = p_attempts,
      message_rendered = p_message_rendered
  where id = p_item_id
    and upload_id in (select id from uploads where owner_id = auth.uid());
end;
$$;

-- RPC: marcar item com erro
create or replace function marcar_item_erro(
  p_item_id bigint,
  p_error_message text,
  p_attempts integer default 1
) returns void
language plpgsql
security definer
set search_path = public as $$
begin
  update upload_items
  set status = 'error',
      error_message = p_error_message,
      attempts = p_attempts
  where id = p_item_id
    and upload_id in (select id from uploads where owner_id = auth.uid());
end;
$$;

-- RPC: marcar item como pulado (skipped)
create or replace function marcar_item_pulado(
  p_item_id bigint,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public as $$
begin
  update upload_items
  set status = 'skipped',
      error_message = p_reason
  where id = p_item_id
    and upload_id in (select id from uploads where owner_id = auth.uid());
end;
$$;

-- RPC: estatísticas por upload
create or replace function estatisticas_upload(p_upload_id uuid)
returns jsonb
language plpgsql as $$
declare
  v_total integer;
  v_pending integer;
  v_sent integer;
  v_error integer;
  v_skipped integer;
begin
  select count(*)
    into v_total
  from upload_items
  where upload_id = p_upload_id;

  select counts_pending, counts_sent, counts_error, counts_skipped
    into v_pending, v_sent, v_error, v_skipped
  from uploads
  where id = p_upload_id;

  return jsonb_build_object(
    'total', v_total,
    'pending', coalesce(v_pending,0),
    'sent', coalesce(v_sent,0),
    'error', coalesce(v_error,0),
    'skipped', coalesce(v_skipped,0)
  );
end;
$$;

-- RLS (ajuste conforme sua autenticação)
alter table uploads enable row level security;
alter table upload_items enable row level security;

-- Se usar Supabase Auth: permitir ao dono ver/manipular seus uploads
drop policy if exists uploads_select_policy on uploads;
create policy uploads_select_policy on uploads
  for select
  using (owner_id = auth.uid());

drop policy if exists uploads_insert_policy on uploads;
create policy uploads_insert_policy on uploads
  for insert
  with check (owner_id = auth.uid());

drop policy if exists uploads_update_policy on uploads;
create policy uploads_update_policy on uploads
  for update
  using (owner_id = auth.uid());

drop policy if exists uploads_delete_policy on uploads;
create policy uploads_delete_policy on uploads
  for delete
  using (owner_id = auth.uid());

drop policy if exists upload_items_select_policy on upload_items;
create policy upload_items_select_policy on upload_items
  for select
  using (
    upload_id in (select id from uploads where owner_id = auth.uid())
  );

drop policy if exists upload_items_insert_policy on upload_items;
create policy upload_items_insert_policy on upload_items
  for insert
  with check (
    upload_id in (select id from uploads where owner_id = auth.uid())
  );

drop policy if exists upload_items_update_policy on upload_items;
create policy upload_items_update_policy on upload_items
  for update
  using (
    upload_id in (select id from uploads where owner_id = auth.uid())
  );

drop policy if exists upload_items_delete_policy on upload_items;
create policy upload_items_delete_policy on upload_items
  for delete
  using (
    upload_id in (select id from uploads where owner_id = auth.uid())
  );