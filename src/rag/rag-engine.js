/**
 * ❄ RAG ENGINE ❄
 * Core RAG engine - orchestrates retrieval + augmentation
 */

import { VectorStore } from './vector-store.js';
import { Retriever } from './retriever.js';
import { getEmbeddingConfig } from './embeddings.js';
import { glob } from 'glob';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * RAG Engine class
 */
export class RAGEngine {
  constructor(config) {
    this.config = config;
    this.projectPath = path.resolve(config.projectPath || config.project?.current || process.cwd());
    this.vectorStore = new VectorStore(config);
    this.retriever = new Retriever(config, this.vectorStore);
    this.enabled = config.rag?.enabled !== false;
  }

  /**
   * Initialize RAG engine
   */
  async init() {
    await this.vectorStore.init();
  }

  /**
   * Check if RAG is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Enable/disable RAG
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Index codebase
   * @param {object} options - Indexing options
   */
  async indexCodebase(options = {}) {
    const {
      patterns = ['src/**/*.js', 'src/**/*.ts', '*.md', 'docs/**/*.md'],
      exclude = ['node_modules/**', 'dist/**', 'build/**', '.git/**', '.winter/**', 'resources/local/**', '**/*.test.js', '**/*.min.js'],
      chunkSize = 1000,
      chunkOverlap = 200,
    } = options;

    const files = await glob(patterns, {
      cwd: this.projectPath,
      ignore: exclude,
      absolute: true,
      nodir: true,
    });
    
    const docs = [];
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // Chunk large files
        if (content.length <= chunkSize) {
          docs.push({
            id: `file_${path.basename(file)}`,
            text: content,
            source: path.relative(this.projectPath, file).replace(/\\/g, '/'),
            metadata: {
              type: 'file',
              name: path.basename(file),
              ext: path.extname(file),
            },
          });
        } else {
          // Split into chunks
          const chunks = this.chunkText(content, chunkSize, chunkOverlap);
          
          chunks.forEach((chunk, idx) => {
            docs.push({
              id: `chunk_${path.basename(file)}_${idx}`,
              text: chunk,
              source: path.relative(this.projectPath, file).replace(/\\/g, '/'),
              metadata: {
                type: 'chunk',
                name: path.basename(file),
                ext: path.extname(file),
                chunkIndex: idx,
                totalChunks: chunks.length,
              },
            });
          });
        }
      } catch (err) {
        console.warn(`Failed to read ${file}: ${err.message}`);
      }
    }

    const ids = await this.vectorStore.addDocuments(docs);
    
    return {
      totalFiles: files.length,
      totalDocuments: ids.length,
    };
  }

  /**
   * Chunk text with overlap
   * @param {string} text - Text to chunk
   * @param {number} chunkSize - Chunk size in chars
   * @param {number} overlap - Overlap between chunks
   * @returns {string[]} Chunks
   */
  chunkText(text, chunkSize, overlap) {
    const chunks = [];
    const lines = text.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        
        // Keep overlap
        const overlapLines = currentChunk.split('\n').slice(-Math.floor(overlap / 50));
        currentChunk = overlapLines.join('\n') + '\n' + line;
      } else {
        currentChunk += line + '\n';
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  /**
   * Search
   * @param {string} query - Query
   * @param {object} options - Search options
   */
  async search(query, options = {}) {
    return this.retriever.retrieve(query, options);
  }

  /**
   * Augment prompt with context
   * @param {string} prompt - Original prompt
   * @param {object} options - Augmentation options
   */
  async augmentPrompt(prompt, options = {}) {
    if (!this.enabled) {
      return prompt;
    }
    
    return this.retriever.augmentPrompt(prompt, options);
  }

  /**
   * Get RAG status
   */
  getStatus() {
    const stats = this.vectorStore.getStats();
    return {
      enabled: this.enabled,
      ...stats,
    };
  }

  /**
   * Reset vector store
   */
  async reset() {
    await this.vectorStore.clear();
  }
}

export default RAGEngine;
