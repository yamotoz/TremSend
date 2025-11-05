// Funções utilitárias para o projeto

// Converter dados para CSV
export const convertToCSV = (data) => {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escapar aspas e vírgulas
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      }).join(',')
    )
  ].join('\n');

  return csvContent;
};

// Download de arquivo CSV
export const downloadCSV = (data, filename = 'dados.csv') => {
  const csvContent = convertToCSV(data);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// Validar email
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Validar telefone brasileiro
export const validatePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 13;
};

// Formatar telefone
export const formatPhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

// Formatar telefone com padrão internacional brasileiro: +55 DD 9XXXX-XXXX
export const formatBrazilInternationalPhone = (input) => {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 0) return '';

  // Forçar formatação apenas quando começar com 55
  if (!digits.startsWith('55')) {
    return digits; // retorna como está (sem símbolos) até usuário digitar 55
  }

  const country = '+55';
  const afterCountry = digits.slice(2);
  const ddd = afterCountry.slice(0, 2);
  const local = afterCountry.slice(2);

  if (afterCountry.length <= 0) return `${country}`;
  if (afterCountry.length <= 2) return `${country} ${ddd}`;

  // Local pode ter 8 (fixo) ou 9 (móvel) dígitos. Quebrar em 5-4 se >= 9
  if (local.length <= 4) {
    return `${country} ${ddd} ${local}`;
  }

  if (local.length <= 5) {
    return `${country} ${ddd} ${local}`;
  }

  // Quando >= 6, aplicar formatação 5-4 (prioriza padrão móvel 9 dígitos)
  const first = local.slice(0, Math.min(5, local.length - 4));
  const last = local.slice(first.length, first.length + 4);
  const remainder = local.slice(first.length + 4);
  const base = `${country} ${ddd} ${first}${last ? '-' + last : ''}`;
  return remainder ? base + remainder : base;
};

// Processar arquivo CSV
export const processCSVFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const Papa = require('papaparse');
        
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0) {
              console.warn('Avisos do CSV:', results.errors);
            }
            
            // Filtrar linhas vazias e limpar dados
            const data = results.data
              .filter(row => Object.values(row).some(value => value && value.toString().trim()))
              .map(row => {
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                  cleanRow[key] = row[key] ? row[key].toString().trim() : '';
                });
                return cleanRow;
              });

            resolve(data);
          },
          error: (error) => {
            reject(new Error('Erro ao processar arquivo CSV: ' + error.message));
          }
        });
      } catch (error) {
        reject(new Error('Erro ao processar arquivo CSV: ' + error.message));
      }
    };

    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsText(file, 'UTF-8');
  });
};

// Processar arquivo XLSX
export const processXLSXFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const XLSX = require('xlsx');
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { 
          defval: '',
          raw: false, // Converter valores para string
          dateNF: 'dd/mm/yyyy' // Formato de data brasileiro
        });
        
        // Filtrar linhas vazias e limpar dados
        const cleanData = json
          .filter(row => Object.values(row).some(value => value && value.toString().trim()))
          .map(row => {
            const cleanRow = {};
            Object.keys(row).forEach(key => {
              cleanRow[key] = row[key] ? row[key].toString().trim() : '';
            });
            return cleanRow;
          });

        resolve(cleanData);
      } catch (err) {
        reject(new Error('Erro ao processar arquivo XLSX: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo XLSX'));
    reader.readAsArrayBuffer(file);
  });
};

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Gerar ID único
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Capitalizar primeira letra
export const capitalize = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Limpar dados de entrada
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};
