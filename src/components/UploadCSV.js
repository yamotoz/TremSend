import React, { useState, useRef, useMemo, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Eye, EyeOff, AlertTriangle, Send, Trash2 } from 'lucide-react';
import { processCSVFile, processXLSXFile } from '../lib/utils';
// Removido uso de Supabase/UUID neste fluxo
import { processStore } from '../lib/processStore';
import { wahaApi } from '../lib/waha';
import { Sender } from '../lib/sender';
import toast from 'react-hot-toast';

// Stub local para modo sem banco de dados
// Garante que chamadas antigas a "database.*" não quebrem o build.
// Todas as operações retornam sucesso e dados vazios, mantendo a UI funcional.
const database = {
  // Mensagens (templates)
  saveMessageTemplate: async ({ content }) => ({ success: true }),
  deleteMessageTemplate: async (id) => ({ success: true }),
  getMessageTemplates: async (limit = 50) => ({ success: true, data: [] }),

  // Arquivos salvos (base64)
  getMessageFiles: async (limit = 50) => ({ success: true, data: [] }),
  saveMessageFile: async ({ filename, mimetype, size, dataBase64 }) => ({ success: true }),
  deleteMessageFile: async (id) => ({ success: true }),

  // Conjuntos de mensagens
  getMessageSets: async (limit = 100) => {
    try {
      const raw = window.localStorage.getItem('ts_message_sets') || '[]';
      let arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
      // ordenar por created_at desc
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { success: true, data: arr.slice(0, limit) };
    } catch (e) {
      return { success: false, error: String(e?.message || e) };
    }
  },
  saveMessageSet: async ({ title, messages }) => {
    try {
      const raw = window.localStorage.getItem('ts_message_sets') || '[]';
      let arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
      const id = Date.now();
      const created_at = new Date().toISOString();
      const item = { id, titulo: title || `Conjunto ${created_at}`, conteudos: Array.isArray(messages) ? messages : [], created_at };
      arr.push(item);
      window.localStorage.setItem('ts_message_sets', JSON.stringify(arr));
      return { success: true, data: item };
    } catch (e) {
      return { success: false, error: String(e?.message || e) };
    }
  },
  deleteMessageSet: async (id) => {
    try {
      const raw = window.localStorage.getItem('ts_message_sets') || '[]';
      let arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
      arr = arr.filter((x) => String(x.id) !== String(id));
      window.localStorage.setItem('ts_message_sets', JSON.stringify(arr));
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e?.message || e) };
    }
  },

  // Itens do envio
  markItemSkipped: async ({ itemId, reason }) => ({ success: true }),
  markItemSent: async ({ itemId, messageRendered, attempts }) => ({ success: true }),
  markItemError: async ({ itemId, errorMessage, attempts }) => ({ success: true }),
};

const UploadCSV = ({ onClose }) => {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [columnMap, setColumnMap] = useState({ nome: '', empresa: '', email: '', telefone: '' });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [validateWithNine, setValidateWithNine] = useState(false);
  const [errors, setErrors] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [addBrazilPrefix, setAddBrazilPrefix] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('');
  // Mensagens iniciais adicionais (opcionais)
  const [sendText2Enabled, setSendText2Enabled] = useState(false);
  const [sendText3Enabled, setSendText3Enabled] = useState(false);
  const [messageTemplate2, setMessageTemplate2] = useState('');
  const [messageTemplate3, setMessageTemplate3] = useState('');
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState(null);
  const [messagePreview, setMessagePreview] = useState('');
  const [messagePreview2, setMessagePreview2] = useState('');
  const [messagePreview3, setMessagePreview3] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Arquivos salvos para envio por base64
  const [savedFiles, setSavedFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState(null);
  const [savingFile, setSavingFile] = useState(false);
  const [fileToSave, setFileToSave] = useState(null);
  const [selectedSavedFileId, setSelectedSavedFileId] = useState(null);
  // Envio em lote: intervalo e telas de envio
  const [sendIntervalSeconds, setSendIntervalSeconds] = useState(60); // default 1m
  // Intervalo aleatório (min/max em segundos)
  const [useRandomInterval, setUseRandomInterval] = useState(false);
  const [randomIntervalRange, setRandomIntervalRange] = useState({ min: 10, max: 50 });
  // Auto-DDD para números sem DDD
  const [autoFillDDD, setAutoFillDDD] = useState(false);
  const [selectedDDD, setSelectedDDD] = useState('');
  const [showSendingScreen, setShowSendingScreen] = useState(false);
  const [pendingList, setPendingList] = useState([]);
  const [sentList, setSentList] = useState([]);
  const [sendingPaused, setSendingPaused] = useState(false);
  const [sendingStartAt, setSendingStartAt] = useState(null);
  const [sendingEndAt, setSendingEndAt] = useState(null);
  const [sendingCompleted, setSendingCompleted] = useState(false);
  const sendWorkerRef = useRef(null);
  const sendAbortRef = useRef(false);
  const [nextCountdown, setNextCountdown] = useState(0);
  const [currentIntervalSec, setCurrentIntervalSec] = useState(0);
  const pendingListRef = useRef([]);
  const sentNumbersSetRef = useRef(new Set());
  const maxRetries = 3;
  // Fluxo sem banco: não usamos UUID
  const dbSyncTimerRef = useRef(null);
  const sendBothNineVariantsRef = useRef(false);
  const donutCanvasRef = useRef(null);
  const [customMappings, setCustomMappings] = useState([{ name: '', source: '' }, { name: '', source: '' }, { name: '', source: '' }]);
  // Conjuntos de mensagens (1–3) salvos
  const [savedMessageSets, setSavedMessageSets] = useState([]);
  const [loadingMessageSets, setLoadingMessageSets] = useState(false);
  const [messageSetsError, setMessageSetsError] = useState('');
  const [savingMessageSet, setSavingMessageSet] = useState(false);

  // Envio flexível: estados e refs
  const [sendTextEnabled, setSendTextEnabled] = useState(true);
  const [sendFileEnabled, setSendFileEnabled] = useState(false);
  const [fileMode, setFileMode] = useState('link'); // forçar somente 'link'
  const [fileUrlForSend, setFileUrlForSend] = useState('');
  // Novo: envio de imagem por link (preview em alta qualidade)
  const [sendImageEnabled, setSendImageEnabled] = useState(false);
  const [imageUrlForSend, setImageUrlForSend] = useState('');
  const MAX_MEDIA_SIZE = 25 * 1024 * 1024; // 25MB

  // Envio de imagem via link com preview (sem upload de mídia)

  const readFileAsBase64 = (f) => new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result;
        const base64 = String(res).includes(',') ? String(res).split(',')[1] : String(res);
        resolve(base64);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(f);
    } catch (e) {
      reject(e);
    }
  });

  const inferMimeFromFilename = (name) => {
    const n = String(name || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.gif')) return 'image/gif';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.mp4')) return 'video/mp4';
    if (n.endsWith('.doc')) return 'application/msword';
    if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (n.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (n.endsWith('.csv')) return 'text/csv';
    return '';
  };

  // Converte imagem para JPEG base64 no cliente (se necessário)
  // (sem conversão/parse de imagem)

  // Lista de DDDs (rótulos conforme solicitado)
  const DDD_LIST = [
    { label: 'Alagoas (AL): 82', value: '82' },
    { label: 'Bahia (BA): 71', value: '71' },
    { label: 'Bahia (BA): 73', value: '73' },
    { label: 'Bahia (BA): 74', value: '74' },
    { label: 'Bahia (BA): 75', value: '75' },
    { label: 'Bahia (BA): 77', value: '77' },
    { label: 'Ceará (CE): 85', value: '85' },
    { label: 'Ceará (CE): 88', value: '88' },
    { label: 'Maranhão (MA): 98', value: '98' },
    { label: 'Maranhão (MA): 99', value: '99' },
    { label: 'Paraíba (PB): 83', value: '83' },
    { label: 'Pernambuco (PE): 81', value: '81' },
    { label: 'Pernambuco (PE): 87', value: '87' },
    { label: 'Piauí (PI): 86', value: '86' },
    { label: 'Piauí (PI): 89', value: '89' },
    { label: 'Rio Grande do Norte (RN): 84', value: '84' },
    { label: 'Sergipe (SE): 79', value: '79' }
  ];

  // Função para gerar prévia da mensagem (suporta {nome da coluna})
  const generateMessagePreview = useMemo(() => {
    if (!messageTemplate || !previewData || previewData.length === 0) return '';

    const firstRow = previewData[0];
    const lowerRow = {};
    Object.keys(firstRow).forEach(k => { lowerRow[k.toLowerCase()] = firstRow[k]; });
    // também mapear chaves normalizadas
    if (columnMap.nome) lowerRow['nome'] = firstRow[columnMap.nome] || '';
    if (columnMap.empresa) lowerRow['empresa'] = firstRow[columnMap.empresa] || '';
    if (columnMap.email) lowerRow['email'] = firstRow[columnMap.email] || '';
    if (columnMap.telefone) lowerRow['telefone'] = String(firstRow[columnMap.telefone] || '').replace(/\D/g, '');
    // incluir colunas personalizadas
    (customMappings || []).forEach(mp => {
      const key = String(mp.name || '').trim().toLowerCase();
      const src = String(mp.source || '').trim();
      if (key && src && firstRow.hasOwnProperty(src)) {
        lowerRow[key] = firstRow[src];
      }
    });

    return messageTemplate.replace(/\{([^}]+)\}/g, (m, p1) => {
      const key = String(p1 || '').trim().toLowerCase();
      const val = lowerRow[key];
      return val !== undefined && val !== null ? String(val) : '';
    });
  }, [messageTemplate, previewData, columnMap, customMappings]);

  // Prévia da mensagem adicional 2
  const generateMessagePreview2 = useMemo(() => {
    if (!messageTemplate2 || !previewData || previewData.length === 0) return '';
    const firstRow = previewData[0];
    const lowerRow = {};
    Object.keys(firstRow).forEach(k => { lowerRow[k.toLowerCase()] = firstRow[k]; });
    if (columnMap.nome) lowerRow['nome'] = firstRow[columnMap.nome] || '';
    if (columnMap.empresa) lowerRow['empresa'] = firstRow[columnMap.empresa] || '';
    if (columnMap.email) lowerRow['email'] = firstRow[columnMap.email] || '';
    if (columnMap.telefone) lowerRow['telefone'] = String(firstRow[columnMap.telefone] || '').replace(/\D/g, '');
    (customMappings || []).forEach(mp => {
      const key = String(mp.name || '').trim().toLowerCase();
      const src = String(mp.source || '').trim();
      if (key && src && firstRow.hasOwnProperty(src)) {
        lowerRow[key] = firstRow[src];
      }
    });
    return messageTemplate2.replace(/\{([^}]+)\}/g, (m, p1) => {
      const key = String(p1 || '').trim().toLowerCase();
      const val = lowerRow[key];
      return val !== undefined && val !== null ? String(val) : '';
    });
  }, [messageTemplate2, previewData, columnMap, customMappings]);

  // Prévia da mensagem adicional 3
  const generateMessagePreview3 = useMemo(() => {
    if (!messageTemplate3 || !previewData || previewData.length === 0) return '';
    const firstRow = previewData[0];
    const lowerRow = {};
    Object.keys(firstRow).forEach(k => { lowerRow[k.toLowerCase()] = firstRow[k]; });
    if (columnMap.nome) lowerRow['nome'] = firstRow[columnMap.nome] || '';
    if (columnMap.empresa) lowerRow['empresa'] = firstRow[columnMap.empresa] || '';
    if (columnMap.email) lowerRow['email'] = firstRow[columnMap.email] || '';
    if (columnMap.telefone) lowerRow['telefone'] = String(firstRow[columnMap.telefone] || '').replace(/\D/g, '');
    (customMappings || []).forEach(mp => {
      const key = String(mp.name || '').trim().toLowerCase();
      const src = String(mp.source || '').trim();
      if (key && src && firstRow.hasOwnProperty(src)) {
        lowerRow[key] = firstRow[src];
      }
    });
    return messageTemplate3.replace(/\{([^}]+)\}/g, (m, p1) => {
      const key = String(p1 || '').trim().toLowerCase();
      const val = lowerRow[key];
      return val !== undefined && val !== null ? String(val) : '';
    });
  }, [messageTemplate3, previewData, columnMap, customMappings]);

  // Fechar modal de confirmação com tecla ESC
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        setShowConfirmation(false);
      }
    };
    if (showConfirmation) {
      document.addEventListener('keydown', onEsc);
    }
    return () => {
      document.removeEventListener('keydown', onEsc);
    };
  }, [showConfirmation]);

  // Atualiza a prévia quando o template muda
  useEffect(() => {
    setMessagePreview(generateMessagePreview);
  }, [generateMessagePreview]);

  useEffect(() => {
    setMessagePreview2(generateMessagePreview2);
  }, [generateMessagePreview2]);

  useEffect(() => {
    setMessagePreview3(generateMessagePreview3);
  }, [generateMessagePreview3]);

  // Salvar mensagem (template) no banco de dados
  const handleSaveMessage = async () => {
    const content = (messageTemplate || '').trim();
    if (!content) {
      toast.error('Digite uma mensagem para salvar.');
      return;
    }
    try {
      setSavingTemplate(true);
      const { success, error } = await database.saveMessageTemplate({ content });
      if (!success) {
        toast.error(error || 'Falha ao salvar a mensagem.');
      } else {
        toast.success('Mensagem salva com sucesso!');
        // Recarregar lista de templates
        await loadSavedTemplates();
      }
    } catch (err) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSavingTemplate(false);
    }
  };

  // Excluir template salvo
  const handleDeleteTemplate = async (id) => {
    if (!id) return;
    const ok = window.confirm('Apagar esta mensagem salva?');
    if (!ok) return;
    try {
      const { success, error } = await database.deleteMessageTemplate(id);
      if (!success) {
        toast.error(error || 'Não foi possível apagar a mensagem.');
        setTemplatesError(error || 'Falha ao excluir.');
      } else {
        toast.success('Mensagem apagada.');
        // Remoção otimista para refletir imediatamente na UI
        setSavedTemplates(prev => prev.filter(t => t.id !== id));
        // Recarrega em background para garantir consistência
        setTimeout(() => { loadSavedTemplates(); }, 100);
      }
    } catch (e) {
      toast.error(e.message || String(e));
      setTemplatesError(e.message || String(e));
    }
  };

  // Carregar arquivos salvos (base64)
  const loadSavedFiles = async () => {
    try {
      setLoadingFiles(true);
      setFilesError(null);
      const { success, data, error } = await database.getMessageFiles(50);
      if (!success) {
        setFilesError(error || 'Não foi possível carregar arquivos salvos.');
        setSavedFiles([]);
      } else {
        setSavedFiles(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setFilesError(e.message || String(e));
    } finally {
      setLoadingFiles(false);
    }
  };

  // Carregar templates salvos
  const loadSavedTemplates = async () => {
    try {
      setLoadingTemplates(true);
      setTemplatesError(null);
      const { success, data, error } = await database.getMessageTemplates(50);
      if (!success) {
        setTemplatesError(error || 'Não foi possível carregar mensagens salvas.');
        setSavedTemplates([]);
      } else {
        setSavedTemplates(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setTemplatesError(e.message || String(e));
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Carregar ao montar e quando abrir o editor
  useEffect(() => {
    if (sendTextEnabled) {
      loadSavedTemplates();
    }
  }, [sendTextEnabled]);

  // Carregar conjuntos de mensagens ao montar
  useEffect(() => {
    const loadSets = async () => {
      try {
        setLoadingMessageSets(true);
        setMessageSetsError('');
        const res = await database.getMessageSets(100);
        if (!res.success) {
          setMessageSetsError(res.error || 'Não foi possível carregar conjuntos.');
          setSavedMessageSets([]);
        } else {
          setSavedMessageSets(Array.isArray(res.data) ? res.data : []);
        }
      } catch (e) {
        setMessageSetsError(String(e?.message || e));
      } finally {
        setLoadingMessageSets(false);
      }
    };
    loadSets();
  }, []);

  // Carregar arquivos salvos quando habilitar envio de arquivo
  useEffect(() => {
    if (sendFileEnabled) {
      loadSavedFiles();
    }
  }, [sendFileEnabled]);

  // (sem carregamento de imagens salvas)

  const handleSaveFileToDatabase = async () => {
    try {
      if (!fileToSave) {
        toast.error('Selecione um arquivo para salvar.');
        return;
      }
      if (fileToSave.size > MAX_MEDIA_SIZE) {
        toast.error('Arquivo excede o limite de 25MB.');
        return;
      }
      setSavingFile(true);
      const base64 = await readFileAsBase64(fileToSave);
      const { success, error } = await database.saveMessageFile({
        filename: fileToSave.name || 'arquivo',
        mimetype: fileToSave.type || inferMimeFromFilename(fileToSave.name) || null,
        size: fileToSave.size || null,
        dataBase64: base64
      });
      if (!success) {
        toast.error(error || 'Falha ao salvar arquivo.');
      } else {
        toast.success('Arquivo salvo com sucesso!');
        setFileToSave(null);
        await loadSavedFiles();
      }
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setSavingFile(false);
    }
  };

  const handleDeleteSavedFile = async (id) => {
    const ok = window.confirm('Apagar este arquivo salvo?');
    if (!ok) return;
    try {
      const { success, error } = await database.deleteMessageFile(id);
      if (!success) {
        toast.error(error || 'Não foi possível apagar o arquivo.');
      } else {
        toast.success('Arquivo apagado.');
        if (selectedSavedFileId === id) setSelectedSavedFileId(null);
        await loadSavedFiles();
      }
    } catch (e) {
      toast.error(e.message || String(e));
    }
  };

  // (sem salvar/apagar imagens)

  // Preview derivado com base no mapeamento atual
  const mappedPreview = useMemo(() => {
    if (!previewData || previewData.length === 0) return [];
    const mapField = (key) => columnMap[key];
    
    // Função para tratar telefone vazio no preview
    const tratarTelefonePreview = (telefone) => {
      const limpo = String(telefone).replace(/\D/g, '');
      // Retornar vazio caso não haja dígitos; sem marcar como EMPTY
      if (!limpo) return '';
      // Limitar a 50 caracteres
      return limpo.length > 50 ? limpo.substring(0, 50) : limpo;
    };
    
    return previewData.slice(0, 10).map(row => {
      const telefoneRaw = mapField('telefone') ? String(row[mapField('telefone')] || '').replace(/\D/g, '') : '';
      return {
        nome: mapField('nome') ? (row[mapField('nome')] || '') : '',
        empresa: mapField('empresa') ? (row[mapField('empresa')] || '') : '',
        email: mapField('email') ? (row[mapField('email')] || '') : '',
        telefone: tratarTelefonePreview(telefoneRaw)
      };
    });
  }, [previewData, columnMap]);

  const processFile = async (selectedFile) => {
    // Validar tipo de arquivo (CSV ou XLSX)
    const lower = selectedFile.name.toLowerCase();
    const isCSV = lower.endsWith('.csv');
    const isXLSX = lower.endsWith('.xlsx');
    if (!isCSV && !isXLSX) {
      toast.error('Selecione um arquivo .csv ou .xlsx válido');
      return;
    }

    // Validar tamanho (máximo 100MB)
    if (selectedFile.size > 100 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Tamanho máximo: 100MB');
      return;
    }

    setFile(selectedFile);
    setErrors([]);
    setPreviewData([]);
    setColumnMap({ nome: '', empresa: '', email: '', telefone: '' });
    setShowPreview(false);
    setAddBrazilPrefix(false);

    try {
      setLoading(true);
      const data = isCSV ? await processCSVFile(selectedFile) : await processXLSXFile(selectedFile);
      
      if (data.length === 0) {
        toast.error('Arquivo CSV está vazio ou inválido');
        return;
      }

      setPreviewData(data);
      
      // Auto-mapear pelos nomes das colunas
      const columns = Object.keys(data[0]);
      const lowerColumns = columns.map(c => c.toLowerCase().trim());
      
      const findCol = (patterns) => {
        for (const pattern of patterns) {
          const idx = lowerColumns.findIndex(c => c.includes(pattern.toLowerCase()));
          if (idx >= 0) return columns[idx];
        }
        return '';
      };
      
      setColumnMap({
        nome: findCol(['nome', 'name', 'cliente', 'pessoa', 'contato']),
        empresa: findCol(['empresa', 'company', 'organização', 'organizacao', 'cliente']),
        email: findCol(['email', 'e-mail', 'mail', 'correio']),
        telefone: findCol(['telefone', 'phone', 'tel', 'celular', 'cel', 'whatsapp', 'fone'])
      });
      
      toast.success(`Arquivo carregado com sucesso! ${data.length} registros encontrados.`);
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast.error('Erro ao processar arquivo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    await processFile(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  // validateData removido (não utilizado)


  const handleUpload = async () => {
    if (!file || previewData.length === 0) {
      toast.error('Nenhum arquivo selecionado');
      return;
    }

    // Checar mapeamentos obrigatórios (email e empresa são opcionais)
    const required = ['nome','telefone'];
    const missing = required.filter(key => !columnMap[key]);
    if (missing.length > 0) {
      toast.error(`Mapeie as colunas: ${missing.join(', ')}`);
      return;
    }

    // Gerar dados mapeados para envio (sem banco)
    const mapField = (target) => columnMap[target];
    const initialData = previewData.map(row => {
      const telefoneRaw = String(row[mapField('telefone')] || '').replace(/\D/g, '');
      return {
        ...row, // mantém todas as colunas originais disponíveis para o template
        nome: row[mapField('nome')] || '',
        empresa: row[mapField('empresa')] || '',
        email: row[mapField('email')] || '',
        telefone: telefoneRaw
      };
    });

    // Normalizar telefones (sem marcar EMPTY)
    let correctedData = initialData.map(row => ({
      ...row,
      telefone: String(row.telefone || '').replace(/\D/g, '').slice(0, 50)
    }));

    if (addBrazilPrefix) {
      correctedData = correctedData.map(row => {
        const onlyDigits = String(row.telefone).replace(/\D/g, '');
        if (onlyDigits && !onlyDigits.startsWith('55')) {
          const prefixed = '55' + onlyDigits;
          return { ...row, telefone: prefixed.length > 50 ? prefixed.substring(0, 50) : prefixed };
        }
        return row;
      });
    }

    // Calcular estatísticas relevantes ao envio
    const digitsList = correctedData.map(row => String(row.telefone || '').replace(/\D/g, ''));
    const seenDup = new Set();
    const seenOnce = new Set();
    let duplicatesCount = 0;
    for (const d of digitsList) {
      if (!d) continue;
      if (seenOnce.has(d)) {
        duplicatesCount += 1;
        seenDup.add(d);
      } else {
        seenOnce.add(d);
      }
    }
    const stats = {
      total: correctedData.length,
      numerosCurtos: correctedData.filter(row => String(row.telefone || '').replace(/\D/g, '').length > 0 && String(row.telefone || '').replace(/\D/g, '').length < 7).length,
      duplicados: duplicatesCount
    };

    // Mostrar modal de confirmação com estatísticas
    setConfirmationData({ data: correctedData, stats });
    setShowConfirmation(true);
  };

  // Removida etapa "Preparar base" — começamos direto no botão "Começar envio"

  // Ao confirmar upload, inicia o envio usando a base preparada
  const confirmUpload = async () => {
    setShowConfirmation(false);
    sentNumbersSetRef.current = new Set();
    // Se ainda não preparamos a lista (modo sem banco), monte a base a partir da confirmação
    if (!pendingListRef.current || pendingListRef.current.length === 0) {
      let startData = [...(confirmationData?.data || [])];
      startData = startData.map(row => {
        const digits = String(row.telefone || '').replace(/\D/g, '');
        const had55 = digits.startsWith('55');
        const country = (addBrazilPrefix || had55) ? '55' : '';
        let base = had55 ? digits.slice(2) : digits;
        if (autoFillDDD && selectedDDD && base && (base.length === 8 || base.length === 9)) {
          base = String(selectedDDD) + base;
        }
        const finalDigits = `${country}${base}`;
        return {
          ...row,
          telefone_raw: digits,
          telefone_norm: finalDigits,
          message_template: messageTemplate || ''
        };
      });
      if (removeDuplicates) {
        const seen = new Set();
        startData = startData.filter(row => {
          const d = String(row.telefone_norm || '').replace(/\D/g, '');
          if (!d) return true;
          if (seen.has(d)) return false;
          seen.add(d);
          return true;
        });
      }
      pendingListRef.current = startData;
      setPendingList(startData);
    }
    // Expansão de variantes com/sem 9, se habilitado
    const buildNineVariants = (rawDigits) => {
      const clean = String(rawDigits || '').replace(/\D/g, '');
      const had55 = clean.startsWith('55');
      const country = (addBrazilPrefix || had55) ? '55' : '';
      const remainder = had55 ? clean.slice(2) : clean;
      let ddd = '';
      let local = remainder;
      if (remainder.length >= 10) {
        ddd = remainder.slice(0, 2);
        local = remainder.slice(2);
      } else if (autoFillDDD && selectedDDD) {
        ddd = String(selectedDDD);
        local = remainder;
      }
      const localNo9 = local.startsWith('9') ? local.slice(1) : local;
      const without9 = `${country}${ddd}${localNo9}`;
      const with9 = `${country}${ddd}9${localNo9}`;
      return { with9, without9 };
    };
    let expandedData = pendingListRef.current || pendingList;
    if (validateWithNine) {
      sendBothNineVariantsRef.current = true;
      const tmp = [];
      for (const row of expandedData) {
        const baseDigits = row.telefone_norm || row.telefone || row.telefone_raw || '';
        const d = String(baseDigits || '').replace(/\D/g, '');
        const { with9, without9 } = buildNineVariants(d);
        tmp.push({ ...row, telefone: with9, telefone_norm: with9, _nineVariant: 'with9' });
        if (without9 !== with9) {
          tmp.push({ ...row, telefone: without9, telefone_norm: without9, id: null, _nineVariant: 'without9' });
        }
      }
      expandedData = tmp;
    } else {
      sendBothNineVariantsRef.current = false;
    }

    pendingListRef.current = expandedData;
    setPendingList(expandedData);
    setSentList([]);
    setShowSendingScreen(true);
    setSendingPaused(false);
    setSendingCompleted(false);
    setSendingStartAt(new Date());
    setSendingEndAt(null);
    toast.success('Iniciando envio sem banco (modo memória)...');
    try {
      const processId = processStore.createProcess({
        filename: file?.name || 'planilha.csv',
        items: expandedData,
        config: {
          useRandomInterval,
          randomIntervalRange,
          sendIntervalSeconds,
        }
      });
      Sender.start({
        processId,
        items: expandedData,
        sendTextEnabled,
        sendText2Enabled,
        sendText3Enabled,
        messageTemplate,
        messageTemplate2,
        messageTemplate3,
        sendFileEnabled,
        fileUrlForSend,
        sendImageEnabled,
        imageUrlForSend,
        useRandomInterval,
        randomIntervalRange,
        sendIntervalSeconds,
        maxRetries,
        onWaitStart: (sec) => { setCurrentIntervalSec(sec); },
        onWaitTick: (t) => { setNextCountdown(t); },
        onItemSent: (item, extras) => {
          // atualiza listas locais com status explícito
          setSentList(prev => [{ ...(item || {}), ...(extras || {}), status: 'sent' }, ...prev]);
          const idA = String(item.telefone_norm || item.telefone || item.id || '');
          pendingListRef.current = pendingListRef.current.filter((x) => {
            const idB = String(x.telefone_norm || x.telefone || x.id || '');
            return idA !== idB;
          });
          setPendingList([...pendingListRef.current]);
          // se acabou, marca conclusão e fim
          if (!pendingListRef.current || pendingListRef.current.length === 0) {
            setSendingEndAt(new Date());
            setSendingCompleted(true);
            toast.success('Envio concluído. Relatório final disponível.');
          }
        },
        onItemError: (item, err) => {
          setSentList(prev => [{ ...(item || {}), status: 'error', error: String(err?.message || err), sentAt: new Date().toISOString(), attempts: (item?.attempts || 0) }, ...prev]);
          // remove também dos pendentes para que a fila avance
          const idA = String(item.telefone_norm || item.telefone || item.id || '');
          pendingListRef.current = pendingListRef.current.filter((x) => {
            const idB = String(x.telefone_norm || x.telefone || x.id || '');
            return idA !== idB;
          });
          setPendingList([...pendingListRef.current]);
          // se acabou, marca conclusão e fim
          if (!pendingListRef.current || pendingListRef.current.length === 0) {
            setSendingEndAt(new Date());
            setSendingCompleted(true);
            toast('Envio encerrado com erros. Baixe o relatório final.');
          }
        }
      });
    } catch (err) {
      toast.error('Falha ao iniciar envio em segundo plano: ' + (err.message || String(err)));
    }
  };

  // Função que processa o envio item a item respeitando o intervalo e permitindo pausa
  const startSendingWorker = () => {
    // evitar múltiplos workers
    if (sendWorkerRef.current) return;
    sendAbortRef.current = false;

    const buildNineVariants = (rawDigits) => {
      const clean = String(rawDigits || '').replace(/\D/g, '');
      const had55 = clean.startsWith('55');
      const country = (addBrazilPrefix || had55) ? '55' : '';
      const remainder = had55 ? clean.slice(2) : clean;
      let ddd = '';
      let local = remainder;
      if (remainder.length >= 10) {
        ddd = remainder.slice(0, 2);
        local = remainder.slice(2);
      } else if (autoFillDDD && selectedDDD) {
        ddd = String(selectedDDD);
        local = remainder;
      }
      const localNo9 = local.startsWith('9') ? local.slice(1) : local;
      const without9 = `${country}${ddd}${localNo9}`;
      const with9 = `${country}${ddd}9${localNo9}`;
      return { with9, without9 };
    };

    const awaitIntervalCountdown = async () => {
      // aguarda o intervalo e atualiza contagem regressiva visível
      const intervalSec = getNextIntervalSeconds();
      setCurrentIntervalSec(intervalSec);
      for (let t = intervalSec; t > 0 && !sendAbortRef.current; t--) {
        if (sendingPaused) {
          // se pausado, não avança a contagem; espera e repete o mesmo segundo
          // eslint-disable-next-line no-await-in-loop
          await new Promise(r => setTimeout(r, 500));
          t++;
          continue;
        }
        setNextCountdown(t);
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 1000));
      }
      setNextCountdown(0);
    };

    // Aguarda enquanto estiver pausado antes de prosseguir com qualquer envio
    const awaitWhilePaused = async () => {
      // eslint-disable-next-line no-await-in-loop
      while (sendingPaused && !sendAbortRef.current) {
        // pequena espera para evitar busy-loop
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 300));
      }
    };

    const worker = async () => {
      while (!sendAbortRef.current) {
        // Bloqueia o loop se estiver pausado (antes de selecionar próximo item)
        // eslint-disable-next-line no-await-in-loop
        await awaitWhilePaused();

        // pegar próximo item
        let next;
        if (!pendingListRef.current || pendingListRef.current.length === 0) {
          next = null;
        } else {
          next = pendingListRef.current.shift();
          setPendingList([...pendingListRef.current]);
        }

        if (!next) break;

        // construir mensagem personalizada (suporta {nome da coluna})
        const personalized = renderTemplateMessage(messageTemplate, next);
        const personalized2 = sendText2Enabled ? renderTemplateMessage(messageTemplate2, next) : '';
        const personalized3 = sendText3Enabled ? renderTemplateMessage(messageTemplate3, next) : '';

        // Retry automático
        let attempt = 0;
        let sent = false;
        let lastError = null;
        // validação local: pular números com menos de 7 dígitos
        const baseDigits = next.telefone_norm || next.telefone || '';
        const onlyDigits = String(baseDigits).replace(/\D/g, '');
        if (!onlyDigits || onlyDigits.length < 7) {
          setSentList(prev => [
            ...prev,
            { ...next, status: 'skipped', reason: 'telefone curto', message: personalized, sentAt: new Date().toISOString(), attempts: 0 }
          ]);
          // Atualizar no banco
          if (next.id) {
            try { await database.markItemSkipped({ itemId: next.id, reason: 'telefone curto' }); } catch {}
          }
          // aguardar o intervalo e continuar
          // eslint-disable-next-line no-await-in-loop
          await awaitIntervalCountdown();
          continue;
        }

        // Se já foi enviado anteriormente neste lote, pula
        if (sentNumbersSetRef.current.has(onlyDigits)) {
          setSentList(prev => [
            ...prev,
            { ...next, status: 'skipped', reason: 'já enviado anteriormente', message: personalized, sentAt: new Date().toISOString(), attempts: 0 }
          ]);
          // aguarda e segue
          // eslint-disable-next-line no-await-in-loop
          await awaitIntervalCountdown();
          continue;
        }

        const altDigits = (validateWithNine && !sendBothNineVariantsRef.current) ? buildNineVariants(onlyDigits).without9 : null;

        // Flags para controlar sucesso de texto/arquivo(imagem) por link entre tentativas
        let text1Done = !sendTextEnabled;
        let text2Done = !sendText2Enabled;
        let text3Done = !sendText3Enabled;
        let linkDone = !sendFileEnabled; // arquivo por link
        let imageDone = !sendImageEnabled; // imagem por link
        while (attempt < maxRetries && !sent && !sendAbortRef.current) {
          try {
            // Honra pausa antes de cada tentativa de envio
            // eslint-disable-next-line no-await-in-loop
            await awaitWhilePaused();
            // eslint-disable-next-line no-await-in-loop
            {
              // Tentativa 1: número original; Tentativa 2: número alternado; Tentativa 3+: volta ao original
              const useAltNow = validateWithNine && attempt === 1 && altDigits && !sentNumbersSetRef.current.has(altDigits);
              const phoneToUse = useAltNow ? altDigits : onlyDigits;
              // Enviar texto se habilitado e ainda não enviado
              if (!text1Done) {
                await wahaApi.sendMessage(phoneToUse, personalized);
                text1Done = true;
              }
              if (!text2Done) {
                await wahaApi.sendMessage(phoneToUse, personalized2);
                text2Done = true;
              }
              if (!text3Done) {
                await wahaApi.sendMessage(phoneToUse, personalized3);
                text3Done = true;
              }
              // Enviar link de arquivo como texto com preview
              if (!linkDone) {
                const urlText = String(fileUrlForSend || '').trim();
                // envia como sendText com preview (usa sendLinkMessage internamente)
                await wahaApi.sendLinkMessage(phoneToUse, urlText);
                linkDone = true;
              }
              // Enviar link de imagem como texto com preview (alta qualidade)
              if (!imageDone) {
                const urlImgText = String(imageUrlForSend || '').trim();
                await wahaApi.sendLinkMessage(phoneToUse, urlImgText);
                imageDone = true;
              }
              // Se ambos concluídos (conforme seleção), marcar como enviado
              if (text1Done && text2Done && text3Done && linkDone && imageDone) {
                sentNumbersSetRef.current.add(phoneToUse);
              }
            }
            sent = text1Done && text2Done && text3Done && linkDone && imageDone;
            const sentItem = { ...next, status: sent ? 'sent' : 'partial', message: personalized, sentAt: new Date().toISOString(), attempts: attempt + 1 };
            setSentList(prev => [...prev, sentItem]);
            // Atualizar no banco
            if (next.id) {
              try {
                if (sent) {
                  await database.markItemSent({ itemId: next.id, messageRendered: sendTextEnabled ? personalized : '', attempts: attempt + 1 });
                }
              } catch {}
            }
          } catch (err) {
            attempt += 1;
            lastError = err;
            // pequeno backoff entre tentativas, respeitando pausa
            const backoffMs = 2000 * attempt;
            let waited = 0;
            const step = 200;
            while (waited < backoffMs && !sendAbortRef.current) {
              if (sendingPaused) {
                // eslint-disable-next-line no-await-in-loop
                await awaitWhilePaused();
              } else {
                // eslint-disable-next-line no-await-in-loop
                await new Promise(r => setTimeout(r, Math.min(step, backoffMs - waited)));
                waited += step;
              }
            }
          }
        }

        if (!sent) {
          const errItem = { ...next, status: 'error', error: (lastError && lastError.message) || String(lastError), message: personalized, attempts: attempt, sentAt: new Date().toISOString() };
          setSentList(prev => [...prev, errItem]);
          if (next.id) {
            try { await database.markItemError({ itemId: next.id, errorMessage: errItem.error, attempts: attempt }); } catch {}
          }
        }

        // aguardar intervalo configurado com contagem regressiva (honra pausa dentro dele)
        // eslint-disable-next-line no-await-in-loop
        await awaitIntervalCountdown();
      }

      // terminou
      setSendingEndAt(new Date());
      setSendingCompleted(true);
      sendWorkerRef.current = null;
    };

    sendWorkerRef.current = worker();
  };

  const pauseSending = () => { setSendingPaused(true); try { Sender.pause(); } catch {} };
  const resumeSending = () => { setSendingPaused(false); try { Sender.resume(); } catch {} };
  const stopSending = () => {
    try { Sender.stop(); } catch {}
    setSendingPaused(true);
    sendWorkerRef.current = null;
    if (dbSyncTimerRef.current) {
      clearInterval(dbSyncTimerRef.current);
      dbSyncTimerRef.current = null;
    }
    setSendingEndAt(new Date());
    setSendingCompleted(true);
  };

  // Util: formata segundos em hh:mm:ss
  const formatSeconds = (s) => {
    if (!s || s <= 0) return '00:00';
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    if (hrs > 0) return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  };

  // Renderiza a mensagem substituindo variáveis do template por valores da linha
  const renderTemplateMessage = (template, row) => {
    if (!template) return '';
    const lowerRow = {};
    Object.keys(row || {}).forEach(k => { lowerRow[k.toLowerCase()] = row[k]; });
    // garantir chaves normalizadas presentes
    ['nome','empresa','email','telefone'].forEach(k => {
      if (row && row[k] !== undefined && row[k] !== null) lowerRow[k] = row[k];
    });
    // colunas personalizadas
    (customMappings || []).forEach(mp => {
      const key = String(mp.name || '').trim().toLowerCase();
      const src = String(mp.source || '').trim();
      if (key && src && row && row.hasOwnProperty(src)) {
        lowerRow[key] = row[src];
      }
    });
    return template.replace(/\{([^}]+)\}/g, (m, p1) => {
      const key = String(p1 || '').trim().toLowerCase();
      let val = lowerRow[key];
      // tentativa via mapeamento se não houver chave direta
      if ((val === undefined || val === null) && columnMap && columnMap[key]) {
        const mappedKey = columnMap[key];
        val = row ? row[mappedKey] : undefined;
      }
      return val !== undefined && val !== null ? String(val) : '';
    });
  };

  const estimatedSecondsRemaining = () => {
    // Usa pendentes se houver; caso contrário, usa total confirmado (preview)
    let count = pendingList.length;
    if (!count || count <= 0) {
      count = (confirmationData?.stats?.total ?? (previewData?.length ?? 0));
    }
    if (count <= 0) return 0;

    if (useRandomInterval && randomIntervalRange) {
      const min = Math.max(1, Math.floor(randomIntervalRange.min ?? 1));
      const max = Math.max(min, Math.floor(randomIntervalRange.max ?? min));
      const avg = Math.round((min + max) / 2);
      const base = avg || sendIntervalSeconds || 60;
      return count * base;
    }
    return count * (sendIntervalSeconds || 60);
  };

  // Desenhar gráfico de donut ao concluir
  useEffect(() => {
    if (!sendingCompleted || !donutCanvasRef.current) return;
    try {
      const sentCount = sentList.filter(x => x.status === 'sent').length;
      const errCount = sentList.filter(x => x.status === 'error').length;
      const ChartLib = require('chart.js/auto');
      const ctx = donutCanvasRef.current.getContext('2d');
      if (donutCanvasRef.current._chartInstance) {
        donutCanvasRef.current._chartInstance.destroy();
      }
      donutCanvasRef.current._chartInstance = new ChartLib.Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Enviadas', 'Erros'],
          datasets: [{
            data: [sentCount, errCount],
            backgroundColor: ['#22c55e', '#ef4444'],
            borderColor: ['#16a34a', '#dc2626']
          }]
        },
        options: { plugins: { legend: { labels: { color: '#ddd' } } } }
      });
    } catch (_) {}
  }, [sendingCompleted, sentList]);

  const downloadFinalReport = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const ChartLib = await import('chart.js/auto');
      const sentCount = sentList.filter(x => x.status === 'sent').length;
      const errCount = sentList.filter(x => x.status === 'error').length;
      const notSentCount = pendingList.length;
      const start = sendingStartAt ? new Date(sendingStartAt) : null;
      const end = sendingEndAt ? new Date(sendingEndAt) : new Date();
      const elapsedSec = start ? Math.round((end - start) / 1000) : 0;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Título
      doc.setFontSize(18);
      doc.text('Relatório Final de Envio', 15, 20);
      // (imagem removida do PDF conforme solicitado)

      // Resumo
      doc.setFontSize(12);
      doc.text(`Enviadas: ${sentCount}`, 15, 30);
      doc.text(`Erros: ${errCount}`, 15, 36);
      doc.text(`Não enviadas: ${notSentCount}`, 15, 42);
      doc.text(`Tempo decorrido: ${formatSeconds(elapsedSec)}`, 15, 48);

      // Gráfico donut (3 segmentos) para PDF
      const leftX = 15; const imgTop = 58; const imgSize = 80; // mm
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = 300; tmpCanvas.height = 300;
      let chartInst = null;
      try {
        chartInst = new ChartLib.Chart(tmpCanvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['Enviadas', 'Erros', 'Não enviadas'],
            datasets: [{
              data: [sentCount, errCount, notSentCount],
              backgroundColor: ['#22c55e', '#ef4444', '#64748b'],
              borderColor: ['#16a34a', '#dc2626', '#475569']
            }]
          },
          options: { plugins: { legend: { display: false } } }
        });
        const donutDataURL = tmpCanvas.toDataURL('image/png');
        doc.addImage(donutDataURL, 'PNG', leftX, imgTop, imgSize, imgSize);
      } catch {}
      finally {
        if (chartInst) chartInst.destroy();
      }

      // Tabela sucinta com últimas 10 linhas
      doc.setFontSize(12);
      doc.text('Últimos resultados (até 10):', 15, imgTop + imgSize + 12);
      const baseY = imgTop + imgSize + 18;
      const rows = sentList.slice(-10);
      let y = baseY;
      doc.setFontSize(10);
      doc.text('Nome', 15, y);
      doc.text('Telefone', 65, y);
      doc.text('Status', 115, y);
      doc.text('Horário', 155, y);
      y += 6;
      rows.forEach(r => {
        if (y > pageH - 10) { doc.addPage(); y = 15; }
        doc.text(String(r.nome || '-').slice(0, 28), 15, y);
        doc.text(String(r.telefone || '-'), 65, y);
        doc.text(String(r.status || '-'), 115, y);
        doc.text(String(r.sentAt || '-'), 155, y);
        y += 6;
      });

      doc.save('relatorio_final.pdf');
    } catch (err) {
      toast.error('Falha ao gerar PDF do relatório final.');
    }
  };

  const estimatedRangeRemaining = () => {
    let count = pendingList.length;
    if (!count || count <= 0) {
      count = (confirmationData?.stats?.total ?? (previewData?.length ?? 0));
    }
    if (count <= 0) return { min: 0, max: 0, avg: 0 };

    if (useRandomInterval && randomIntervalRange) {
      const minEach = Math.max(1, Math.floor(randomIntervalRange.min ?? 1));
      const maxEach = Math.max(minEach, Math.floor(randomIntervalRange.max ?? minEach));
      const avgEach = Math.round((minEach + maxEach) / 2);
      return { min: minEach * count, max: maxEach * count, avg: avgEach * count };
    }
    const base = sendIntervalSeconds || 60;
    const fixed = count * base;
    return { min: fixed, max: fixed, avg: fixed };
  };

  const getNextIntervalSeconds = () => {
    if (!useRandomInterval || !randomIntervalRange) return sendIntervalSeconds;
    const lo = Math.max(1, Math.floor(randomIntervalRange.min || 1));
    const hi = Math.max(lo, Math.floor(randomIntervalRange.max || lo));
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  };

  const getIntervalSelectValue = () => {
    if (useRandomInterval) {
      const min = randomIntervalRange?.min ?? 10;
      const max = randomIntervalRange?.max ?? 50;
      return `rand-${min}-${max}`;
    }
    return `fixed-${sendIntervalSeconds}`;
  };

  // Exportar lista para CSV e forçar download
  const downloadCSV = (items, filename) => {
    if (!items || items.length === 0) {
      toast('Nada para exportar');
      return;
    }
    const keys = Object.keys(items[0]);
    const header = keys.join(',') + '\n';
    const rows = items.map(it => keys.map(k => `"${String(it[k] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Upload className="w-6 h-6 text-primary-500" />
          <h2 className="text-2xl font-bebas text-white">Upload de Planilha CSV</h2>
        </div>
        <button
          onClick={onClose}
          className="text-dark-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Upload de arquivo */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-dark-200 mb-2">
          Selecionar Arquivo CSV/XLSX
        </label>
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
            disabled={loading}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={loading}
            className={`w-full p-6 border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer ${
              isDragOver 
                ? 'border-primary-500 bg-primary-500/10' 
                : 'border-dark-600 hover:border-primary-500'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="text-center">
              {loading ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
              ) : (
                <Upload className={`w-8 h-8 mx-auto mb-4 ${isDragOver ? 'text-primary-500' : 'text-primary-500'}`} />
              )}
              <p className="text-white font-mulish mb-2">
                {loading 
                  ? 'Processando arquivo...' 
                  : isDragOver 
                    ? 'Solte o arquivo aqui' 
                    : 'Arraste e solte ou clique para selecionar um arquivo CSV ou XLSX'
                }
              </p>
              <p className="text-dark-400 text-sm">
                Máximo 100MB • Arquivos .csv ou .xlsx
              </p>
            </div>
          </div>
        </div>

        {file && (
          <div className="mt-4 p-4 bg-dark-700/50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-primary-500" />
                <div>
                  <p className="text-white font-mulish">{file.name}</p>
                  <p className="text-dark-400 text-sm">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-primary-500 hover:text-primary-400 transition-colors"
              >
                {showPreview ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Erros de validação */}
      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-red-400 font-medium mb-2">Erros encontrados no arquivo:</h4>
              <ul className="text-red-300 text-sm space-y-1">
                {errors.slice(0, 5).map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
                {errors.length > 5 && (
                  <li>• ... e mais {errors.length - 5} erros</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tela de Envio (quando a segunda confirmação é clicada) */}
      {showSendingScreen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 rounded-lg w-full max-w-6xl p-6 grid grid-cols-3 gap-4">
            {/* Esquerda: planilha completa (pendentes) */}
            <div className="col-span-1 bg-dark-800/40 rounded-lg p-3 overflow-y-auto max-h-[70vh]">
              <h4 className="text-sm font-medium text-white mb-3">Planilha (pendentes)</h4>
              <div className="text-xs text-dark-300 mb-2">Total: {pendingList.length}</div>
              <table className="w-full text-sm">
                <thead className="text-dark-300 text-xs">
                  <tr>
                    <th className="py-1 text-left">Nome</th>
                    <th className="py-1 text-left">Telefone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {pendingList.map((row, idx) => (
                    <tr key={idx} className="hover:bg-dark-700/30">
                      <td className="py-1 pr-2 truncate">{row.nome || '-'}</td>
                      <td className="py-1 pr-2 truncate">{row.telefone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Centro: ícone de envio + controles */}
            <div className="col-span-1 flex flex-col items-center justify-start space-y-3 overflow-y-auto max-h-[70vh] p-2">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-28 h-28 rounded-full bg-primary-500/10 flex items-center justify-center">
                  <Send className="w-12 h-12 text-primary-400" />
                </div>
                <div className="text-center">
                <div className="text-sm text-dark-300">Pendentes: <span className="text-white font-semibold">{pendingList.length}</span></div>
                <div className="text-sm text-dark-300">Enviadas: <span className="text-white font-semibold">{sentList.filter(x => x.status === 'sent').length}</span></div>
                <div className="text-sm text-dark-300">Erros: <span className="text-white font-semibold">{sentList.filter(x => x.status === 'error').length}</span></div>
                <div className="text-sm text-dark-300">Próximo envio em: <span className="text-white font-semibold">{formatSeconds(nextCountdown)}</span></div>
                <div className="text-xs text-dark-400">Intervalo atual: <span className="text-white">{currentIntervalSec}s</span></div>
                <div className="mt-2 text-[11px] text-dark-300">Modo sem banco</div>
              </div>
              </div>

                <div className="flex flex-col items-center space-y-3">
                  <div className="text-sm text-dark-300">
                    ETA estimado:
                    <span className="text-white font-semibold ml-1">{formatSeconds(estimatedRangeRemaining().min)}</span>
                    {' '}~{' '}
                    <span className="text-white font-semibold">{formatSeconds(estimatedRangeRemaining().max)}</span>
                    {useRandomInterval && (
                      <span className="text-dark-400 ml-1">(média {formatSeconds(estimatedRangeRemaining().avg)})</span>
                    )}
                  </div>
                  <div className="text-xs text-dark-400">
                    {(() => {
                      const avg = estimatedRangeRemaining().avg;
                      const end = new Date(Date.now() + (avg * 1000));
                      const hh = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                      return `Pronto em ${hh}`;
                    })()}
                  </div>
                  <div className="flex items-center space-x-2">
                {!sendingPaused ? (
                  <button onClick={pauseSending} className="px-4 py-2 bg-yellow-500 text-black rounded">Pausar</button>
                ) : (
                  <button onClick={resumeSending} className="px-4 py-2 bg-green-500 text-white rounded">Retomar</button>
                )}
                <button onClick={stopSending} className="px-4 py-2 bg-red-600 text-white rounded">Parar</button>
                  <button onClick={() => { setShowSendingScreen(false); stopSending(); }} className="px-4 py-2 bg-dark-600 text-white rounded">Fechar</button>
                  </div>

                <div className="flex items-center space-x-2">
                  <button onClick={() => downloadCSV(sentList, 'enviadas.csv')} className="px-3 py-2 bg-primary-500 text-white rounded text-sm">Baixar Enviadas</button>
                  <button onClick={() => downloadCSV(pendingList, 'pendentes.csv')} className="px-3 py-2 bg-dark-600 text-white rounded text-sm">Baixar Pendentes</button>
                </div>

                {sendingCompleted && (
                  <div className="mt-4 w-full">
                    <div className="bg-dark-700/50 rounded-lg p-3 flex flex-col items-center mx-auto max-w-md text-center">
                      <h5 className="text-base font-medium text-white mb-2">Relatório Final</h5>
                      <div className="flex items-center justify-center">
                        <img
                          src={(process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/vid_img/rel_end.jpg` : '/vid_img/rel_end.jpg')}
                          alt="Relatório"
                          className="w-28 h-28 rounded object-cover border border-dark-600 mx-auto"
                        />
                      </div>
                      <div className="mt-2 space-y-0.5 leading-tight">
                        <div className="text-sm text-dark-300">Enviadas: <span className="text-white font-semibold">{sentList.filter(x => x.status === 'sent').length}</span></div>
                        <div className="text-sm text-dark-300">Erros: <span className="text-white font-semibold">{sentList.filter(x => x.status === 'error').length}</span></div>
                        <div className="text-sm text-dark-300">Tempo decorrido: <span className="text-white font-semibold">{formatSeconds(Math.max(0, Math.round(((sendingEndAt ? new Date(sendingEndAt) : new Date()) - (sendingStartAt ? new Date(sendingStartAt) : new Date()))/1000)))}</span></div>
                      </div>
                      <button onClick={downloadFinalReport} className="mt-2 px-4 py-2 bg-primary-500 text-white rounded text-sm w-full sm:w-auto">Baixar Relatório Final</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-sm text-dark-300">
                Intervalo: <span className="text-white font-semibold">{useRandomInterval ? `${randomIntervalRange.min}s ~ ${randomIntervalRange.max}s` : `${sendIntervalSeconds}s`}</span>
              </div>
            </div>

            {/* Direita: preview sendo criado (enviadas) */}
            <div className="col-span-1 bg-dark-800/40 rounded-lg p-3 overflow-y-auto max-h-[70vh]">
              <h4 className="text-sm font-medium text-white mb-3">Mensagens Enviadas</h4>
              <div className="text-xs text-dark-300 mb-2">Total: {sentList.filter(x => x.status === 'sent').length}</div>
              <ul className="space-y-2">
                {sentList.filter(x => x.status === 'sent').map((item, idx) => (
                  <li key={idx} className={`p-2 rounded ${item.status === 'sent' ? 'bg-dark-700/30' : 'bg-red-700/20'}`}>
                    <div className="text-sm text-white truncate">{item.nome || '-' } • {item.telefone}</div>
                    <div className="text-xs text-dark-300 mt-1">{item.message}</div>
                    <div className="text-xs text-dark-400 mt-1">
                      {item.status === 'sent' && `Enviado em ${new Date(item.sentAt).toLocaleString()}`}
                      {/* painel de enviados exibe apenas sucesso */}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Mapeamento e preview dos dados */}
      {showPreview && previewData.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bebas text-white mb-4">Mapeamento de Colunas</h3>

          {/* Colunas disponíveis */}
          <div className="mb-4 p-4 bg-dark-700/50 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-3">Colunas disponíveis na planilha:</h4>
            <div className="flex flex-wrap gap-2">
              {Object.keys(previewData[0]).map((col, idx) => (
                <span key={idx} className="px-2 py-1 bg-dark-600 text-dark-300 text-xs rounded">
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* Mapeamento minimalista */}
          <div className="mb-4 p-4 bg-dark-700/50 rounded-lg">
            <p className="text-sm text-dark-300 mb-3">Associe as colunas da planilha aos campos do sistema:</p>
            {['nome','telefone'].map((target) => (
              <div key={target} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center mb-3">
                <label className="text-sm text-white md:text-right md:pr-4 capitalize">
                  {target} {['nome','telefone'].includes(target) && <span className="text-red-400">*</span>}
                </label>
                <select
                  className="input-field md:col-span-2"
                  value={columnMap[target] || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setColumnMap(prev => ({ ...prev, [target]: value }));
                  }}
                >
                  <option value="">Selecione a coluna...</option>
                  {Object.keys(previewData[0]).map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="mt-6 pt-4 border-t border-dark-600">
              <h5 className="text-sm font-medium text-white mb-3">Colunas opcionais (até 3)</h5>
              {[0,1,2].map((idx) => (
                <div key={`opt-${idx}`} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center mb-3">
                  <input
                    type="text"
                    placeholder={`Nome da coluna opcional ${idx+1}`}
                    className="input-field"
                    value={customMappings[idx]?.name || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomMappings(prev => {
                        const next = [...prev];
                        next[idx] = { ...(next[idx] || {}), name: val };
                        return next;
                      });
                    }}
                  />
                  <select
                    className="input-field md:col-span-2"
                    value={customMappings[idx]?.source || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomMappings(prev => {
                        const next = [...prev];
                        next[idx] = { ...(next[idx] || {}), source: val };
                        return next;
                      });
                    }}
                  >
                    <option value="">Fonte da planilha...</option>
                    {previewData[0] && Object.keys(previewData[0]).map((col) => (
                      <option key={`src-${idx}-${col}`} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
              <p className="text-xs text-dark-400">Estas colunas são opcionais e podem ser referenciadas nas mensagens com {`{nome_da_coluna}`}</p>
            </div>
          </div>

          {/* Opções de Envio */}
          <div className="mb-4 p-4 bg-dark-700/50 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-3">Opções de Envio</h4>
            <div className="flex flex-wrap items-center gap-6 mb-3">
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={sendTextEnabled}
                  onChange={(e) => setSendTextEnabled(e.target.checked)}
                />
                <span>Enviar mensagem (1)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={sendFileEnabled}
                  onChange={(e) => setSendFileEnabled(e.target.checked)}
                />
                <span>Enviar arquivo (2)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={sendImageEnabled}
                  onChange={(e) => setSendImageEnabled(e.target.checked)}
                />
                <span>Enviar imagem (3)</span>
              </label>
            </div>
            {sendFileEnabled && (
              <div className="mt-2 space-y-4">
                <div>
                  <div className="text-sm text-white mb-2">Link do arquivo (2) — URL pública com preview</div>
                  <input
                    type="url"
                    className="input-field w-full"
                    placeholder="https://exemplo.com/arquivo.pdf (link direto)"
                    value={fileUrlForSend}
                    onChange={(e) => setFileUrlForSend(e.target.value)}
                  />
                  <div className="text-xs text-dark-400 mt-1">O link será enviado como texto com preview de alta qualidade.</div>
                </div>
              </div>
            )}
            {sendImageEnabled && (
              <div className="mt-2 space-y-4">
                <div>
                  <div className="text-sm text-white mb-2">Link da imagem (3) — URL pública com preview</div>
                  <input
                    type="url"
                    className="input-field w-full"
                    placeholder="https://exemplo.com/imagem.jpg (link direto)"
                    value={imageUrlForSend}
                    onChange={(e) => setImageUrlForSend(e.target.value)}
                  />
                  <div className="text-xs text-dark-400 mt-1">A imagem será enviada como texto com preview de alta qualidade.</div>
                </div>
              </div>
            )}
          </div>

          {/* Template da Mensagem (1) */}
          {sendTextEnabled && (
          <div className="mb-4 p-4 bg-dark-700/50 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-3">Mensagem de texto inicial (1)</h4>
            <div className="space-y-3">
              <div>
                <textarea
                  className="w-full h-32 bg-dark-600 border border-dark-500 rounded-lg p-3 text-white placeholder-dark-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="Digite a mensagem. Use chaves para variáveis: por exemplo {nome}, {empresa} ou qualquer {nome da coluna} presente na planilha."
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleSaveMessage}
                  disabled={savingTemplate || !messageTemplate.trim()}
                  className={`px-4 py-2 rounded ${savingTemplate || !messageTemplate.trim() ? 'bg-dark-600 text-dark-300 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-500'}`}
                >
                  {savingTemplate ? 'Salvando...' : 'Salvar mensagem'}
                </button>
              </div>
              {/* Mensagens salvas */}
              <div className="mt-4">
                <h5 className="text-sm font-medium text-white mb-2">Mensagens salvas</h5>
                {loadingTemplates && (
                  <div className="text-sm text-dark-300">Carregando...</div>
                )}
                {templatesError && (
                  <div className="text-sm text-red-400">{templatesError}</div>
                )}
                {!loadingTemplates && !templatesError && (
                  <div className="space-y-2 max-h-48 overflow-auto pr-2">
                    {savedTemplates.length === 0 && (
                      <div className="text-sm text-dark-300">Nenhuma mensagem salva encontrada.</div>
                    )}
                    {savedTemplates.map((t) => (
                      <div key={t.id} className="p-2 bg-dark-600 rounded flex items-center justify-between gap-3">
                        <div className="text-sm text-dark-200 truncate">
                          <span className="text-primary-400 mr-2">[{new Date(t.created_at).toLocaleString()}]</span>
                          {t.titulo ? `${t.titulo}: ` : ''}{t.conteudo}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-500"
                            onClick={() => setMessageTemplate(t.conteudo || '')}
                          >Usar</button>
                          <button
                            className="p-1 text-xs bg-red-600 text-white rounded hover:bg-red-500"
                            title="Apagar"
                            onClick={() => handleDeleteTemplate(t.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
              <div className="text-sm text-dark-300">
                <p className="mb-2">Variáveis disponíveis (use entre chaves):</p>
                <div className="flex flex-wrap gap-2">
                  {['nome','telefone'].map((k) => (
                    <span key={`std-${k}`} className="px-2 py-1 bg-dark-600 text-primary-400 rounded">{k}</span>
                  ))}
                  {customMappings.filter(m => m?.name).map((m, idx) => (
                    <span key={`cmv-${idx}`} className="px-2 py-1 bg-dark-600 text-primary-400 rounded">{m.name}</span>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <h5 className="text-sm font-medium text-white mb-2">Prévia da mensagem:</h5>
                <div className="p-3 bg-dark-600 rounded-lg text-dark-300 text-sm">
                  {messagePreview || 'Digite uma mensagem para ver a prévia...'}
                </div>
              </div>

              {/* Mensagem adicional (1.2) */}
              <div className="mt-6 border-t border-dark-600 pt-4">
                <label className="flex items-center gap-2 text-sm text-white mb-2">
                  <input
                    type="checkbox"
                    checked={sendText2Enabled}
                    onChange={(e) => setSendText2Enabled(e.target.checked)}
                  />
                  <span>Ativar mensagem inicial adicional (1.2)</span>
                </label>
                {sendText2Enabled && (
                  <div className="space-y-3">
                    <textarea
                      className="w-full h-28 bg-dark-600 border border-dark-500 rounded-lg p-3 text-white placeholder-dark-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                      placeholder="Digite a segunda mensagem inicial. Suporta variáveis {nome}, {empresa}, etc."
                      value={messageTemplate2}
                      onChange={(e) => setMessageTemplate2(e.target.value)}
                    />
                    <div className="p-3 bg-dark-600 rounded-lg text-dark-300 text-sm">
                      {messagePreview2 || 'Escreva para visualizar a prévia...'}
                    </div>
                  </div>
                )}
              </div>

              {/* Mensagem adicional (1.3) */}
              <div className="mt-6 border-t border-dark-600 pt-4">
                <label className="flex items-center gap-2 text-sm text-white mb-2">
                  <input
                    type="checkbox"
                    checked={sendText3Enabled}
                    onChange={(e) => setSendText3Enabled(e.target.checked)}
                  />
                  <span>Ativar mensagem inicial adicional (1.3)</span>
                </label>
                {sendText3Enabled && (
                  <div className="space-y-3">
                    <textarea
                      className="w-full h-28 bg-dark-600 border border-dark-500 rounded-lg p-3 text-white placeholder-dark-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                      placeholder="Digite a terceira mensagem inicial. Suporta variáveis {nome}, etc."
                      value={messageTemplate3}
                      onChange={(e) => setMessageTemplate3(e.target.value)}
                    />
                    <div className="p-3 bg-dark-600 rounded-lg text-dark-300 text-sm">
                      {messagePreview3 || 'Escreva para visualizar a prévia...'}
                    </div>
                  </div>
                )}
              </div>

              {/* Mensagens salvas (conjuntos) e Variáveis disponíveis movidos para baixo da 1.3 */}
              <div className="mt-6 border-t border-dark-600 pt-4">
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={async () => {
                        try {
                          setSavingMessageSet(true);
                          const msgs = [];
                          if (sendTextEnabled && messageTemplate.trim()) msgs.push({ index: 1, text: messageTemplate.trim() });
                          if (sendText2Enabled && messageTemplate2.trim()) msgs.push({ index: 2, text: messageTemplate2.trim() });
                          if (sendText3Enabled && messageTemplate3.trim()) msgs.push({ index: 3, text: messageTemplate3.trim() });
                          if (msgs.length === 0) { toast.error('Adicione ao menos uma mensagem para salvar.'); setSavingMessageSet(false); return; }
                          const title = `Conjunto ${new Date().toLocaleString()}`;
                          const res = await database.saveMessageSet({ title, messages: msgs.map(m => m.text) });
                          if (!res.success) throw new Error(res.error || 'Falha ao salvar conjunto');
                          toast.success('Conjunto de mensagens salvo!');
                          // Recarregar lista
                          const list = await database.getMessageSets(100);
                          if (list.success) setSavedMessageSets(list.data || []);
                          setMessageSetsError(list.success ? '' : (list.error || ''));
                        } catch (err) {
                          toast.error(String(err?.message || err));
                        } finally {
                          setSavingMessageSet(false);
                        }
                      }}
                      disabled={savingMessageSet}
                      className={`px-4 py-2 rounded ${savingMessageSet ? 'bg-dark-600 text-dark-300 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-500'}`}
                    >{savingMessageSet ? 'Salvando...' : 'Salvar conjunto de mensagens'}</button>
                  </div>
                  <h5 className="text-sm font-medium text-white mb-2">Conjuntos de mensagens salvos</h5>
                  {loadingMessageSets && <div className="text-sm text-dark-300">Carregando...</div>}
                  {messageSetsError && <div className="text-sm text-red-400">{messageSetsError}</div>}
                  {!loadingMessageSets && !messageSetsError && (
                    <div className="space-y-2 max-h-48 overflow-auto pr-2">
                      {savedMessageSets.length === 0 && (
                        <div className="text-sm text-dark-300">Nenhum conjunto salvo encontrado.</div>
                      )}
                      {savedMessageSets.map((t) => {
                        const count = Array.isArray(t.conteudos) ? t.conteudos.length : (Array.isArray(t.conteudos_json) ? t.conteudos_json.length : (t.count || 0));
                        const first = Array.isArray(t.conteudos) ? t.conteudos[0] : (Array.isArray(t.conteudos_json) ? t.conteudos_json[0] : t.preview || '');
                        return (
                          <div key={t.id} className="p-2 bg-dark-600 rounded flex items-center justify-between gap-3">
                            <div className="text-sm text-dark-200 truncate">
                              <span className="text-primary-400 mr-2">[{new Date(t.created_at).toLocaleString()}]</span>
                              {t.titulo ? `${t.titulo}: ` : ''}{String(first || '').slice(0, 80)}... <span className="text-dark-400">({count} mensagens)</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-500"
                                onClick={() => {
                                  const arr = Array.isArray(t.conteudos) ? t.conteudos : (Array.isArray(t.conteudos_json) ? t.conteudos_json : []);
                                  setSendTextEnabled(Boolean(arr[0]));
                                  setSendText2Enabled(Boolean(arr[1]));
                                  setSendText3Enabled(Boolean(arr[2]));
                                  setMessageTemplate(arr[0] || '');
                                  setMessageTemplate2(arr[1] || '');
                                  setMessageTemplate3(arr[2] || '');
                                  toast.success('Conjunto aplicado nas mensagens 1, 2 e 3');
                                }}
                              >Usar</button>
                              <button
                                className="p-1 text-xs bg-red-600 text-white rounded hover:bg-red-500"
                                title="Apagar"
                                onClick={async () => {
                                  try {
                                    const del = await database.deleteMessageSet(t.id);
                                    if (!del.success) throw new Error(del.error || 'Falha ao apagar conjunto');
                                    setSavedMessageSets(prev => prev.filter(x => x.id !== t.id));
                                    toast.success('Conjunto apagado');
                                  } catch (err) {
                                    toast.error(String(err?.message || err));
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="text-sm text-dark-300">
                  <p className="mb-2">Variáveis disponíveis (use entre chaves):</p>
                  <div className="flex flex-wrap gap-2">
                    {['nome','telefone'].map((k) => (
                      <span key={`std-${k}`} className="px-2 py-1 bg-dark-600 text-primary-400 rounded">{k}</span>
                    ))}
                    {customMappings.filter(m => m?.name).map((m, idx) => (
                      <span key={`cmv-${idx}`} className="px-2 py-1 bg-dark-600 text-primary-400 rounded">{m.name}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Preview mapeado (como será inserido) */}
          <div className="bg-dark-700/50 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-dark-800/50">
              <h4 className="text-sm font-medium text-white">Prévia dos dados mapeados (primeiras 10 linhas)</h4>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-dark-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-dark-300 uppercase">nome</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-dark-300 uppercase">telefone</th>
                    {customMappings.filter(m => m?.name).map((m, i) => (
                      <th key={`custom-h-${i}`} className="px-3 py-2 text-left text-xs font-medium text-dark-300 uppercase">{m.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600">
                  {mappedPreview.map((row, idx) => (
                    <tr key={idx} className="hover:bg-dark-600/50">
                      <td className="px-3 py-2 text-sm text-dark-300 max-w-xs truncate" title={row.nome}>{row.nome || '-'}</td>
                      <td className="px-3 py-2 text-sm text-dark-300 max-w-xs truncate" title={row.telefone}>{row.telefone || '-'}</td>
                      {customMappings.filter(m => m?.name && m?.source).map((m, i) => (
                        <td key={`custom-c-${idx}-${i}`} className="px-3 py-2 text-sm text-dark-300 max-w-xs truncate" title={row[m.name]}>{row[m.name] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Botões de ação */}
      <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-dark-700">
        <button
          onClick={onClose}
          className="btn-secondary flex-1"
        >
          Cancelar
        </button>
        <button
          onClick={handleUpload}
          disabled={!file || previewData.length === 0 || errors.length > 0 || uploading}
          className="btn-primary flex-1 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              <span>Alimentar Planilha ({previewData.length} registros)</span>
            </>
          )}
        </button>
      </div>

      {/* Informações adicionais */}
      <div className="mt-6 p-4 bg-dark-700/50 rounded-lg">
        <div className="flex items-start space-x-3">
          <CheckCircle className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-dark-300">
            <p className="font-medium text-white mb-1">Envio Direto</p>
            <p>As mensagens serão enviadas diretamente via WhatsApp API, sem salvar nada no banco de dados.</p>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação */}
      {showConfirmation && confirmationData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmation(false)}>
          <div className="bg-dark-800 rounded-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              </div>
              <h3 className="text-lg font-semibold text-white">Análise antes do envio</h3>
              <button aria-label="Fechar" onClick={() => setShowConfirmation(false)} className="ml-auto p-2 rounded hover:bg-dark-700/60">
                <X className="w-4 h-4 text-dark-200" />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <p className="text-dark-300">
                Verificamos toda a planilha para identificar números possivelmente inválidos.
              </p>
              
              <div className="bg-dark-700/50 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium text-white mb-3">Resumo da análise:</h4>
                
                <div className="space-y-2">
                  {confirmationData.stats.numerosCurtos > 0 && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-sm text-dark-300">
                        <span className="text-orange-400 font-semibold">{confirmationData.stats.numerosCurtos}</span> números têm menos de 7 dígitos
                      </span>
                    </div>
                  )}
                  {confirmationData.stats.duplicados > 0 && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <span className="text-sm text-dark-300">
                        <span className="text-yellow-300 font-semibold">{confirmationData.stats.duplicados}</span> números duplicados encontrados
                      </span>
                    </div>
                  )}
                  
                  {/* Removido: não exibir emails faltantes */}
                </div>
                
                {/* Nota removida: não usamos mais EMPTY */}
              </div>
              
              <div className="bg-dark-700/50 rounded-lg p-4">
                <label className="inline-flex items-center space-x-3">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-primary-500"
                    checked={addBrazilPrefix}
                    onChange={(e) => setAddBrazilPrefix(e.target.checked)}
                  />
                  <span className="text-sm text-white">Colocar 55 na frente de todos os números</span>
                </label>
                <p className="text-xs text-dark-400 mt-2">Quando marcado, adicionaremos 55 aos números que não começarem com 55.</p>
                {confirmationData.stats.duplicados > 0 && (
                  <div className="mt-4">
                    <label className="inline-flex items-center space-x-3">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-primary-500"
                        checked={removeDuplicates}
                        onChange={(e) => setRemoveDuplicates(e.target.checked)}
                      />
                      <span className="text-sm text-white">Excluir números duplicados</span>
                    </label>
                    <p className="text-xs text-dark-400 mt-2">Mantém apenas a primeira ocorrência de cada telefone.</p>
                  </div>
                )}
                <div className="mt-4">
                  <label className="inline-flex items-center space-x-3">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-primary-500"
                      checked={validateWithNine}
                      onChange={(e) => setValidateWithNine(e.target.checked)}
                    />
                    <span className="text-sm text-white">Validação por 9 (enviar 2 vezes)</span>
                  </label>
                  <p className="text-xs text-dark-400 mt-2">Quando ativado, cada lead recebe duas mensagens: primeiro com o dígito "9" após o DDD e, em seguida, sem o "9".</p>
                  <p className="text-xs text-dark-400">Ordem automática: variante com 11 dígitos primeiro (provável celular), depois a de 10 dígitos.</p>
                </div>

                <div className="mt-4">
                  <label className="inline-flex items-center space-x-3">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-primary-500"
                      checked={autoFillDDD}
                      onChange={(e) => setAutoFillDDD(e.target.checked)}
                    />
                    <span className="text-sm text-white">Auto preenchimento de DDD</span>
                  </label>
                  <p className="text-xs text-dark-400 mt-2">Se o número tiver 8 ou 9 dígitos, adicionamos automaticamente o DDD selecionado.</p>
                  <div className="mt-2">
                    <select
                      className="input-field w-full"
                      disabled={!autoFillDDD}
                      value={selectedDDD}
                      onChange={(e) => setSelectedDDD(e.target.value)}
                    >
                      <option value="">Selecione o DDD...</option>
                      {DDD_LIST.map(opt => (
                        <option key={opt.value + opt.label} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-dark-700/30 rounded-lg p-3">
                <p className="text-sm text-dark-300">
                  Total de registros: <span className="text-white font-semibold">{confirmationData.stats.total}</span>
                </p>
                <div className="mt-2 text-xs text-dark-300">
                  Modo sem banco ativo. Os envios serão gerenciados em memória com sincronização em tempo real no painel.
                </div>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-3 mt-3">
                <label className="text-sm text-white mb-2 block">Intervalo de envio:</label>
                <select
                  className="input-field"
                  value={getIntervalSelectValue()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith('fixed-')) {
                      setUseRandomInterval(false);
                      setSendIntervalSeconds(Number(v.split('-')[1]));
                    } else {
                      const parts = v.split('-');
                      const min = Number(parts[1]);
                      const max = Number(parts[2]);
                      setUseRandomInterval(true);
                      setRandomIntervalRange({ min, max });
                    }
                  }}
                >
                  <optgroup label="Fixo">
                    <option value="fixed-10">10s</option>
                    <option value="fixed-30">30s</option>
                    <option value="fixed-60">1m</option>
                    <option value="fixed-120">2m</option>
                  </optgroup>
                  <optgroup label="Aleatório">
                    <option value="rand-10-50">10s ~ 50s</option>
                    <option value="rand-30-60">30s ~ 1m</option>
                    <option value="rand-60-120">1m ~ 2m</option>
                    <option value="rand-180-300">3m ~ 5m</option>
                  </optgroup>
                </select>
                <p className="text-xs text-dark-400 mt-2">Selecione um intervalo fixo ou aleatório. Padrão 1 minuto.</p>
                <p className="text-xs text-dark-300 mt-1">
                  Estimativa de duração: 
                  <span className="text-white font-semibold ml-1">{formatSeconds(estimatedSecondsRemaining())}</span>
                  {' '}para {confirmationData?.stats?.total || 0} registros
                  {useRandomInterval && (
                    <span className="text-dark-400"> (média entre {randomIntervalRange.min}s e {randomIntervalRange.max}s)</span>
                  )}.
                </p>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-4 py-2 bg-dark-600 text-dark-300 rounded-lg hover:bg-dark-500 transition-colors"
              >
                Cancelar
              </button>
              {/* Removido botão "Preparar base" */}
              <button
                onClick={confirmUpload}
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Começar envio
              </button>
            </div>
            {/* Removido aviso de preparação de base */}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadCSV;
