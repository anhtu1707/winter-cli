import { WinterREPL } from '../cli/repl.js';
import { AgentTool } from '../tools/agent.js';

async function runSubagent(message = {}) {
  const options = message.options || {};
  const repl = new WinterREPL({
    projectPath: options.projectPath || options.cwd || process.cwd(),
    sessionId: options.sessionId,
    version: options.version,
  });
  repl.readlineClosed = true;
  repl.running = true;
  repl.showInputPrompt = () => {};
  repl.closeInputBox = () => {};
  repl.shouldPromptForToolPermission = async () => false;

  await repl.ai.init?.();
  const tool = new AgentTool(repl);
  const result = await tool.executeSubagent(message.task, {
    ...options,
    processIsolation: false,
    process_isolation: false,
  });
  return {
    ...result,
    workspaceIsolated: options.workspaceIsolation === true,
    workspacePath: options.projectPath,
    parentProjectPath: options.parentProjectPath,
  };
}

process.on('message', async message => {
  if (message?.type !== 'run') return;
  try {
    const result = await runSubagent(message);
    process.send?.({ type: 'result', result });
  } catch (error) {
    process.send?.({
      type: 'error',
      error: error.message,
      stack: error.stack,
    });
  }
});
