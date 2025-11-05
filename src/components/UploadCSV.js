import React, { useState, useRef, useMemo, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Eye, EyeOff, AlertTriangle, Send } from 'lucide-react';
import { processCSVFile, processXLSXFile } from '../lib/utils';
import { wahaApi } from '../lib/waha';
import toast from 'react-hot-toast';

const UploadCSV = ({ onClose }) => {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [columnMap, setColumnMap] = useState({ nome: '', empresa: '', email: '', telefone: '' });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [errors, setErrors] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [addBrazilPrefix, setAddBrazilPrefix] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [messagePreview, setMessagePreview] = useState('');
  // Envio em lote: intervalo e telas de envio
  const [sendIntervalSeconds, setSendIntervalSeconds] = useState(60); // default 1m
  const [showSendingScreen, setShowSendingScreen] = useState(false);
  const [pendingList, setPendingList] = useState([]);
  const [sentList, setSentList] = useState([]);
  const [sendingPaused, setSendingPaused] = useState(false);
  const sendWorkerRef = useRef(null);
  const sendAbortRef = useRef(false);
  const [nextCountdown, setNextCountdown] = useState(0);
  const pendingListRef = useRef([]);
  const maxRetries = 3;

  // Função para gerar prévia da mensagem
  const generateMessagePreview = useMemo(() => {
    if (!messageTemplate || !previewData || previewData.length === 0) return '';
    
    const firstRow = previewData[0];
    const nome = columnMap.nome ? (firstRow[columnMap.nome] || 'NOME') : 'NOME';
    const empresa = columnMap.empresa ? (firstRow[columnMap.empresa] || 'EMPRESA') : 'EMPRESA';

    return messageTemplate
      .replace(/{nome}/g, nome)
      .replace(/{empresa}/g, empresa);
  }, [messageTemplate, previewData, columnMap]);

  // Atualiza a prévia quando o template muda
  useEffect(() => {
    setMessagePreview(generateMessagePreview);
  }, [generateMessagePreview]);

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
        nome: row[mapField('nome')] || '',
        empresa: row[mapField('empresa')] || '',
        email: row[mapField('email')] || '',
        telefone: telefoneRaw,
  
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
    const stats = {
      total: correctedData.length,
      numerosCurtos: correctedData.filter(row => String(row.telefone || '').replace(/\D/g, '').length > 0 && String(row.telefone || '').replace(/\D/g, '').length < 7).length
    };

    // Se houver telefones vazios, mostrar modal de confirmação
    setConfirmationData({ data: correctedData, stats });
    setShowConfirmation(true);
  };

  // Ao confirmar upload, abrimos a tela de envio e iniciamos o worker (sem banco)
  const confirmUpload = async () => {
    if (!confirmationData) return;

    // Abrir tela de envio imediatamente (o usuário solicitou que a tela abra na segunda confirmação)
    // Fechar modal de confirmação para revelar a tela de envio
    setShowConfirmation(false);
    pendingListRef.current = [...(confirmationData.data || [])];
    setPendingList(pendingListRef.current);
    setSentList([]);
    setShowSendingScreen(true);
    setSendingPaused(false);
    toast.success('Iniciando envio...');
    startSendingWorker();
  };

  // Função que processa o envio item a item respeitando o intervalo e permitindo pausa
  const startSendingWorker = () => {
    // evitar múltiplos workers
    if (sendWorkerRef.current) return;
    sendAbortRef.current = false;

    const awaitIntervalCountdown = async () => {
      // aguarda o intervalo e atualiza contagem regressiva visível
      for (let t = sendIntervalSeconds; t > 0 && !sendAbortRef.current; t--) {
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

    const worker = async () => {
      while (!sendAbortRef.current) {
        if (sendingPaused) {
          // aguardar 500ms e checar novamente
          // eslint-disable-next-line no-await-in-loop
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        // pegar próximo item
        let next;
        if (!pendingListRef.current || pendingListRef.current.length === 0) {
          next = null;
        } else {
          next = pendingListRef.current.shift();
          setPendingList([...pendingListRef.current]);
        }

        if (!next) break;

        // construir mensagem personalizada
        const personalized = messageTemplate
          .replace(/{nome}/g, next.nome || 'Cliente')
          .replace(/{empresa}/g, next.empresa || '');

        // Retry automático
        let attempt = 0;
        let sent = false;
        let lastError = null;
        // validação local: pular números com menos de 7 dígitos
        const onlyDigits = String(next.telefone || '').replace(/\D/g, '');
        if (!onlyDigits || onlyDigits.length < 7) {
          setSentList(prev => [
            ...prev,
            { ...next, status: 'skipped', reason: 'telefone curto', message: personalized, sentAt: new Date().toISOString(), attempts: 0 }
          ]);
          // aguardar o intervalo e continuar
          // eslint-disable-next-line no-await-in-loop
          await awaitIntervalCountdown();
          continue;
        }

        while (attempt < maxRetries && !sent && !sendAbortRef.current) {
          try {
            // eslint-disable-next-line no-await-in-loop
      await wahaApi.sendMessage(next.telefone, personalized);
            sent = true;
            setSentList(prev => [...prev, { ...next, status: 'sent', message: personalized, sentAt: new Date().toISOString(), attempts: attempt + 1 }]);
          } catch (err) {
            attempt += 1;
            lastError = err;
            // pequeno backoff entre tentativas
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }
        }

        if (!sent) {
          setSentList(prev => [...prev, { ...next, status: 'error', error: (lastError && lastError.message) || String(lastError), message: personalized, attempts: attempt, sentAt: new Date().toISOString() }]);
        }

        // aguardar intervalo configurado com contagem regressiva
        // eslint-disable-next-line no-await-in-loop
        await awaitIntervalCountdown();
      }

      sendWorkerRef.current = null;
    };

    sendWorkerRef.current = worker();
  };

  const pauseSending = () => setSendingPaused(true);
  const resumeSending = () => setSendingPaused(false);
  const stopSending = () => {
    sendAbortRef.current = true;
    setSendingPaused(true);
    sendWorkerRef.current = null;
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

  const estimatedSecondsRemaining = () => {
    // estimativa simples: quantidade pendente * intervalo
    return pendingList.length * sendIntervalSeconds;
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
            <div className="col-span-1 flex flex-col items-center justify-center space-y-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-28 h-28 rounded-full bg-primary-500/10 flex items-center justify-center">
                  <Send className="w-12 h-12 text-primary-400" />
                </div>
              <div className="text-center">
                <div className="text-sm text-dark-300">Pendentes: <span className="text-white font-semibold">{pendingList.length}</span></div>
                <div className="text-sm text-dark-300">Enviadas: <span className="text-white font-semibold">{sentList.length}</span></div>
                <div className="text-sm text-dark-300">Próximo envio em: <span className="text-white font-semibold">{formatSeconds(nextCountdown)}</span></div>
              </div>
              </div>

                <div className="flex flex-col items-center space-y-3">
                  <div className="text-sm text-dark-300">ETA estimado: <span className="text-white font-semibold">{formatSeconds(estimatedSecondsRemaining())}</span></div>
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
                </div>

              <div className="text-sm text-dark-300">
                Intervalo: <span className="text-white font-semibold">{sendIntervalSeconds}s</span>
              </div>
            </div>

            {/* Direita: preview sendo criado (enviadas) */}
            <div className="col-span-1 bg-dark-800/40 rounded-lg p-3 overflow-y-auto max-h-[70vh]">
              <h4 className="text-sm font-medium text-white mb-3">Mensagens Enviadas</h4>
              <div className="text-xs text-dark-300 mb-2">Total: {sentList.length}</div>
              <ul className="space-y-2">
                {sentList.map((item, idx) => (
                  <li key={idx} className={`p-2 rounded ${item.status === 'sent' ? 'bg-dark-700/30' : 'bg-red-700/20'}`}>
                    <div className="text-sm text-white truncate">{item.nome || '-' } • {item.telefone}</div>
                    <div className="text-xs text-dark-300 mt-1">{item.message}</div>
                    <div className="text-xs text-dark-400 mt-1">{item.status === 'sent' ? `Enviado em ${new Date(item.sentAt).toLocaleString()}` : `Erro: ${item.error}`}</div>
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
            {['nome','empresa','email','telefone'].map((target) => (
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

          </div>

          {/* Template da Mensagem */}
          <div className="mb-4 p-4 bg-dark-700/50 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-3">Mensagem para Envio</h4>
            <div className="space-y-3">
              <div>
                <textarea
                  className="w-full h-32 bg-dark-600 border border-dark-500 rounded-lg p-3 text-white placeholder-dark-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="Digite aqui a mensagem que será enviada para os leads. Use {nome} para incluir o nome e {empresa} para incluir a empresa do lead."
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                />
              </div>
              <div className="text-sm text-dark-300">
                <p className="mb-2">Variáveis disponíveis:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-dark-600 text-primary-400 rounded">{"{nome}"}</span>
                  <span className="px-2 py-1 bg-dark-600 text-primary-400 rounded">{"{empresa}"}</span>
                </div>
              </div>
              <div className="mt-4">
                <h5 className="text-sm font-medium text-white mb-2">Prévia da mensagem:</h5>
                <div className="p-3 bg-dark-600 rounded-lg text-dark-300 text-sm">
                  {messagePreview || 'Digite uma mensagem para ver a prévia...'}
                </div>
              </div>
            </div>
          </div>

          {/* Preview mapeado (como será inserido) */}
          <div className="bg-dark-700/50 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-dark-800/50">
              <h4 className="text-sm font-medium text-white">Prévia dos dados mapeados (primeiras 10 linhas)</h4>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-dark-800/50">
                  <tr>
                    {['nome','empresa','email','telefone'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-dark-300 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600">
                  {mappedPreview.map((row, idx) => (
                    <tr key={idx} className="hover:bg-dark-600/50">
                      <td className="px-3 py-2 text-sm text-dark-300 max-w-xs truncate" title={row.nome}>
                        {row.nome || '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-dark-300 max-w-xs truncate" title={row.empresa}>
                        {row.empresa || '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-dark-300 max-w-xs truncate" title={row.email}>
                        {row.email || '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-dark-300 max-w-xs truncate" title={row.telefone}>
                        {row.telefone || '-'}
                      </td>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              </div>
              <h3 className="text-lg font-semibold text-white">Análise antes do envio</h3>
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
              </div>

              <div className="bg-dark-700/30 rounded-lg p-3">
                <p className="text-sm text-dark-300">
                  Total de registros: <span className="text-white font-semibold">{confirmationData.stats.total}</span>
                </p>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-3 mt-3">
                <label className="text-sm text-white mb-2 block">Intervalo de envio (opcional):</label>
                <select
                  value={sendIntervalSeconds}
                  onChange={(e) => setSendIntervalSeconds(Number(e.target.value))}
                  className="input-field"
                >
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={120}>2m</option>
                </select>
                <p className="text-xs text-dark-400 mt-2">Defina o intervalo entre envios. Padrão 1 minuto.</p>
                <p className="text-xs text-dark-300 mt-1">
                  Estimativa de duração: 
                  <span className="text-white font-semibold ml-1">
                    {formatSeconds((confirmationData?.stats?.total || 0) * sendIntervalSeconds)}
                  </span>
                  {' '}para {confirmationData?.stats?.total || 0} registros.
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
              <button
                onClick={confirmUpload}
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Enviando...' : 'Confirmar e Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadCSV;
