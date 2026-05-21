import { renderLandingTui } from './src/cli/tui.js';
import { colors } from './src/cli/snowflake-logo.js';

const snapshot = {
  provider: 'anthropic',
  model: 'claude-3-opus',
  modelTier: 'high',
  processing: false,
  sessionId: 'abc123def',
  sessionShort: 'abc123de',
  projectPath: process.cwd(),
  projectName: 'winter',
  queueLength: 0,
  queueText: 'ready',
  statusText: 'ready',
  codebaseFiles: 142,
  codebaseChunks: 1050,
  toolEvents: [],
  toolSummary: 'idle',
  recentHistory: [],
  conversationSummary: 'No recent conversation',
  startupNotices: ['loaded agents.md', 'rules default.md'],
  compact: false,
  unicode: true,
};

console.log(renderLandingTui(snapshot, { colors }));
