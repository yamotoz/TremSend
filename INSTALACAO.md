# 🚀 Guia de Instalação Rápida - METROBYTE

## ⚡ Instalação em 5 Passos

### 1. **Pré-requisitos**
- Node.js 16+ instalado
- Conta no Supabase criada
- Git instalado (opcional)

### 2. **Clone e Instale**
```bash
# Clone o projeto (ou baixe o ZIP)
git clone <url-do-repositorio>
cd TremSend

# Instale as dependências
npm install
```

### 3. **Configure o Supabase**
1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Vá em **Settings > API**
4. Copie a **URL** e **anon key**

### 4. **Configure as Variáveis**
```bash
# Copie o arquivo de exemplo
cp env.example .env

# Edite o arquivo .env com suas credenciais
REACT_APP_SUPABASE_URL=https://seu-projeto.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sua-chave-anonima
```

### 5. **Configure o Banco de Dados**
1. No Supabase, vá em **SQL Editor**
2. Copie e execute o conteúdo do arquivo `database-setup.sql`
3. Aguarde a confirmação de sucesso

### 6. **Execute o Projeto**
```bash
npm start
```

Acesse: `http://localhost:3000`

---

## 🔧 Configuração Detalhada

### **Estrutura do Banco de Dados**
O script SQL criará:
- ✅ Tabela `leads` (dados principais)
- ✅ Tabela `pesquisa` (dados de pesquisa)
- ✅ Tabela `operation_logs` (logs de auditoria)
- ✅ Índices para performance
- ✅ Políticas de segurança (RLS)
- ✅ Triggers automáticos
- ✅ Views úteis

### **Primeiro Login**
1. Acesse a aplicação
2. Use qualquer email válido para testar
3. A autenticação será configurada automaticamente

### **Teste das Funcionalidades**
1. **Inserção Manual**: Adicione alguns leads de teste
2. **Upload CSV**: Teste com um arquivo CSV pequeno
3. **Download**: Baixe os dados para verificar

---

## 🐛 Solução de Problemas

### **Erro: "Invalid API key"**
- Verifique se copiou corretamente a chave do Supabase
- Confirme se o projeto está ativo

### **Erro: "Table doesn't exist"**
- Execute o script `database-setup.sql` no Supabase
- Verifique se as tabelas foram criadas

### **Erro: "CORS"**
- Configure as políticas CORS no Supabase
- Adicione `http://localhost:3000` nas origens permitidas

### **Arquivo CSV não carrega**
- Verifique se o arquivo tem as colunas: nome, empresa, email, telefone
- Confirme se o arquivo tem menos de 10MB
- Teste com um arquivo CSV simples primeiro

---

## 📱 Testando a Responsividade

### **Desktop (1920x1080)**
- Cards em linha horizontal
- Modais centralizados
- Tabelas completas

### **Tablet (768px)**
- Cards em 2 colunas
- Modais adaptados
- Scroll horizontal nas tabelas

### **Mobile (375px)**
- Cards empilhados
- Modais em tela cheia
- Formulários otimizados

---

## 🎨 Personalização

### **Cores e Tema**
Edite `tailwind.config.js`:
```javascript
colors: {
  primary: '#0ea5e9', // Azul principal
  dark: {
    900: '#0f172a',   // Fundo escuro
    // ... outras cores
  }
}
```

### **Fontes**
As fontes estão configuradas no `public/index.html`:
- **Bebas Neue**: Títulos
- **Mulish**: Textos

### **Animações**
Configure em `src/index.css`:
```css
.animate-float {
  animation: float 6s ease-in-out infinite;
}
```

---

## 📊 Monitoramento

### **Logs do Supabase**
- Acesse **Logs** no painel do Supabase
- Monitore erros e performance
- Verifique queries lentas

### **Console do Navegador**
- Pressione F12
- Vá na aba **Console**
- Monitore erros JavaScript

### **Network Tab**
- Monitore requisições para o Supabase
- Verifique tempo de resposta
- Identifique problemas de API

---

## 🔒 Segurança

### **Configurações Recomendadas**
1. **RLS Ativado**: ✅ Já configurado
2. **Políticas Restritivas**: Ajuste conforme necessário
3. **Backup Regular**: Configure no Supabase
4. **Monitoramento**: Use os logs do Supabase

### **Variáveis Sensíveis**
- Nunca commite o arquivo `.env`
- Use variáveis de ambiente em produção
- Rotacione as chaves periodicamente

---

## 🚀 Deploy em Produção

### **Build de Produção**
```bash
npm run build
```

### **Servidor Web**
- Use Nginx ou Apache
- Configure HTTPS
- Configure CORS se necessário

### **Variáveis de Produção**
```bash
REACT_APP_SUPABASE_URL=https://seu-projeto.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sua-chave-producao
```

---

## 📞 Suporte

### **Documentação**
- README.md: Documentação completa
- database-setup.sql: Script do banco
- src/config/constants.js: Configurações

### **Logs Úteis**
- Console do navegador
- Logs do Supabase
- Network tab

### **Contato**
Para suporte técnico, entre em contato com a equipe de desenvolvimento.

---

**TremSend v1.0.0** - Interface de envio de mensagens automatizadas
