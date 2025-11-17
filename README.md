# TremSend — Automação de Mensagens para WhatsApp

![TremSend](public/vid_img/readme.png)

TremSend é uma interface focada em envio automatizado de mensagens para leads via WhatsApp, com personalização por contato, controle de intervalo (fixo ou aleatório), análise de dados e recursos de armazenamento de modelos, arquivos e conjuntos de mensagens.

## Objetivo principal
- Facilitar o envio automático de mensagens para leads no WhatsApp, filtrando e reconstruindo números, validando o dígito 9, adicionando o prefixo `55` quando necessário, e gerando PDF com a análise final.
- Permitir criação e uso de “conjuntos de mensagens” (mensagens 1, 2 e 3), envio de link de arquivo/imagem, salvamento de dados (modelos e arquivos em base64) e estatísticas/ETA durante o envio.

## Tecnologias utilizadas

### Front-end
- `react` e `react-dom` (SPA e estado)
- `react-router-dom` (rotas)
- `react-scripts` (build dev/prod)
- `lucide-react` (ícones)
- `react-hot-toast` (feedbacks)

### Estilo e design
- `tailwindcss` (utilitários e responsividade)
- `postcss` e `autoprefixer` (pipeline CSS)

### Processamento de dados
- `papaparse` (CSV)
- `xlsx` (XLSX/XLS)

### Visualização e relatórios
- `chart.js` (gráficos no Dashboard)
- `jspdf` (PDF de análise final)

### Integrações e backend
- `@supabase/supabase-js` (persistência, RLS, RPCs)
- `axios` (requisições HTTP)
- WAHA — WhatsApp HTTP API (envio efetivo de mensagem; `POST /api/sendText`)

### Ferramentas de projeto
- Scripts `npm` (`start`, `build`, `test`, `deploy` via Surge)

## Principais recursos
- Upload de planilha e mapeamento simplificado (campos padrão: `nome` e `telefone`; até 3 campos personalizados opcionais)
- Normalização de números: remove símbolos, valida dígitos; adiciona `55` para números brasileiros quando aplicável; opção de auto-DDD
- Validações pré-envio: conta números curtos (<7 dígitos), detecta duplicados, apresenta estatísticas na confirmação
- Envio imediato do primeiro contato, com intervalo fixo ou aleatório entre mensagens
- Contagem regressiva visível, pausa/retomada/parada de envio; ETA e horário estimado de conclusão
- Personalização de mensagens com variáveis dinâmicas; lista de variáveis exibe inicialmente apenas `nome` e `telefone` e se expande conforme o usuário adiciona campos personalizados
- Modelos de mensagem (salvar/usar/excluir) e conjuntos de mensagens (1–3) salvos e reaplicáveis
- Envio de arquivo por link (imagem/vídeo) e suporte a salvar arquivos em base64
- Exportação de CSV de pendentes e enviadas; geração de PDF analítico com `jspdf`

## Fluxo de envio
1. Upload da planilha (CSV/XLSX) e mapeamento das colunas.
2. Confirmação com estatísticas: total, números curtos e duplicados; escolha do intervalo (fixo ou aleatório), exibição da estimativa de duração e horário de término.
3. Worker inicia, envia o primeiro contato, atualiza contagem regressiva, e processa a fila até o fim (com pausa/retomada disponíveis).
4. Mensagens personalizadas usam placeholders do mapeamento; conjuntos salvos podem preencher as três mensagens.
5. Resultado acompanha enviados/erros; ao final, possível exportar CSVs e gerar PDF.

## Banco de dados (Supabase)
- Tabelas principais:
  - `mensagens_modelos` — modelos individuais de texto (públicos ou por usuário)
  - `mensagens_arquivos` — arquivos em base64 (públicos ou por usuário)
  - `mensagens_conjuntos` — conjuntos com até três mensagens
- Todas com Row Level Security (RLS) e policies para `anon` e `authenticated` (público: `owner_id IS NULL`; próprio: `owner_id = auth.uid()`).
- Scripts de criação em `database-mensagens.sql`.
- Tabelas de uploads/itens (em `database-planilhas.sql`) suportam o registro de importações e itens para envio.

## Integração WAHA (WhatsApp HTTP API)
- Endpoint: `POST {REACT_APP_WAHA_BASE_URL}/api/sendText`
- Body: `{ session, chatId, text }`
- Header: `X-Api-Key: <sua_api_key>`
- `chatId`: `{numero_normalizado}@c.us` (remove símbolos; valida dígitos; se necessário, prefixa `55`).

## Configuração (.env)
- `REACT_APP_WAHA_BASE_URL` — URL pública/local da WAHA
- `REACT_APP_WAHA_API_KEY` — chave da API
- `REACT_APP_WAHA_SESSION` — sessão (ex.: `default`)
- `REACT_APP_SUPABASE_URL` — URL do projeto Supabase
- `REACT_APP_SUPABASE_ANON_KEY` — chave `anon` do Supabase

## Estrutura do projeto
- `src/components/UploadCSV.js` — fluxo de envio, mapeamento, pré-visualização, intervalos, ETA, conjuntos/modelos
- `src/components/Dashboard.js` — indicadores e gráficos com `chart.js`
- `src/components/Login.js` e `src/components/UserPanel.js` — autenticação e gerenciamento de usuários
- `src/lib/waha.js` — integração com WAHA (envio)
- `src/lib/supabase.js` — persistência (modelos, arquivos, conjuntos; uploads e itens)
- `src/lib/utils.js` — parsing de CSV/XLSX, normalização e utilitários
- `src/config/constants.js` — constantes do app

## Design e responsividade
- Construído com `tailwindcss` (classes utilitárias), paleta escura e componentes responsivos.
- Layouts em grid/flex; painéis colapsáveis; modais e listas com rolagem.
- UI otimizada para desktop e uso funcional em telas menores (inputs grandes, botões acessíveis, hierarquia visual clara).

## Scripts
- `npm start` — ambiente de desenvolvimento
- `npm build` — build de produção
- `npm deploy` — deploy via Surge (usado em ambientes de demonstração)
- `npm test` — testes (quando aplicáveis)
- `npm run worker` — inicia o worker em segundo plano (envio contínuo)

### Worker (envio em segundo plano)
- Objetivo: continuar o envio mesmo se o navegador/aba fechar ou a máquina reiniciar o front-end.
- O worker lê a fila do banco (`v_upload_pendentes`) e marca o status via RPCs (`marcar_item_enviado`, `marcar_item_erro`).
- Requisitos: `.env` configurado (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_WAHA_BASE_URL`, `REACT_APP_WAHA_API_KEY`, `REACT_APP_WAHA_SESSION`).
- Uso:
  - `node scripts/worker.js --upload <uuid>` — intervalo padrão 60s
  - `node scripts/worker.js --upload <uuid> --interval 30` — intervalo fixo
  - `node scripts/worker.js --upload <uuid> --rand 10,50` — intervalo aleatório entre 10s e 50s
- Observação: não é necessário criar duas tabelas (“pendentes” e “enviados”), pois a tabela `upload_items` já mantém o status e há views `v_upload_pendentes` e `v_upload_enviados`. Isso simplifica a retomada pós-falha.

## Uso rápido
- Instale dependências: `npm install`
- Configure `.env` (WAHA e Supabase)
- Inicie: `npm start`
- Faça login e siga o fluxo de upload → confirmação → envio
 - Para rodar em background: obtenha o `upload_id` criado na confirmação e execute o worker com os parâmetros acima.


