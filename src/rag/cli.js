/**
 * RAG CLI commands: /rag query, /rag index, /rag status, /rag reset.
 */

import { RAGEngine } from './rag-engine.js';
import { colors, statusIcons } from '../cli/snowflake-logo.js';

let ragEngine = null;

export function initRAG(config) {
  ragEngine = new RAGEngine(config);
  return ragEngine;
}

export function getRAGEngine() {
  return ragEngine;
}

async function getEngine(config) {
  if (!ragEngine) {
    ragEngine = new RAGEngine(config);
    await ragEngine.init();
  }
  return ragEngine;
}

export async function handleRagCommand(query, config) {
  const engine = await getEngine(config);
  const results = await engine.search(query, { topK: 5, threshold: 0.5 });

  if (results.count === 0) {
    return {
      success: true,
      message: 'No relevant documents found. Try running /rag index first.',
      results: [],
    };
  }

  return {
    success: true,
    query: results.query,
    count: results.count,
    results: results.results.map(doc => ({
      id: doc.id,
      source: doc.source,
      score: doc.score.toFixed(3),
      text: doc.text.slice(0, 500) + (doc.text.length > 500 ? '...' : ''),
    })),
  };
}

export async function handleRagCommandFromRepl(repl, args = []) {
  const config = repl.config ? await repl.config.load() : {};
  config.projectPath = repl.projectPath;
  await printRagCommand(args, config);
}

export async function handleRagCommandFromParser(parser, args = []) {
  const config = parser.config ? await parser.config.load() : {};
  config.projectPath = parser.projectPath || process.cwd();
  await printRagCommand(args, config);
}

async function printRagCommand(args, config) {
  const [action = 'query', ...rest] = args;
  const normalizedAction = String(action || 'query').toLowerCase();

  switch (normalizedAction) {
    case 'query':
    case 'search': {
      const query = rest.join(' ');
      if (!query) {
        console.log(`${colors.yellow}Usage: /rag query <search-term>${colors.reset}`);
        return;
      }

      const result = await handleRagCommand(query, config);
      console.log(`${colors.cyan}RAG Search: "${query}"${colors.reset}`);
      console.log(`${colors.dim}Found ${result.count || 0} results${colors.reset}`);
      result.results?.forEach((r, i) => {
        console.log(`\n${colors.green}[${i + 1}] ${r.source}${colors.reset} ${colors.dim}(score: ${r.score})${colors.reset}`);
        console.log(`${r.text}\n`);
      });
      if (result.message) console.log(`${colors.dim}${result.message}${colors.reset}`);
      return;
    }

    case 'index': {
      console.log(`${colors.cyan}RAG Indexing...${colors.reset}`);
      const force = rest.includes('--force');
      const result = await handleRagIndexCommand(config, { force });
      const color = result.success ? colors.green : colors.yellow;
      const icon = result.success ? `${statusIcons.success} ` : '';
      console.log(`${color}${icon}${result.message}${colors.reset}`);
      return;
    }

    case 'status': {
      const result = await handleRagStatusCommand(config);
      console.log(`${colors.cyan}RAG Status:${colors.reset}`);
      console.log(`  Enabled: ${result.enabled}`);
      console.log(`  Documents: ${result.totalDocuments}`);
      console.log(`  Dimension: ${result.dimension}`);
      console.log(`  Provider: ${result.provider}`);
      console.log(`  Store: ${result.storeFile || 'default'}`);
      return;
    }

    case 'reset': {
      console.log(`${colors.cyan}RAG Resetting...${colors.reset}`);
      const result = await handleRagResetCommand(config);
      console.log(`${colors.green}${statusIcons.success} ${result.message}${colors.reset}`);
      return;
    }

    case 'help':
    default:
      console.log(`${colors.cyan}RAG Commands:${colors.reset}`);
      console.log('  /rag query <term>    - Semantic search');
      console.log('  /rag index [--force] - Index codebase');
      console.log('  /rag status          - Show RAG status');
      console.log('  /rag reset           - Clear vector store');
  }
}

export async function handleRagIndexCommand(config, options = {}) {
  const engine = await getEngine(config);
  const stats = engine.getStatus();

  if (stats.totalDocuments > 0 && !options.force) {
    return {
      success: false,
      message: `Already indexed ${stats.totalDocuments} documents. Use /rag index --force to re-index.`,
    };
  }

  if (options.force) {
    await engine.reset();
  }

  const result = await engine.indexCodebase(options);
  return {
    success: true,
    message: `Indexed ${result.totalDocuments} documents from ${result.totalFiles} files.`,
    ...result,
  };
}

export async function handleRagResetCommand(config) {
  const engine = await getEngine(config);
  await engine.reset();
  return {
    success: true,
    message: 'Vector store cleared.',
  };
}

export async function handleRagStatusCommand(config) {
  const engine = await getEngine(config);
  const status = engine.getStatus();

  return {
    success: true,
    enabled: status.enabled,
    totalDocuments: status.totalDocuments,
    dimension: status.dimension,
    provider: status.provider,
    createdAt: status.createdAt,
    updatedAt: status.updatedAt,
    storeFile: status.storeFile,
  };
}

export function handleRagEnableCommand(enabled) {
  if (ragEngine) {
    ragEngine.setEnabled(enabled);
  }

  return {
    success: true,
    message: `RAG ${enabled ? 'enabled' : 'disabled'}.`,
  };
}

export default {
  initRAG,
  getRAGEngine,
  handleRagCommand,
  handleRagCommandFromRepl,
  handleRagCommandFromParser,
  handleRagIndexCommand,
  handleRagResetCommand,
  handleRagStatusCommand,
  handleRagEnableCommand,
};
