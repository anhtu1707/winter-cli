import { Spinner } from '../cli/spinner.js';
import { colors } from '../cli/snowflake-logo.js';
import { renderToolPanel } from '../cli/tui.js';
import { getMutatingToolNames, recordToolCallAdapterStats } from '../cli/tool-runtime.js';
import { buildSmallModelAmplification } from '../ai/small-model-amplifier.js';

export class AgentRuntime {
  constructor(repl) {
    this.repl = repl;
  }

  async runConversation(messages, label = 'Thinking... (Đang suy nghĩ, tìm cách giải quyết)', tools = null) {
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
    let autoVerified = false;
    let autoVerificationPassed = false;
    let autoVerificationFailures = 0;
    const toolSummaries = [];
    const executedTools = [];
    const changedFiles = new Set();
    const totalUsage = {};
    const toolSignatureHistory = [];
    const allowedToolNames = Array.isArray(tools) && tools.length > 0
      ? new Set(tools.map(tool => tool.name || tool.function?.name).filter(Boolean).map(name => repl.tools.normalizeToolName(name)))
      : null;
    const executionProfile = repl.selectExecutionProfile(messages, { enableTools: true });
    const requireToolEvidence = repl.actionRequiresTools(messages);
    let noToolActionRetries = 0;
    let unfinishedActionRetries = 0;
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
        if (repl.spinner) {
          repl.spinner.update(`${label}...`);
          repl.spinner.start();
        }
        const turn = await repl.requestAssistantTurn(messages, {
          provider: executionProfile.provider,
          model: executionProfile.model,
          enableTools: true,
          toolPromptOnly: forceTextToolFallback,
          requireToolEvidence: requireToolEvidence && !usedTools,
          usedMutatingTools: usedMutatingTools,
          deferFinalContent: this.shouldVerifyBeforeFinal(messages, usedMutatingTools, autoVerificationPassed),
        }, startedAt, totalUsage);

        const assistantMsg = turn.assistantMsg || {};
        const toolCalls = turn.toolCalls || [];

        if (toolCalls.length === 0) {
          if (turn.finishReason === 'tool_evidence_required') {
            noToolActionRetries++;
            if (noToolActionRetries > 3) {
              finalContent = 'Chưa thực hiện được: model trả lời mà không dùng tool nên Winter đã chặn để tránh báo xạo. Hãy thử lại hoặc dùng model mạnh hơn.';
              console.log(`\n${colors.yellow}${finalContent}${colors.reset}\n`);
              reachedToolLimit = false;
              break;
            }
            if (noToolActionRetries >= 2) {
              console.log(`\n${colors.yellow}! Model không chịu dùng tool (lần ${noToolActionRetries}/3). Đang ép buộc lại...${colors.reset}`);
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
          if (turn.finalContent && this.shouldVerifyBeforeFinal(messages, usedMutatingTools, autoVerificationPassed)) {
            autoVerified = true;
            const verification = await this.runVerificationTools({
              messages,
              toolSummaries,
              startedAt,
              totalUsage,
            });
            autoVerificationPassed = verification.passed;

            if (!verification.passed) {
              autoVerificationFailures++;
              if (autoVerificationFailures >= 3) {
                messages.push({
                  role: 'user',
                  content: [
                    'Verification is still failing after multiple repair attempts.',
                    'Stop making unsupported success claims. Give the user a concise status with the exact failing commands and remaining blocker.',
                  ].join('\n'),
                });
                finalContent = await repl.requestFinalAnswer(messages, toolSummaries, startedAt, totalUsage);
                reachedToolLimit = false;
                break;
              }

              messages.push({
                role: 'assistant',
                content: assistantMsg.content || '',
              });
              messages.push({
                role: 'user',
                content: this.buildVerificationRepairPrompt(verification, autoVerificationFailures),
              });
              finalContent = '';
              continue;
            }

            messages.push({
              role: 'assistant',
              content: assistantMsg.content || '',
            });
            finalContent = await repl.requestFinalAnswer(messages, toolSummaries, startedAt, totalUsage);
            reachedToolLimit = false;
            break;
          }
          if (
            turn.finalContent &&
            requireToolEvidence &&
            usedTools &&
            !usedMutatingTools &&
            repl.responseIndicatesUnfinishedAction?.(turn.finalContent)
          ) {
            unfinishedActionRetries++;
            if (unfinishedActionRetries > 3) {
              finalContent = 'Chưa hoàn thành: model chỉ trả lời trạng thái sau khi inspect, chưa thực hiện thay đổi. Winter đã dừng để tránh báo tiến độ giả.';
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
              content: repl.buildUnfinishedActionCorrection(messages, turn.finalContent),
            });
            forceTextToolFallback = true;
            finalContent = '';
            continue;
          }
          if (turn.finalContent) {
            finalContent = turn.finalContent;
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
          if (allowedToolNames && !allowedToolNames.has(canonicalToolName)) {
            const result = {
              success: false,
              error: `Tool ${canonicalToolName} is not allowed for this agent.`,
              recovery: `Allowed tools: ${[...allowedToolNames].join(', ')}`,
            };
            const promptToolResult = await repl.buildPromptToolResultForModel(canonicalToolName, result);
            messages.push({
              role: 'tool',
              tool_call_id: tc.id || `tool-${Date.now()}`,
              content: JSON.stringify(promptToolResult),
            });
            const summary = repl.formatToolResultForConsole(canonicalToolName, result);
            if (summary) {
              toolSummaries.push(`${canonicalToolName}: ${summary}`);
            }
            continue;
          }
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
            ? (canonicalToolName === 'Bash' ? '$' : canonicalToolName === 'Read' ? '≡' : canonicalToolName === 'Write' ? '±' : canonicalToolName === 'Edit' ? '$' : canonicalToolName === 'Grep' ? '⌕' : canonicalToolName === 'Glob' ? '►' : '▶')
            : `[${canonicalToolName}]`;

          let proceed = true;
          if (await repl.shouldPromptForToolPermission(canonicalToolName) && (!argParseError || canUseRecoveredArgs)) {
            const cmd = enrichedArgs.command || enrichedArgs.cmd || 'unknown';
            if (repl.sessionPermissionGrants.has(canonicalToolName)) {
              proceed = true;
            } else {
              proceed = await repl.promptToolPermission({
                toolName: canonicalToolName,
                args: enrichedArgs,
                command: cmd,
                target: enrichedArgs.file_path || enrichedArgs.path || enrichedArgs.url || enrichedArgs.server,
                cwd: enrichedArgs.cwd,
                workspace: repl.projectPath,
              });
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
            if (repl.spinner) {
              repl.spinner.update(`Executing ${canonicalToolName}... (Đang chạy lệnh)`);
              repl.spinner.start();
            }
            result = toolName
              ? await repl.tools.execute(canonicalToolName, enrichedArgs, { cwd: repl.projectPath })
              : { success: false, error: 'Tool call is missing a tool name' };
            if (repl.spinner) repl.spinner.stop();
          }
          executedTools.push({ tool: canonicalToolName, args: enrichedArgs, success: result?.success !== false });
          if (getMutatingToolNames().has(canonicalToolName)) {
            for (const key of ['file_path', 'filePath', 'path', 'file', 'notebook_path']) {
              if (typeof enrichedArgs?.[key] === 'string' && enrichedArgs[key].trim()) {
                changedFiles.add(enrichedArgs[key]);
                break;
              }
            }
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
        if (toolSummaries.length > 0) {
          console.log(`\n${colors.dim}💡 Tip: Gõ /tool để xem lại toàn bộ dữ liệu (data) của các tool calls vừa chạy.${colors.reset}\n`);
        }
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

    return {
      finalContent,
      usedTools,
      usedMutatingTools,
      autoVerified,
      autoVerificationPassed,
      toolSummaries,
      executedTools,
      changedFiles: [...changedFiles],
      usage: totalUsage,
      messages,
    };
  }

  shouldVerifyBeforeFinal(messages = [], usedMutatingTools = false, verificationPassed = false) {
    if (!usedMutatingTools || verificationPassed) return false;
    return this.repl.shouldAutoVerifyAfterTools?.(this.repl.getLatestUserText(messages), true) === true;
  }

  async runVerificationTools({ messages, toolSummaries, startedAt, totalUsage }) {
    const repl = this.repl;
    const commands = await repl.inferVerificationCommands?.(repl.getLatestUserText(messages));
    const uniqueCommands = [...new Set((commands || []).filter(Boolean))].slice(0, 3);
    if (uniqueCommands.length === 0) {
      return { passed: true, details: [] };
    }

    if (repl.spinner) repl.spinner.stop();
    console.log(`\n${colors.cyan}=== Auto verification before final answer ===${colors.reset}`);

    const details = [];
    for (const command of uniqueCommands) {
      if (repl.spinner) {
        repl.spinner.update(`Verifying: ${command}`);
        repl.spinner.start();
      }
      const result = await repl.tools.execute('Bash', { command }, { cwd: repl.projectPath });
      if (repl.spinner) repl.spinner.stop();

      const passed = result?.success !== false;
      details.push({
        cmd: command,
        passed,
        output: result?.stdout || result?.stderr || result?.error || '',
      });

      messages.push({
        role: 'user',
        content: [
          '[Winter auto-verification tool result]',
          `Tool: Bash`,
          `Command: ${command}`,
          `Status: ${passed ? 'passed' : 'failed'}`,
          String(result?.stdout || result?.stderr || result?.error || '').slice(0, 6000),
        ].filter(Boolean).join('\n'),
      });

      const summary = repl.formatToolResultForConsole('Bash', result) || `${command}: ${passed ? 'passed' : 'failed'}`;
      toolSummaries.push(`Bash: ${summary}`);
      console.log(renderToolPanel({
        toolName: '$ Bash',
        summary,
        success: passed,
        colors,
        title: 'Auto Verification',
      }));
    }

    if (startedAt && totalUsage) {
      // Keep the parameters intentionally used: callers pass the same timing and
      // usage objects as normal tool turns so future instrumentation can attach here.
    }

    return {
      passed: details.every(item => item.passed),
      details,
    };
  }

  buildVerificationRepairPrompt(verification, failureCount = 1) {
    const failures = (verification?.details || [])
      .filter(item => !item.passed)
      .map(item => [
        `Command: ${item.cmd}`,
        String(item.output || '').slice(0, 5000),
      ].join('\n'))
      .join('\n\n---\n\n');

    return [
      `RUNTIME VERIFICATION FAILED before final answer (repair attempt ${failureCount}/3).`,
      '',
      failures || 'Verification failed, but no output was captured.',
      '',
      'Fix the first hard failure now with tools. Inspect the error path, patch the smallest root cause, and do not provide a final success answer until verification passes.',
    ].join('\n');
  }
}
