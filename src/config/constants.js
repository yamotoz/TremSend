// Constantes do sistema METROBYTE

export const APP_CONFIG = {
  name: 'METROBYTE',
  version: '1.0.0',
  description: 'Interface de Gerenciamento de Dados',
  author: 'Equipe METROBYTE'
};

export const VALIDATION_RULES = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Email inválido'
  },
  phone: {
    pattern: /^\d{10,11}$/,
    message: 'Telefone deve ter 10 ou 11 dígitos'
  },
  name: {
    minLength: 2,
    message: 'Nome deve ter pelo menos 2 caracteres'
  },
  company: {
    minLength: 1,
    message: 'Nome da empresa é obrigatório'
  }
};

export const FILE_LIMITS = {
  csv: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['.csv'],
    message: 'Arquivo muito grande. Tamanho máximo: 10MB'
  }
};

export const TABLE_CONFIG = {
  leads: {
    name: 'leads',
    displayName: 'Leads',
    primaryKey: 'id'
  },
  pesquisa: {
    name: 'pesquisa',
    displayName: 'Pesquisa',
    primaryKey: 'id'
  }
};

export const SOURCE_TYPES = {
  MANUAL: 'Manual',
  CSV_UPLOAD: 'CSV Upload',
  RD_STATION: 'RD Station',
  APOLLO: 'Apollo',
  OUTROS: 'Outros'
};

export const STATUS_TYPES = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  CONVERTIDO: 'Convertido',
  DESCARTADO: 'Descartado'
};

export const UI_CONFIG = {
  animations: {
    duration: 300,
    easing: 'ease-in-out'
  },
  colors: {
    primary: '#0ea5e9',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6'
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px'
  }
};

export const MESSAGES = {
  success: {
    dataInserted: 'Dados inseridos com sucesso! ✅',
    dataUpdated: 'Dados atualizados com sucesso! ✅',
    dataDeleted: 'Dados removidos com sucesso! ✅',
    fileUploaded: 'Arquivo enviado com sucesso! ✅',
    fileDownloaded: 'Download iniciado com sucesso! ✅',
    loginSuccess: 'Login realizado com sucesso! ✅',
    logoutSuccess: 'Logout realizado com sucesso! ✅'
  },
  error: {
    invalidCredentials: 'Credenciais inválidas. Tente novamente.',
    networkError: 'Erro de conexão. Verifique sua internet.',
    serverError: 'Erro interno do servidor. Tente novamente.',
    validationError: 'Por favor, corrija os erros no formulário.',
    fileError: 'Erro ao processar arquivo.',
    duplicateError: 'Este email ou telefone já existe no sistema.',
    emptyFile: 'Nenhum arquivo selecionado.',
    invalidFileType: 'Tipo de arquivo inválido. Use apenas CSV.',
    fileTooLarge: 'Arquivo muito grande. Tamanho máximo: 10MB.',
    noData: 'Nenhum dado disponível.',
    unexpectedError: 'Erro inesperado. Tente novamente.'
  },
  info: {
    loading: 'Carregando...',
    processing: 'Processando...',
    uploading: 'Enviando...',
    downloading: 'Baixando...',
    validating: 'Validando dados...',
    checkingDuplicates: 'Verificando duplicatas...'
  }
};

export const CSV_COLUMNS = {
  required: ['nome', 'empresa', 'email', 'telefone'],
  optional: ['observacoes', 'status', 'origem'],
  mapping: {
    'nome': ['name', 'nome', 'nome_completo', 'full_name'],
    'empresa': ['company', 'empresa', 'empresa_nome', 'company_name'],
    'email': ['email', 'e_mail', 'mail'],
    'telefone': ['phone', 'telefone', 'telephone', 'celular', 'mobile'],
    'origem': ['source', 'origem', 'fonte', 'campaign'],
    'observacoes': ['notes', 'observacoes', 'comentarios', 'comments']
  }
};

export const PAGINATION = {
  defaultPageSize: 10,
  maxPageSize: 100,
  pageSizeOptions: [5, 10, 25, 50, 100]
};

export const CACHE_CONFIG = {
  ttl: 5 * 60 * 1000, // 5 minutos
  maxSize: 100, // máximo 100 itens
  keys: {
    leads: 'metrobyte_leads',
    pesquisa: 'metrobyte_pesquisa',
    stats: 'metrobyte_stats'
  }
};

export const API_ENDPOINTS = {
  auth: {
    login: '/auth/v1/token',
    logout: '/auth/v1/logout',
    user: '/auth/v1/user'
  },
  database: {
    leads: '/rest/v1/leads',
    pesquisa: '/rest/v1/pesquisa',
    logs: '/rest/v1/operation_logs'
  }
};

export const FEATURE_FLAGS = {
  enableDuplicatesCheck: true,
  enableDataValidation: true,
  enableFilePreview: true,
  enableRealTimeStats: true,
  enableOperationLogs: true,
  enableDarkMode: true,
  enableAnimations: true
};
