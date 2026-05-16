/**
 * Similarity Search - Vector similarity and context matching utilities.
 * Provides multiple similarity algorithms for finding relevant contexts.
 */

export class SimilaritySearch {
  constructor() {
    this.index = [];
  }

  /**
   * Add a document to the search index.
   */
  add(id, text, metadata = {}) {
    this.index.push({
      id,
      text,
      tokens: this._tokenize(text),
      metadata,
      addedAt: Date.now(),
    });
    return this;
  }

  /**
   * Add multiple documents at once.
   */
  addBatch(documents) {
    for (const doc of documents) {
      this.add(doc.id, doc.text, doc.metadata);
    }
    return this;
  }

  /**
   * Search for similar documents using TF-IDF scoring.
   */
  search(query, options = {}) {
    const {
      limit = 10,
      threshold = 0.1,
      algorithm = 'tfidf',
    } = options;

    const queryTokens = this._tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = this.index.map((doc, idx) => {
      let score;
      switch (algorithm) {
        case 'cosine':
          score = this._cosineSimilarity(queryTokens, doc.tokens);
          break;
        case 'jaccard':
          score = this._jaccardSimilarity(queryTokens, doc.tokens);
          break;
        case 'tfidf':
        default:
          score = this._tfidfScore(queryTokens, doc.tokens, idx);
          break;
      }
      return { score, doc, idx };
    });

    return scores
      .filter(s => s.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        id: s.doc.id,
        text: s.doc.text,
        score: s.score,
        metadata: s.doc.metadata,
      }));
  }

  /**
   * Remove a document from the index.
   */
  remove(id) {
    this.index = this.index.filter(d => d.id !== id);
    return this;
  }

  /**
   * Clear the index.
   */
  clear() {
    this.index = [];
    return this;
  }

  /**
   * Get index statistics.
   */
  stats() {
    return {
      documents: this.index.length,
      totalTokens: this.index.reduce((sum, d) => sum + d.tokens.length, 0),
      averageTokens: this.index.length
        ? this.index.reduce((sum, d) => sum + d.tokens.length, 0) / this.index.length
        : 0,
    };
  }

  // --- Private helpers ---

  _tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }

  _cosineSimilarity(tokensA, tokensB) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const intersection = [...setA].filter(t => setB.has(t)).length;
    const denom = Math.sqrt(setA.size * setB.size);
    return denom === 0 ? 0 : intersection / denom;
  }

  _jaccardSimilarity(tokensA, tokensB) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const intersection = new Set([...setA].filter(t => setB.has(t)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  _tfidfScore(queryTokens, docTokens, docIdx) {
    const docSet = new Set(docTokens);
    const docFreq = new Map();
    const totalDocs = this.index.length;

    // Precompute document frequency
    for (const token of queryTokens) {
      if (!docFreq.has(token)) {
        docFreq.set(token, this.index.filter(d => new Set(d.tokens).has(token)).length);
      }
    }

    // TF-IDF for matching tokens
    let score = 0;
    for (const token of queryTokens) {
      if (docSet.has(token)) {
        const tf = docTokens.filter(t => t === token).length / docTokens.length;
        const idf = Math.log((totalDocs + 1) / (docFreq.get(token) + 1)) + 1;
        score += tf * idf;
      }
    }

    return score;
  }
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'also', 'about', 'up', 'and', 'but',
  'or', 'if', 'because', 'while', 'that', 'this', 'these', 'those',
  'it', 'its', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'whose',
]);

export default SimilaritySearch;
