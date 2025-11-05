# TremSend — Automação de Mensagens WhatsApp (WAHA)

![TremSend](public/vid_img/readme.png)

Interface focada em envio automatizado e personalizado de mensagens via WhatsApp, consumindo a WAHA (WhatsApp HTTP API) e integrando cadastro/autenticação de usuários com Supabase.

## Objetivo
- Automatizar o envio de mensagens para números de uma planilha, com personalização por contato.
- Respeitar intervalo entre envios com contagem regressiva visível e envio inicial imediato.
- Controlar perfis de usuário, onde apenas o master pode promover administradores.

## Como funciona
- Upload da planilha e mapeamento de colunas (Nome, Telefone; pendentes mostram somente Nome e Telefone).
- Validação e contagem de números com menos de 7 dígitos (exibida antes do envio; esses são ignorados).
- Ao confirmar, o worker inicia imediatamente: envia o primeiro contato, inicia o cronômetro por intervalo e segue processando fila.
- Cada envio chama a WAHA com `axios.post` para `http://localhost:3000/api/sendText` usando `{ session, chatId, text }` e `X-Api-Key` no header.
- Após sucesso, o contato é movido de “pendentes” para “enviadas”; erros aparecem com detalhe.

## Configuração (.env)
- `REACT_APP_WAHA_BASE_URL=http://localhost:3000`
- `REACT_APP_WAHA_API_KEY=<sua_api_key>`
- `REACT_APP_WAHA_SESSION=default`
- `REACT_APP_SUPABASE_URL=<sua_url_supabase>`
- `REACT_APP_SUPABASE_ANON_KEY=<sua_anon_key>`

Troque apenas `REACT_APP_WAHA_API_KEY` caso mude a chave da API e reinicie o servidor. Se necessário, ajuste `REACT_APP_WAHA_BASE_URL` e `REACT_APP_WAHA_SESSION`.

## WAHA — contrato da API
- Endpoint: `POST http://localhost:3000/api/sendText`
- Body: `{ session, chatId, text }`
- Header: `X-Api-Key: <sua_api_key>`
- `chatId`: `{numero_normalizado}@c.us` (remove símbolos; se 11 dígitos sem `55`, prefixa `55`).

## Banco de usuários (Supabase)
- Tabela `usuarios` com RLS habilitado.
- Usuário master: `stenio` (senha `stenioadmin`).
- Apenas administradores criam usuários e apenas o master `stenio` pode criar usuários com `admin = true`.
- RPCs:
  - `verificar_login(p_username, p_password)` — autenticação.
  - `criar_usuario(p_solicitante_username, p_username, p_password, p_nome_completo, p_email, p_admin)` — criação (governa regra do master).
  - `trocar_senha(p_username, p_senha_atual, p_nova_senha)` — troca de senha.

## Principais recursos
- Envio imediato do primeiro contato + intervalo com contagem regressiva.
- Personalização da mensagem por contato (placeholders como nome/empresa).
- Tabela pendente simplificada (Nome, Telefone).
- Skips e contagem de números inválidos (<7 dígitos).
- Painel do usuário: troca de senha; criação de usuários; criação de admins bloqueada para não-master.

## Uso rápido
- Instale dependências: `npm install`.
- Configure `.env` (WAHA e Supabase).
- Inicie: `npm start` (se porta 3000 estiver ocupada, definir `PORT`).
- Faça login; para master use `stenio` / `stenioadmin` (apenas para primeiro acesso conforme script SQL).
- Suba planilha, confirme mapeamento, verifique contagem de números inválidos, clique “Confirmar e Enviar”.

## Solução de problemas
- Contagem em 00:00 ou sem envio: verifique WAHA em `http://localhost:3000/api/sendText`, sessão `default`, chave de API e rede.
- Sem promoção a admin: confirme que o usuário logado é `stenio` (master) e que o backend Supabase aplicou o script `database-users.sql`.
- Números fora do padrão: normalização automática remove símbolos; se quiser aplicar DDD, ajuste função de normalização.

## Estrutura
- `src/components/UploadCSV.js` — fluxo de envio, contagem regressiva, tabelas.
- `src/lib/waha.js` — chamada à WAHA (`/api/sendText`).
- `src/lib/supabase.js` — RPCs de usuários e dados.
- `src/components/UserPanel.js` — perfil, troca de senha, criação de usuários (master = `stenio`).

## Licença
Projeto proprietário.
