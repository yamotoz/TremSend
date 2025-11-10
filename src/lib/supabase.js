import { createClient } from '@supabase/supabase-js';
import { getAppConfig } from './appConfig';

// Configurações do Supabase com overrides em runtime
const initial = getAppConfig();
let supabaseUrl = initial.supabaseUrl;
let supabaseAnonKey = initial.supabaseAnonKey;

// Debug: verificar se as variáveis estão sendo carregadas
console.log('=== DEBUG SUPABASE ===');
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseAnonKey ? 'Carregada' : 'Não carregada');
console.log('URL parece válida:', supabaseUrl.startsWith('http'));
console.log('Key tamanho:', supabaseAnonKey.length);
console.log('========================');

export let supabase = createClient(supabaseUrl, supabaseAnonKey);

export function reloadSupabaseClient() {
  const cfg = getAppConfig();
  supabaseUrl = cfg.supabaseUrl;
  supabaseAnonKey = cfg.supabaseAnonKey;
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('Supabase client recarregado com novas credenciais.');
}

// Funções auxiliares para o banco de dados
export const database = {
  // Autenticação de usuários
  async authenticateUser(username, password) {
    try {
      console.log('=== TENTANDO AUTENTICAR USUÁRIO ===');
      console.log('Username:', username);
      console.log('Password:', password);
      
      const { data, error } = await supabase
        .rpc('verificar_login', {
          p_username: username,
          p_password: password
        });

      console.log('Resultado da autenticação:', { data, error });

      if (error) throw error;
      
      if (data && data.length > 0) {
        return { 
          success: true, 
          user: data[0],
          message: 'Login realizado com sucesso!'
        };
      } else {
        return { 
          success: false, 
          message: 'Credenciais inválidas'
        };
      }
    } catch (error) {
      console.error('Erro ao autenticar usuário:', error);
      return { 
        success: false, 
        message: 'Erro de conexão com o servidor'
      };
    }
  },

  // ====== Arquivos de mensagem (Base64) ======
  async saveMessageFile({ filename, mimetype = null, size = null, dataBase64 }) {
    try {
      if (!filename || !dataBase64) {
        return { success: false, error: 'Arquivo inválido: nome e base64 são obrigatórios.' };
      }
      let ownerId = null;
      try {
        const { data: userData } = await supabase.auth.getUser();
        ownerId = userData?.user?.id || null;
      } catch (_) {}
      const payload = {
        owner_id: ownerId,
        filename,
        mimetype: mimetype || null,
        size: size || null,
        data_base64: dataBase64,
        created_at: new Date().toISOString()
      };
      const { data, error } = await supabase
        .from('mensagens_arquivos')
        .insert([payload])
        .select();
      if (error) throw error;
      return { success: true, data: data?.[0] };
    } catch (error) {
      const msg = String(error?.message || error);
      if (msg.includes('schema cache') || msg.includes('not exist') || msg.includes('does not exist')) {
        return { success: false, error: "Tabela 'public.mensagens_arquivos' não encontrada. Execute o script SQL para criar." };
      }
      if (msg.toLowerCase().includes('row level security') || msg.toLowerCase().includes('rls')) {
        return { success: false, error: 'RLS bloqueou o insert. Faça login ou ajuste a policy para permitir anon INSERT.' };
      }
      return { success: false, error: msg };
    }
  },

  async getMessageFiles(limit = 50) {
    try {
      const { data, error } = await supabase
        .from('mensagens_arquivos')
        .select('id, filename, mimetype, size, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      const msg = String(error?.message || error);
      if (msg.includes('schema cache') || msg.includes('not exist') || msg.includes('does not exist')) {
        return { success: false, error: "Tabela 'public.mensagens_arquivos' não encontrada. Execute o script SQL para criar." };
      }
      if (msg.toLowerCase().includes('row level security') || msg.toLowerCase().includes('rls')) {
        return { success: false, error: 'RLS bloqueou o select. Faça login ou ajuste a policy para permitir anon SELECT.' };
      }
      return { success: false, error: msg };
    }
  },

  async getMessageFileById(id) {
    try {
      const { data, error } = await supabase
        .from('mensagens_arquivos')
        .select('id, filename, mimetype, size, data_base64')
        .eq('id', id)
        .limit(1);
      if (error) throw error;
      return { success: true, data: data?.[0] || null };
    } catch (error) {
      const msg = String(error?.message || error);
      return { success: false, error: msg };
    }
  },

  async deleteMessageFile(id) {
    try {
      const { error } = await supabase
        .from('mensagens_arquivos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      const msg = String(error?.message || error);
      return { success: false, error: msg };
    }
  },

  // Salvar template de mensagem
  async saveMessageTemplate({ content, title = null }) {
    try {
      if (!content || !content.trim()) {
        return { success: false, error: 'Conteúdo da mensagem vazio' };
      }

      // Obter usuário autenticado para vincular ao owner_id, se disponível
      let ownerId = null;
      try {
        const { data: userData } = await supabase.auth.getUser();
        ownerId = userData?.user?.id || null;
      } catch (_) {}

      const payload = {
        owner_id: ownerId,
        titulo: title || null,
        conteudo: content,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('mensagens_modelos')
        .insert([payload])
        .select();

      if (error) throw error;
      return { success: true, data: data?.[0] };
    } catch (error) {
      console.error('Erro ao salvar template de mensagem:', error);
      const msg = String(error?.message || error);
      // Mensagem orientativa quando a tabela não existe no projeto
      if (msg.includes("schema cache") || msg.includes("not exist") || msg.includes("does not exist")) {
        return {
          success: false,
          error: "Tabela 'public.mensagens_modelos' não encontrada. Abra o Supabase, execute o arquivo 'database-mensagens.sql' no SQL Editor e tente novamente."
        };
      }
      return { success: false, error: msg };
    }
  },

  // Listar templates de mensagens salvos
  async getMessageTemplates(limit = 50) {
    try {
      const { data, error } = await supabase
        .from('mensagens_modelos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      const msg = String(error?.message || error);
      if (msg.includes('schema cache') || msg.includes('not exist') || msg.includes('does not exist')) {
        return {
          success: false,
          error: "Tabela 'public.mensagens_modelos' não encontrada. Execute 'database-mensagens.sql' no Supabase para criar a tabela."
        };
      }
      // Possível erro de RLS: usuário não autenticado sem permissão
      if (msg.toLowerCase().includes('row level security') || msg.toLowerCase().includes('rls')) {
        return {
          success: false,
          error: 'A política de RLS do Supabase bloqueou a consulta. Faça login ou ajuste a policy para permitir anon SELECT.'
        };
      }
      return { success: false, error: msg };
    }
  },

  // Excluir template de mensagem
  async deleteMessageTemplate(id) {
    try {
      if (!id) {
        return { success: false, error: 'ID inválido para exclusão' };
      }
      // Não usar .select() para evitar exigir permission de SELECT durante DELETE (RLS)
      const { error } = await supabase
        .from('mensagens_modelos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      const msg = String(error?.message || error);
      if (msg.includes('schema cache') || msg.includes('not exist') || msg.includes('does not exist')) {
        return {
          success: false,
          error: "Tabela 'public.mensagens_modelos' não encontrada. Execute 'database-mensagens.sql' no Supabase para criar a tabela."
        };
      }
      if (msg.toLowerCase().includes('row level security') || msg.toLowerCase().includes('rls')) {
        return {
          success: false,
          error: 'A política de RLS do Supabase bloqueou a exclusão. Faça login ou ajuste a policy para permitir anon DELETE.'
        };
      }
      return { success: false, error: msg };
    }
  },

  // ====== Planilhas (Uploads) ======
  // Criar upload e retornar id
  async createUpload({ ownerId = null, filename, mimeType, fileSize, storagePath = null, source = 'csv', columns = {} }) {
    try {
      // Tentar obter usuário autenticado do Supabase Auth
      let ownerIdFinal = ownerId;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const supaUserId = userData?.user?.id || null;
        if (!ownerIdFinal && supaUserId) ownerIdFinal = supaUserId;
      } catch (_) {}

      const { data, error } = await supabase.rpc('criar_upload', {
        p_owner_id: ownerIdFinal,
        p_filename: filename,
        p_mime_type: mimeType || null,
        p_file_size: fileSize || null,
        p_storage_path: storagePath || null,
        p_source: source,
        p_columns: columns ? JSON.stringify(columns) : JSON.stringify({})
      });
      if (error) throw error;
      return { success: true, uploadId: data };
    } catch (error) {
      console.error('Erro ao criar upload:', error);
      return { success: false, error: error.message };
    }
  },

  // Inserir itens em lote para um upload
  async insertUploadItems(uploadId, items) {
    try {
      const payload = JSON.stringify(items || []);
      const { data, error } = await supabase.rpc('inserir_itens_upload', {
        p_upload_id: uploadId,
        p_items: payload
      });
      if (error) throw error;
      return { success: true, inserted: data };
    } catch (error) {
      console.error('Erro ao inserir itens do upload:', error);
      return { success: false, error: error.message };
    }
  },

  // Buscar pendentes por upload via view
  async getPendingItems(uploadId, limit = 1000) {
    try {
      let query = supabase
        .from('v_upload_pendentes')
        .select('*')
        .eq('upload_id', uploadId)
        .order('id', { ascending: true })
        .limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Erro ao buscar pendentes:', error);
      return { success: false, error: error.message };
    }
  },

  // Buscar enviados por upload via view
  async getSentItems(uploadId, limit = 1000) {
    try {
      let query = supabase
        .from('v_upload_enviados')
        .select('*')
        .eq('upload_id', uploadId)
        .order('id', { ascending: true })
        .limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Erro ao buscar enviados:', error);
      return { success: false, error: error.message };
    }
  },

  // Marcar item como enviado
  async markItemSent({ itemId, messageRendered, attempts = 1 }) {
    try {
      const { error } = await supabase.rpc('marcar_item_enviado', {
        p_item_id: itemId,
        p_message_rendered: messageRendered || null,
        p_attempts: attempts
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Erro ao marcar item como enviado:', error);
      return { success: false, error: error.message };
    }
  },

  // Marcar item com erro
  async markItemError({ itemId, errorMessage, attempts = 1 }) {
    try {
      const { error } = await supabase.rpc('marcar_item_erro', {
        p_item_id: itemId,
        p_error_message: errorMessage || null,
        p_attempts: attempts
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Erro ao marcar item com erro:', error);
      return { success: false, error: error.message };
    }
  },

  // Marcar item como pulado
  async markItemSkipped({ itemId, reason }) {
    try {
      const { error } = await supabase.rpc('marcar_item_pulado', {
        p_item_id: itemId,
        p_reason: reason || null
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Erro ao marcar item como pulado:', error);
      return { success: false, error: error.message };
    }
  },

  // Criar usuário (apenas admins; apenas 'stenio' cria admins)
  async createUser({ requesterUsername, username, password, fullName, email, isAdmin = false }) {
    try {
      const { data, error } = await supabase.rpc('criar_usuario', {
        p_solicitante_username: requesterUsername,
        p_username: username,
        p_password: password,
        p_nome_completo: fullName || null,
        p_email: email || null,
        p_admin: !!isAdmin
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      return { success: false, error: error.message };
    }
  },

  // Trocar senha do próprio usuário
  async changePassword({ username, currentPassword, newPassword }) {
    try {
      const { data, error } = await supabase.rpc('trocar_senha', {
        p_username: username,
        p_senha_atual: currentPassword,
        p_nova_senha: newPassword
      });

      if (error) throw error;
      const ok = data === true || data === 'true';
      return { success: ok };
    } catch (error) {
      console.error('Erro ao trocar senha:', error);
      return { success: false, error: error.message };
    }
  },

  // Inserir dados manualmente
  async insertManualData(data) {
    try {
      console.log('=== TENTANDO INSERIR DADOS ===');
      console.log('Dados recebidos:', data);
      console.log('Supabase client:', supabase);
      
      const { data: result, error } = await supabase
        .from('origin_dados_lead')
        .insert([{
          nome: data.nome,
          empresa: data.empresa,
          email: data.email,
          telefone: data.telefone,
          origem: 'Manual',
          created_at: new Date().toISOString()
        }])
        .select();

      console.log('Resultado da inserção:', { result, error });

      if (error) throw error;
      return { success: true, data: result };
    } catch (error) {
      console.error('Erro ao inserir dados:', error);
      return { success: false, error: error.message };
    }
  },

  // Buscar todos os leads
  async getAllLeads() {
    try {
      console.log('=== DEBUG getAllLeads ===');
      console.log('Tentando buscar dados da tabela origin_dados_lead...');
      
      const { data, error } = await supabase
        .from('origin_dados_lead')
        .select('*')
        .order('id', { ascending: false });

      console.log('Resultado da query:', { data, error });
      console.log('Quantidade de registros:', data?.length || 0);
      console.log('========================');

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
      return { success: false, error: error.message };
    }
  },

  // Buscar leads de pesquisa
  async getResearchData() {
    try {
      console.log('=== DEBUG getResearchData ===');
      console.log('Tentando buscar dados da tabela dados_pesquisa...');
      
      const { data, error } = await supabase
        .from('dados_pesquisa')
        .select('*')
        .order('id', { ascending: false });

      console.log('Resultado da query pesquisa:', { data, error });
      console.log('Quantidade de registros:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('Primeiro registro:', data[0]);
        console.log('Pontuação do primeiro:', data[0].pontuacao);
        console.log('Tipo da pontuação:', typeof data[0].pontuacao);
        console.log('Todos os registros com pontuação:');
        data.forEach((item, index) => {
          console.log(`Registro ${index + 1}: ${item.nome} - Pontuação: ${item.pontuacao} (${typeof item.pontuacao}) - Valor: ${JSON.stringify(item.pontuacao)}`);
        });
      }
      console.log('========================');

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Erro ao buscar dados de pesquisa:', error);
      return { success: false, error: error.message };
    }
  },

  // Inserir dados de CSV
  async insertCsvData(data, origem = 'CSV Upload') {
    try {
      // Verificar duplicatas antes de inserir (apenas para valores não vazios)
      const emailsToCheck = data.filter(item => item.email && item.email !== 'EMPTY').map(item => item.email);
      const telefonesToCheck = data.filter(item => item.telefone && item.telefone !== 'EMPTY').map(item => item.telefone);
      
      let existingData = [];
      if (emailsToCheck.length > 0 || telefonesToCheck.length > 0) {
        const { data: checkData, error: checkError } = await supabase
          .from('origin_dados_lead')
          .select('email, telefone');
        
        if (checkError) throw checkError;
        existingData = checkData || [];
      }

      // Filtrar dados duplicados (apenas para valores não vazios)
      const filteredData = data.filter(item => {
        if ((!item.email || item.email === 'EMPTY') && (!item.telefone || item.telefone === 'EMPTY')) return true; // Se ambos são vazios, não há duplicata
        return !existingData.some(dup => 
          (item.email && item.email !== 'EMPTY' && dup.email === item.email) || 
          (item.telefone && item.telefone !== 'EMPTY' && dup.telefone === item.telefone)
        );
      });

      if (filteredData.length === 0) {
        return { 
          success: false, 
          error: 'Todos os dados já existem no sistema',
          duplicates: data.length
        };
      }

      const dataToInsert = filteredData.map(item => ({
        ...item,
        origem,
        created_at: new Date().toISOString()
      }));

      const { data: result, error } = await supabase
        .from('origin_dados_lead')
        .insert(dataToInsert)
        .select();

      if (error) throw error;

      return { 
        success: true, 
        data: result,
        duplicates: data.length - filteredData.length,
        inserted: filteredData.length
      };
    } catch (error) {
      console.error('Erro ao inserir dados CSV:', error);
      return { success: false, error: error.message };
    }
  },

  // Verificar se email ou telefone já existe
  async checkDuplicate(email, telefone) {
    try {
      // Só verificar duplicatas se pelo menos um dos campos não for vazio
      if ((!email || email === 'EMPTY') && (!telefone || telefone === 'EMPTY')) {
        return { exists: false, data: null };
      }

      let query = supabase
        .from('origin_dados_lead')
        .select('id, nome, email, telefone');

      if (email && email !== 'EMPTY' && telefone && telefone !== 'EMPTY') {
        query = query.or(`email.eq.${email},telefone.eq.${telefone}`);
      } else if (email && email !== 'EMPTY') {
        query = query.eq('email', email);
      } else if (telefone && telefone !== 'EMPTY') {
        query = query.eq('telefone', telefone);
      }

      const { data, error } = await query.limit(1);

      if (error) throw error;
      return { exists: data && data.length > 0, data: data?.[0] };
    } catch (error) {
      console.error('Erro ao verificar duplicata:', error);
      return { exists: false, error: error.message };
    }
  }
};
