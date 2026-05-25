/**
 * ❄ VECTOR STORE ❄
 * File-based vector storage with cosine similarity search
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getEmbeddingConfig, createEmbeddingRequest, parseEmbeddingResponse, getEmbeddingBaseURL, getEmbeddingHeaders } from './embeddings.js';

const DEFAULT_VECTOR_STORE_FILE = path.join('.winter', 'rag', 'vector-store.json');

/**
 * Vector Store class
 */
export class VectorStore {
  constructor(config) {
    this.config = config;
    this.projectPath = path.resolve(config.projectPath || config.project?.current || process.cwd());
    this.storeFile = path.resolve(this.projectPath, config.rag?.storeFile || DEFAULT_VECTOR_STORE_FILE);
    this.embeddings = [];
    this.meta = {
      provider: config.rag?.provider || 'qwen',
      dimension: 0,
      createdAt: null,
      updatedAt: null,
    };
  }

  /**
   * Initialize vector store (load from disk)
   */
  async init() {
    try {
      const data = await fs.readFile(this.storeFile, 'utf-8');
      const parsed = JSON.parse(data);
      this.embeddings = parsed.embeddings || [];
      this.meta = parsed.meta || this.meta;
    } catch {
      // No existing store, start fresh
      this.embeddings = [];
    }
  }

  /**
   * Save vector store to disk
   */
  async save() {
    const dir = path.dirname(this.storeFile);
    await fs.mkdir(dir, { recursive: true });
    
    this.meta.updatedAt = new Date().toISOString();
    
    await fs.writeFile(this.storeFile, JSON.stringify({
      embeddings: this.embeddings,
      meta: this.meta,
    }, null, 2));
  }

  /**
   * Embed text using configured provider
   * @param {string} text - Text to embed
   * @returns {number[]} Embedding vector
   */
  async embedText(text) {
    const providerName = this.meta.provider;
    const cfg = getEmbeddingConfig(providerName, this.config);
    
    const baseURL = getEmbeddingBaseURL(providerName, cfg);
    const headers = getEmbeddingHeaders(providerName, cfg);
    const body = createEmbeddingRequest(providerName, text, cfg);
    
    const response = await fetch(baseURL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding request failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    const embedding = parseEmbeddingResponse(providerName, data);
    
    if (!embedding || embedding.length === 0) {
      throw new Error('Failed to generate embedding');
    }
    
    return embedding;
  }

  /**
   * Add document to vector store
   * @param {object} doc - Document { id, text, source, metadata }
   */
  async addDocument(doc) {
    const embedding = await this.embedText(doc.text);
    
    const vectorDoc = {
      id: doc.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      text: doc.text,
      source: doc.source || 'unknown',
      metadata: doc.metadata || {},
      embedding,
      createdAt: new Date().toISOString(),
    };
    
    this.embeddings.push(vectorDoc);
    
    if (this.meta.dimension === 0) {
      this.meta.dimension = embedding.length;
    }
    
    await this.save();
    
    return vectorDoc.id;
  }

  /**
   * Add multiple documents
   * @param {object[]} docs - Array of documents
   */
  async addDocuments(docs) {
    const ids = [];
    
    for (const doc of docs) {
      const id = await this.addDocument(doc);
      ids.push(id);
    }
    
    return ids;
  }

  /**
   * Cosine similarity between two vectors
   * @param {number[]} a - Vector A
   * @param {number[]} b - Vector B
   * @returns {number} Similarity score (0-1)
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Search for similar documents
   * @param {string} query - Query text
   * @param {number} topK - Number of results (default: 5)
   * @param {number} threshold - Similarity threshold (default: 0.5)
   * @returns {object[]} Similar documents
   */
  async search(query, topK = 5, threshold = 0.5) {
    if (this.embeddings.length === 0) {
      return [];
    }
    
    const queryEmbedding = await this.embedText(query);
    
    const results = this.embeddings
      .map(doc => ({
        ...doc,
        score: this.cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .filter(doc => doc.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    
    return results;
  }

  /**
   * Get all documents
   * @returns {object[]} All documents
   */
  getAll() {
    return this.embeddings.map(doc => ({
      id: doc.id,
      text: doc.text,
      source: doc.source,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    }));
  }

  /**
   * Clear all documents
   */
  async clear() {
    this.embeddings = [];
    this.meta.dimension = 0;
    this.meta.createdAt = null;
    this.meta.updatedAt = null;
    await this.save();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalDocuments: this.embeddings.length,
      dimension: this.meta.dimension,
      provider: this.meta.provider,
      createdAt: this.meta.createdAt,
      updatedAt: this.meta.updatedAt,
      storeFile: this.storeFile,
    };
  }
}

export default VectorStore;
