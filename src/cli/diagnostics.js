import { colors } from './snowflake-logo.js';
import { assessWinterCapabilities, formatCapabilityScorecard } from '../ai/capability-scorecard.js';

export async function runToolDoctor(repl) {
  const provider = repl.ai?.getActiveProvider?.() || 'unknown';
  const model = repl.ai?.providers?.[provider]?.model || 'unknown';
  const tools = repl.getAgentTools('plan').filter(tool => tool.name === 'Read');
  const probePath = 'README.md';
  const messages = [
    {
      role: 'system',
      content: [
        'You are Winter tool-call doctor.',
        'You must diagnose whether this provider/model can trigger a real tool execution.',
        'Call the Read tool for README.md now. Do not answer in prose before the tool call.',
        'If native tool calls are unavailable, output exactly one fallback call:',
        '<invoke name="Read"><parameter name="path">README.md</parameter></invoke>',
        '{"tool":"Read","arguments":{"path":"README.md"}}',
        'CALL_TOOL Read {"path":"README.md"}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `TOOL DOCTOR: call Read on ${probePath}.`,
    },
  ];

  console.log(`${colors.cyan}Tool doctor:${colors.reset} provider=${provider}, model=${model}`);
  const beforeEvents = repl.session?.getToolEvents?.(1)?.length || 0;
  const result = await repl.runConversation(messages, 'Tool doctor', tools);
  const recentEvents = repl.session?.getToolEvents?.(5) || [];
  const readEvent = recentEvents.find(event => event.tool === 'Read' && event.success !== false);
  const passed = result.usedTools && Boolean(readEvent || /readme\.md/i.test(result.finalContent || ''));

  if (passed) {
    console.log(`${colors.green}✓ Tool calling works for ${provider}/${model}.${colors.reset}`);
    if (readEvent) {
      console.log(`${colors.dim}  Last Read result: ${readEvent.result?.path || probePath}${colors.reset}`);
    }
    return { success: true, provider, model, usedTools: result.usedTools, beforeEvents };
  }

  console.log(`${colors.red}✗ Tool calling did not execute for ${provider}/${model}.${colors.reset}`);
  console.log(`${colors.yellow}  Try a stronger model or use a provider that supports OpenAI-compatible tools/fallback text output.${colors.reset}`);
  return { success: false, provider, model, usedTools: result.usedTools, beforeEvents };
}

export async function getCapabilityScorecard(repl) {
  return assessWinterCapabilities(repl);
}

export async function showCapabilityScorecard(repl) {
  const report = await getCapabilityScorecard(repl);
  console.log(formatCapabilityScorecard(report, { colors }));
  return report;
}

export async function showContextDiagnostics(repl, task = '') {
  const provider = repl.ai?.getActiveProvider?.() || 'unknown';
  const model = repl.ai?.providers?.[provider]?.model || 'unknown';
  const context = await repl.getProjectContext(task);
  let codebaseStats = null;
  try {
    codebaseStats = repl.codebaseSearcher?.indexer?.getStats?.() || null;
  } catch {
    codebaseStats = null;
  }

  const sectionNames = Array.from(context.matchAll(/^\[([^\]]+)\]/gm)).map(match => match[1]);
  const lines = [
    `${colors.cyan}${colors.bright}Winter context diagnostics${colors.reset}`,
    `Project: ${repl.projectPath}`,
    `Provider/model: ${provider}/${model}`,
    `Context chars: ${context.length}`,
    `Sections: ${sectionNames.length ? sectionNames.join(', ') : 'none'}`,
  ];

  if (codebaseStats) {
    lines.push(`Codebase index: ${codebaseStats.totalFiles || 0} files, ${codebaseStats.totalChunks || 0} chunks`);
  } else {
    lines.push('Codebase index: unavailable');
  }

  lines.push('');
  lines.push(colors.dim + repl.compactText(context, 3200, 'context diagnostics') + colors.reset);
  console.log(lines.join('\n'));
  return { provider, model, contextLength: context.length, sections: sectionNames, codebaseStats };
}

export async function runFullDoctor(repl) {
  const report = await showCapabilityScorecard(repl);
  console.log('');
  await showContextDiagnostics(repl, 'doctor full codebase provider tool debug workflow');
  console.log('');
  const toolResult = await runToolDoctor(repl);
  return {
    success: report.overall >= report.target && toolResult.success,
    scorecard: report,
    toolResult,
  };
}
