import { Spinner } from '../cli/spinner.js';
import { colors } from '../cli/snowflake-logo.js';
import { renderToolPanel } from '../cli/tui.js';
import { getMutatingToolNames, recordToolCallAdapterStats } from '../cli/tool-runtime.js';
import { buildSmallModelAmplification } from '../ai/small-model-amplifier.js';

export class AgentRuntime {
  constructor(repl) {
    this.repl = repl;
  }

  async runConversation(messages, label = 'Thinking', tools = null) {
    const repl = this.repl;
    repl.spinner = new Spinner(label + '...');
    repl.spinner.start();
    repl.hydrateSessionToolPermissions();

    const startedAt = Date.now();
    const previousTools = repl.ai.tools;
    if (tools) repl.ai.setTools(tools);

    let finalContent = '';
    let reachedToolLimit = true;
    let usedTools = false;
    let usedMutatingTools = false;
    const toolSummaries = [];
    const totalUsage = {};
    const toolSignatureHistory = [];
    const executionProfile = repl.selectExecutionProfile(messages, { enableTools: true });
    const requireToolEvidence = repl.actionRequiresTools(messages);
    let noToolActionRetries = 0;
    const sessionContext = repl.session?.getContext?.() || {};
    const profile = sessionContext.workflowProfile || 'general';
    const depth = /deep/i.test(profile) ? 'deep' : 'standard';
    const amplifier = buildSmallModelAmplification({
      modelTier: repl.ai?._modelTier || 'medium',
      workflowProfile: profile,
      depth,
    });
    const maxToolTurns = amplifier.maxToolTurns || 8;
    // Keep self-critique as prompt discipline only. A second runtime model turn
    // duplicates the final answer because the first answer is already rendered.
    amplifier.enforceSelfCritique = false;
    let forceTextToolFallback = false;

    try {
      for (let i = 0; i < maxToolTurns; i++) {
        if (repl.isCancelled) throw new Error('AbortError');
        const turn = await repl.requestAssistantTurn(messages, {
          provider: executionProfile.provider,
          model: executionProfile.model,
          enableTools: true,
          toolPromptOnly: forceTextToolFallback,
          requireToolEvidence: requireToolEvidence && !usedTools,
        }, startedAt, totalUsage);

        const assistantMsg = turn.assistantMsg || {};
        const toolCalls = turn.toolCalls || [];

        if (turn.finalContent && toolCalls.length === 0) {
          finalContent = turn.finalContent;
        }

        if (toolCalls.length === 0) {
          if (turn.finishReason === 'tool_evidence_required') {
            noToolActionRetries++;
            if (noToolActionRetries > 2) {
              finalContent = 'Chưa thực hiện được: model trả lời mà không dùng tool nên Winter đã chặn để tránh báo xạo.';
              console.log(`\n${colors.yellow}${finalContent}${colors.reset}\n`);
              reachedToolLimit = false;
              break;
            }
            messages.push({
              role: 'assistant',
              content: assistantMsg.content || '',
            });
            messages.push({
              role: 'user',
              content: repl.buildToolEvidenceCorrection(messages),
            });
            forceTextToolFallback = true;
            finalContent = '';
            continue;
          }
          if (turn.finishReason === 'length') {
            console.log(`\n${colors.yellow}ℹ Phản hồi bị cắt cụt do hết token. Đang tự động tiếp tục...${colors.reset}`);
            messages.push({
              role: 'assistant',
              content: turn.finalContent || '',
            });
            messages.push({
              role: 'user',
              content: 'Continue generating the rest of the response.',
            });
            continue;
          }
          reachedToolLimit = false;
          break;
        }

        usedTools = true;
        await recordToolCallAdapterStats(repl.session, toolCalls);
        if (repl.spinner) repl.spinner.stop();

        const currentToolSignature = repl.buildToolCallSignature(toolCalls);
        if (currentToolSignature) {
          toolSignatureHistory.push(currentToolSignature);
          if (toolSignatureHistory.length > 3) {
            toolSignatureHistory.shift();
          }
          if (
            toolSignatureHistory.length === 3 &&
            toolSignatureHistory[0] === currentToolSignature &&
            toolSignatureHistory[1] === currentToolSignature
          ) {
            console.log(`\n${colors.yellow}ℹ AI tool loop detected (3 consecutive identical tool calls). Breaking out.${colors.reset}`);
            reachedToolLimit = false;
            break;
          }
        }

        messages.push({
          role: 'assistant',
          content: assistantMsg.content || '',
          tool_calls: repl.formatToolCallsForMessage(toolCalls),
        });

        for (const tc of toolCalls) {
          const { toolName, toolArgs } = tc;
          const canonicalToolName = repl.tools.normalizeToolName(toolName);
          if (getMutatingToolNames().has(canonicalToolName)) {
            usedMutatingTools = true;
          }
          const argParseError = toolArgs?.__toolArgParseError;
          const recoveredArgs = argParseError ? repl.recoverToolArgs(canonicalToolName, toolArgs.__rawToolArgs) : null;
          const canUseRecoveredArgs = recoveredArgs && Object.keys(recoveredArgs).length > 0;
          const normalizedArgs = argParseError && !canUseRecoveredArgs
            ? {}
            : repl.tools.normalizeToolInput?.(canonicalToolName, canUseRecoveredArgs ? recoveredArgs : toolArgs) ?? toolArgs;
          const enrichedArgs = argParseError && !canUseRecoveredArgs ? {} : repl.enrichToolArgs(canonicalToolName, normalizedArgs, messages);

          const icon = repl.useUnicodeUi
            ? (canonicalToolName === 'Bash' ? '⚙' : canonicalToolName === 'Read' ? '📖' : canonicalToolName === 'Write' ? '✏️' : canonicalToolName === 'Edit' ? '🔧' : canonicalToolName === 'Grep' ? '🔍' : canonicalToolName === 'Glob' ? '📂' : '⚡')
            : `[${canonicalToolName}]`;

          let proceed = true;
          if (await repl.shouldPromptForToolPermission(canonicalToolName) && (!argParseError || canUseRecoveredArgs)) {
            const cmd = enrichedArgs.command || enrichedArgs.cmd || 'unknown';
            if (repl.sessionPermissionGrants.has(canonicalToolName)) {
              proceed = true;
            } else {
              proceed = await repl.promptToolPermission(cmd);
              if (proceed === 'session') {
                await repl.rememberSessionToolPermission(canonicalToolName);
                proceed = true;
              }

              if (proceed === true) {
                await repl.permissionManager.allowTool(canonicalToolName);
              }

              if (!proceed) {
                const side = repl.useUnicodeUi ? '│' : '|';
                console.log(`${colors.magenta}${side}${colors.reset}   ${colors.dim}Đã hủy lệnh.${colors.reset}`);
              }
            }
          }

          let result;
          if (argParseError && !canUseRecoveredArgs) {
            result = {
              success: false,
              error: `Invalid ${canonicalToolName} tool arguments JSON: ${toolArgs.__toolArgParseError}`,
              rawArgs: toolArgs.__rawToolArgs,
              recovery: 'Use valid JSON object arguments, for example {"file_path":"README.md"} for Read or {"command":"npm test"} for Bash.',
            };
          } else if (!proceed) {
            result = { success: false, error: 'User denied permission to execute this command.' };
          } else {
            result = toolName
              ? await repl.tools.execute(canonicalToolName, enrichedArgs, { cwd: repl.projectPath })
              : { success: false, error: 'Tool call is missing a tool name' };
          }
          const promptToolResult = await repl.buildPromptToolResultForModel(canonicalToolName, result);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || `tool-${Date.now()}`,
            content: JSON.stringify(promptToolResult),
          });

          const summary = repl.formatToolResultForConsole(canonicalToolName, result);
          if (summary) {
            toolSummaries.push(`${canonicalToolName}: ${summary}`);
            console.log(renderToolPanel({
              toolName: `${icon} ${toolName}`,
              summary,
              success: result.success !== false,
              colors,
              title: 'Agent Tools',
            }));
          }
        }
        console.log('');
      }

      if (usedTools && !finalContent) {
        finalContent = await repl.requestFinalAnswer(messages, toolSummaries, startedAt, totalUsage);
      }

      if (amplifier.enforceSelfCritique && finalContent) {
        const maybeWeak = /không chắc|tôi nghĩ|maybe|perhaps|có thể|probably/i.test(finalContent) || finalContent.length < 80;
        if (maybeWeak) {
          messages.push({
            role: 'user',
            content: [
              'Run a private self-critique and improve your previous answer.',
              'Checklist: missing requirements, missing edge-cases, missing verification evidence, unsafe assumptions.',
              'Return an improved final answer only.',
            ].join('\n'),
          });
          finalContent = await repl.requestFinalAnswer(messages, toolSummaries, startedAt, totalUsage);
        }
      }
    } finally {
      if (tools) repl.ai.setTools(previousTools);
      if (repl.spinner) repl.spinner.stop();
    }

    if ((reachedToolLimit || usedTools) && !finalContent) {
      if (repl.spinner) repl.spinner.stop();
      finalContent = repl.buildToolFallbackAnswer(toolSummaries);
      console.log(`\n${colors.yellow}${finalContent}${colors.reset}\n`);
    }

    return { finalContent, usedTools, usedMutatingTools };
  }
}
