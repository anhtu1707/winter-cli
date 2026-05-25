/**
 * ❄ EMBEDDING PROVIDERS ❄
 * Abstraction layer for embedding models (Qwen, MiniMax, Ollama, OpenAI, custom)
 */

import { getProviderPreset } from '../ai/provider-adapters.js';

const DEFAULT_EMBED_MODEL = {
  qwen: 'text-embedding-v3',
  minimax: 'embedding-2',
  ollama: 'nomic-embed-text',
  openai: 'text-embedding-3-small',
};

/**
 * Get embedding provider config
 * @param {string} providerName - Provider name (qwen, minimax, ollama, openai, custom)
 * @param {object} config - Full Winter config
 * @returns {object} Embedding config
 */
export function getEmbeddingConfig(providerName, config) {
  const preset = getProviderPreset(providerName);
  const configuredProvider = config?.providers?.[providerName] || config?.[providerName] || {};
  
  if (!preset) {
    // For custom providers, use the config directly
    const customProvider = configuredProvider;
    if (customProvider) {
      return {
        ...customProvider,
        embedModel: customProvider.embedModel || DEFAULT_EMBED_MODEL[providerName] || 'text-embedding-3-small',
        embedProvider: providerName,
      };
    }
    throw new Error(`Provider '${providerName}' not found in config`);
  }

  const model = configuredProvider.embedModel
    || DEFAULT_EMBED_MODEL[providerName]
    || preset.embedModel
    || preset.model;
  
  return {
    ...preset,
    ...configuredProvider,
    embedModel: model,
    embedProvider: providerName,
  };
}

/**
 * Create embedding request body for a provider
 * @param {string} providerName - Provider name
 * @param {string} text - Text to embed
 * @param {object} cfg - Provider config
 * @returns {object} Request body
 */
export function createEmbeddingRequest(providerName, text, cfg) {
  const normalizedText = text.replace(/\n/g, ' ').trim();
  
  switch (providerName) {
    case 'qwen':
      return {
        model: cfg.embedModel,
        input: normalizedText,
      };
      
    case 'minimax':
      return {
        model: cfg.embedModel,
        text: normalizedText,
      };
      
    case 'ollama':
      return {
        model: cfg.embedModel,
        prompt: normalizedText,
      };
      
    case 'openai':
    case 'custom':
    default:
      return {
        model: cfg.embedModel,
        input: normalizedText,
      };
  }
}

/**
 * Parse embedding response from provider
 * @param {string} providerName - Provider name
 * @param {object} data - Response data
 * @returns {number[]} Embedding vector
 */
export function parseEmbeddingResponse(providerName, data) {
  switch (providerName) {
    case 'qwen':
      return data.output?.embeddings?.[0]?.embedding || data.data?.[0]?.embedding;
      
    case 'minimax':
      return data.data?.embedding || data.data?.[0]?.embedding;
      
    case 'ollama':
      return data.embedding;
      
    case 'openai':
    case 'custom':
    default:
      return data.data?.[0]?.embedding;
  }
}

/**
 * Get base URL for embedding provider
 * @param {string} providerName - Provider name
 * @param {object} cfg - Provider config
 * @returns {string} Base URL
 */
export function getEmbeddingBaseURL(providerName, cfg) {
  const baseURL = cfg.baseURL;
  
  if (baseURL) {
    const trimmed = String(baseURL).replace(/\/+$/, '');
    if (/\/embeddings$/i.test(trimmed)) return trimmed;
    if (providerName === 'ollama' && !/\/v1$/i.test(trimmed)) return `${trimmed}/api/embeddings`;
    return `${trimmed}/embeddings`;
  }
  
  const EMBED_ENDPOINTS = {
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
    minimax: 'https://api.minimax.chat/v1/text/embeddings',
    ollama: 'http://localhost:11434/api/embeddings',
    openai: 'https://api.openai.com/v1/embeddings',
  };
  
  return EMBED_ENDPOINTS[providerName] || EMBED_ENDPOINTS.openai;
}

/**
 * Get headers for embedding request
 * @param {string} providerName - Provider name
 * @param {object} cfg - Provider config
 * @returns {object} Headers
 */
export function getEmbeddingHeaders(providerName, cfg) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  switch (providerName) {
    case 'qwen':
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      break;
      
    case 'minimax':
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      break;
      
    case 'ollama':
      // No auth needed for local
      break;
      
    case 'openai':
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      break;
      
    case 'custom':
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      if (cfg.authToken) headers['Authorization'] = `Bearer ${cfg.authToken}`;
      break;
  }
  
  return headers;
}

export default {
  getEmbeddingConfig,
  createEmbeddingRequest,
  parseEmbeddingResponse,
  getEmbeddingBaseURL,
  getEmbeddingHeaders,
};
