/**
 * ❄ RETRIEVER ❄
 * Retrieval logic for RAG - handles similarity search and result formatting
 */

import { VectorStore } from './vector-store.js';

/**
 * Retriever class - handles document retrieval
 */
export class Retriever {
  constructor(config, vectorStore) {
    this.config = config;
    this.vectorStore = vectorStore;
  }

  /**
   * Retrieve relevant documents for a query
   * @param {string} query - User query
   * @param {object} options - Retrieval options
   * @returns {object} Retrieval results
   */
  async retrieve(query, options = {}) {
    const {
      topK = 5,
      threshold = 0.5,
      includeMetadata = true,
    } = options;

    if (!query || query.trim().length === 0) {
      return {
        query,
        results: [],
        count: 0,
      };
    }

    const results = await this.vectorStore.search(query, topK, threshold);

    const formattedResults = results.map(doc => ({
      id: doc.id,
      text: doc.text,
      source: doc.source,
      score: doc.score,
      metadata: includeMetadata ? doc.metadata : undefined,
    }));

    return {
      query,
      results: formattedResults,
      count: formattedResults.length,
    };
  }

  /**
   * Format retrieval results as context string
   * @param {object} retrievalResult - Result from retrieve()
   * @param {object} options - Formatting options
   * @returns {string} Formatted context
   */
  formatContext(retrievalResult, options = {}) {
    const { maxChars = 4000, showScores = true } = options;
    
    if (retrievalResult.count === 0) {
      return '';
    }

    let context = '## Relevant Context\n\n';
    
    for (const doc of retrievalResult.results) {
      const scoreStr = showScores ? ` [score: ${doc.score.toFixed(3)}]` : '';
      const sourceStr = doc.source ? ` (${doc.source})` : '';
      
      context += `---${sourceStr}${scoreStr}---\n`;
      context += doc.text + '\n\n';
      
      // Truncate if too long
      if (context.length > maxChars) {
        context = context.slice(0, maxChars) + '\n... (truncated)';
        break;
      }
    }

    return context;
  }

  /**
   * Augment prompt with retrieved context
   * @param {string} originalPrompt - Original user prompt
   * @param {object} options - Retrieval and formatting options
   * @returns {string} Augmented prompt
   */
  async augmentPrompt(originalPrompt, options = {}) {
    const retrievalResult = await this.retrieve(originalPrompt, {
      topK: options.topK || 5,
      threshold: options.threshold || 0.5,
    });

    if (retrievalResult.count === 0) {
      return originalPrompt;
    }

    const context = this.formatContext(retrievalResult, {
      maxChars: options.maxChars || 4000,
      showScores: options.showScores || false,
    });

    return `${context}\n\n## User Question\n${originalPrompt}`;
  }
}

export default Retriever;