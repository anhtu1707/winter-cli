/**
 * ❄ RAG TESTS ❄
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { VectorStore } from './vector-store.js';
import { Retriever } from './retriever.js';
import { RAGEngine } from './rag-engine.js';

const MOCK_CONFIG = {
  providers: {
    qwen: {
      apiKey: 'test-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
  },
  rag: {
    provider: 'qwen',
    enabled: true,
  },
};

test.describe('VectorStore', () => {
  test('should create vector store', () => {
    const store = new VectorStore(MOCK_CONFIG);
    assert.ok(store);
    assert.equal(store.embeddings.length, 0);
  });

  test('should calculate cosine similarity', () => {
    const store = new VectorStore(MOCK_CONFIG);
    
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    const c = [0, 1, 0];
    
    const simAA = store.cosineSimilarity(a, b);
    const simAC = store.cosineSimilarity(a, c);
    
    assert.equal(simAA, 1);
    assert.equal(simAC, 0);
  });
});

test.describe('Retriever', () => {
  test('should create retriever', () => {
    const store = new VectorStore(MOCK_CONFIG);
    const retriever = new Retriever(MOCK_CONFIG, store);
    
    assert.ok(retriever);
    assert.ok(retriever.vectorStore);
  });

  test('should format empty context', () => {
    const store = new VectorStore(MOCK_CONFIG);
    const retriever = new Retriever(MOCK_CONFIG, store);
    
    const result = {
      query: 'test',
      results: [],
      count: 0,
    };
    
    const context = retriever.formatContext(result);
    assert.equal(context, '');
  });

  test('should format context with results', () => {
    const store = new VectorStore(MOCK_CONFIG);
    const retriever = new Retriever(MOCK_CONFIG, store);
    
    const result = {
      query: 'test',
      results: [
        {
          id: 'doc1',
          text: 'Test document content',
          source: 'test.js',
          score: 0.9,
        },
      ],
      count: 1,
    };
    
    const context = retriever.formatContext(result, { showScores: true });
    assert.ok(context.includes('Test document content'));
    assert.ok(context.includes('0.900'));
  });
});

test.describe('RAGEngine', () => {
  test('should create RAG engine', () => {
    const engine = new RAGEngine(MOCK_CONFIG);
    
    assert.ok(engine);
    assert.ok(engine.vectorStore);
    assert.ok(engine.retriever);
  });

  test('should toggle enabled state', () => {
    const engine = new RAGEngine(MOCK_CONFIG);
    
    assert.equal(engine.isEnabled(), true);
    
    engine.setEnabled(false);
    assert.equal(engine.isEnabled(), false);
    
    engine.setEnabled(true);
    assert.equal(engine.isEnabled(), true);
  });

  test('should chunk text correctly', () => {
    const engine = new RAGEngine(MOCK_CONFIG);
    
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const chunks = engine.chunkText(text, 20, 10);
    
    assert.ok(chunks.length > 0);
    assert.ok(chunks.every(chunk => typeof chunk === 'string'));
  });

  test('should get status', () => {
    const engine = new RAGEngine(MOCK_CONFIG);
    
    const status = engine.getStatus();
    
    assert.ok(status.enabled !== undefined);
    assert.ok(status.totalDocuments !== undefined);
    assert.ok(status.provider !== undefined);
  });
});