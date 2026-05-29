import { formatRuntimeEnvironmentSummary, getRuntimeEnvironment } from './runtime-env.js';
import { buildHermesCoreContract } from '../ai/hermes-core.js';
import { getModelBudgetMultiplier } from '../ai/model-capabilities.js';
import { buildCodingMasteryContract } from '../ai/small-model-amplifier.js';

/**
 * PromptBuilder — Builds system prompts for Winter CLI agents.
 * Extracted from WinterREPL to reduce repl.js size.
 */
export class PromptBuilder {
  constructor({ session, ai, tools, projectPath, sessionPermissionGrants, compactText, summarizePrompts } = {}) {
    this.session = session;
    this.ai = ai;
    this.tools = tools;
    this.projectPath = projectPath;
    this.sessionPermissionGrants = sessionPermissionGrants;
    this._compactText = compactText;
    this._summarizePrompts = summarizePrompts;
  }

  buildSessionSignalsPrompt() {
    const activeProvider = this.ai?.getActiveProvider?.() || 'unavailable';
    const activeModel = this.ai?.providers?.[activeProvider]?.model || 'unavailable';
    const sessionContext = this.session?.getContext?.() || {};
    const activeSkills = Array.isArray(sessionContext.activeSkills?.value)
      ? sessionContext.activeSkills.value
      : (Array.isArray(sessionContext.activeSkills) ? sessionContext.activeSkills : []);
    const toolAllowlist = [...(this.sessionPermissionGrants || [])];

    return [
      '## Session Signals',
      `- Project path: ${this.projectPath}`,
      `- Active provider: ${activeProvider}`,
      `- Active model: ${activeModel}`,
      `- Tool allowlist: ${toolAllowlist.length > 0 ? toolAllowlist.join(', ') : 'none'}`,
      `- Active skills: ${Array.isArray(activeSkills) && activeSkills.length > 0 ? activeSkills.join(', ') : 'none'}`,
      sessionContext.workflowProfile
        ? `- Workflow profile: ${sessionContext.workflowProfile}`
        : '',
    ].join('\n');
  }

  getRequiredLocalResources() {
    const sessionContext = this.session?.getContext?.() || {};
    const value = sessionContext.requiredLocalResources?.value ?? sessionContext.requiredLocalResources;
    return typeof value === 'string' ? value : '';
  }

  getResourceApplicationProfile() {
    const sessionContext = this.session?.getContext?.() || {};
    const value = sessionContext.resourceApplicationProfile?.value ?? sessionContext.resourceApplicationProfile;
    return typeof value === 'string' ? value : '';
  }

  buildSystemPrompt(context = '', options = {}) {
    const memories = this.session?.getMemory?.() || [];
    const plans = this.session?.getPlans?.() || [];
    const sessionContext = this.session?.getContext?.() || {};
    const environmentSummary = this.tools?.getRuntimeEnvironmentSummary?.() || this._defaultEnvironmentSummary();
    const requiredLocalResources = this.getRequiredLocalResources();
    const resourceApplicationProfile = this.getResourceApplicationProfile();
    const scale = getModelBudgetMultiplier(options.modelTier);
    const projectContextBudget = options.projectContextBudget || Math.round(3200 * scale);
    const compactSystemPrompt = options.compactSystemPrompt ?? (scale <= 0.75);
    const memoryBudget = Math.round(1200 * scale);
    const planBudget = Math.round(1200 * scale);
    const requiredResourcesBudget = Math.round((compactSystemPrompt ? 1200 : 1600) * scale);
    const resourceProfileBudget = Math.round((compactSystemPrompt ? 1800 : 2600) * scale);
    const workflowBudget = Math.round(900 * scale);
    const blueprintBudget = Math.round(700 * scale);

    const memoryStr = memories.length > 0
      ? this._formatMemories(memories, { maxTotalChars: memoryBudget })
      : '';
    const requiredResourcesStr = requiredLocalResources
      ? `\n## Required Local Resource Rules\n${this._compactText(requiredLocalResources, requiredResourcesBudget, 'required local resources')}`
      : '';
    const resourceProfileStr = resourceApplicationProfile
      ? `\n## Auto-loaded Resource Application Profile\n${this._compactText(resourceApplicationProfile, resourceProfileBudget, 'resource application profile')}`
      : '';
    const plansStr = plans.length > 0
      ? this._formatPlans(plans, { maxTotalChars: planBudget })
      : '';
    const skillsStr = Array.isArray(sessionContext.activeSkills) && sessionContext.activeSkills.length > 0
      ? `\n## Auto-applied Skills\n${sessionContext.activeSkills.slice(0, 12).map(skill => `- ${skill}`).join('\n')}${sessionContext.activeSkills.length > 12 ? '\n- ...' : ''}`
      : '';
    const workflowStr = sessionContext.workflowHints
      ? `\n## Workflow Auto-Selection\n${this._compactText(sessionContext.workflowHints, workflowBudget, 'workflow hints')}`
      : '';
    const blueprintStr = sessionContext.workflowBlueprint
      ? `\n## Profile Blueprint\n${this._compactText(sessionContext.workflowBlueprint, blueprintBudget, 'workflow blueprint')}`
      : '';
    const smallModelContractStr = compactSystemPrompt
      ? '\n## Small Model Operating Contract\n- Use a private checklist: goal, files/state to inspect, next tool, verification.\n- For action tasks, make one concrete tool call before claiming progress.\n- If unsure, Read/Grep/Glob/Bash instead of guessing.\n- Do not claim files changed, browser checked, tests passed, or commands ran without tool output from this turn.\n- Keep context reads small and high-signal; verify after changes.'
      : '';
    const codingMasteryStr = `\n${buildCodingMasteryContract({ compact: compactSystemPrompt })}`;
    const hermesCoreStr = `\n${buildHermesCoreContract({ compact: compactSystemPrompt })}`;
    const startupPlanStr = sessionContext.bootstrapPlan?.title
      ? `\n## Startup Plan\n- ${sessionContext.bootstrapPlan.title}: ${sessionContext.bootstrapPlan.description}`
      : '';
    const sessionSignalsStr = `\n${this.buildSessionSignalsPrompt()}`;

    if (compactSystemPrompt) {
      return [
        `You are Winter, an expert AI coding assistant.`,
        `Runtime:\n${environmentSummary}`,
        `Rules: operate as an agent: inspect real state, form a short hypothesis, act with tools, verify, then answer in Vietnamese.`,
        `Debug: reproduce or locate the failing path first, read the exact failing file/log, patch the smallest cause, then run the closest test/build/smoke command.`,
        `Design/UI: inspect existing UI and design resources first; deliver polished, responsive, non-generic interfaces, not placeholder layouts.`,
        `Images: if the user attaches or pastes an image, analyze it directly and connect findings to project files when relevant.`,
        `CRITICAL: You MUST call tools (Read/Write/Edit/Bash) to do real work. NEVER write code in markdown and claim done. Winter blocks fake completions.`,
        `Tool fallback when native calls are unavailable: <invoke name="Read"><parameter name="path">README.md</parameter></invoke> OR {"tool":"Read","arguments":{"path":"README.md"}} OR CALL_TOOL Read {"path":"README.md"}.`,
        `Session: cwd=${this.projectPath}; id=${this.session?.getSessionId?.()?.substring(0, 8) || 'unknown'}`,
        `${smallModelContractStr}${codingMasteryStr}${hermesCoreStr}${requiredResourcesStr}${resourceProfileStr}${memoryStr}${plansStr}${skillsStr}${workflowStr}${blueprintStr}${startupPlanStr}${sessionSignalsStr}`,
        context ? `\n## Project Context\n${this._compactText(context, projectContextBudget, 'project context')}` : '',
      ].filter(Boolean).join('\n');
    }

    return [
      `You are Winter, an expert AI coding assistant.`,
      ``,
      `## Runtime Environment`,
      environmentSummary,
      ``,
      `## Core Principles`,
      `0. Required Local Resources - Always follow Required Local Resource Rules when present; they override generic behavior.`,
      `1. Agentic Execution - Inspect real project state, choose the next useful tool, act, verify, and keep going until the request is genuinely handled.`,
      `2. Think Before Coding - State assumptions only when they matter; convert uncertainty into file reads, grep, browser checks, or build/test runs.`,
      `3. Simplicity First - Minimum code that solves the problem. Nothing speculative.`,
      `4. Surgical Changes - Touch only what you must. Clean up only your own mess.`,
      `5. Goal-Driven Execution - Define success criteria. Loop until verified.`,
      ``,
      `## Tool Usage`,
      `Use tools when they materially help. For coding tasks: inspect first, edit second, verify third.`,
      `Prefer Read/Grep/Glob before editing. Use Write/Edit for file changes.`,
      `CRITICAL: When the user asks you to fix/create/edit/run/modify anything, you MUST call tools (Read, Write, Edit, Bash, etc.) to actually do it. NEVER just write code in a markdown code block and claim it is done. Winter will detect and block fake completions. If you say "đã sửa/đã tạo/done/fixed" without a tool call, your response will be rejected.`,
      `Tool call compatibility: if native tool calls are unavailable, output exactly one of these forms and no prose: <invoke name="Read"><parameter name="path">README.md</parameter></invoke> OR {"tool":"Read","arguments":{"path":"README.md"}} OR CALL_TOOL Read {"path":"README.md"}.`,
      `Open browser requests: if the user asks to "mở chrome", "open Chrome", or open a URL in a visible browser, use OpenBrowser. Do NOT use Bash, Get-Command, Start-Process, cmd start, or shell app launch commands for this.`,
      `Browser capability: You CAN browse URLs! Use WebFetch only for static page text extraction. For live Chrome debugging and visible browser control, prefer MCP server "chrome-devtools" when configured: use MCP tool "new_page" or "navigate_page", then "take_snapshot", "click", "fill"/"fill_form", "take_screenshot", "evaluate_script", "list_console_messages", "list_network_requests", or performance trace tools. If MCP is unavailable, use VisibleBrowser for real visible Puppeteer control. BrowserDebug is headless fallback only when visible control is unnecessary.`,
      `Browser interaction rule: if the user asks to click, press, fill, select, submit, open a web app path, or inspect page-by-page data, WebFetch is not enough and BrowserDebug is not user-visible. Use chrome-devtools MCP or VisibleBrowser so the user can watch a normal browser. Never claim "đã bấm/đã điền/đã mở/đã kiểm tra" from prose alone.`,
      `Figma/design-to-code: if the user gives a Figma URL or asks to implement a Figma frame, call DesignToCode with the Figma frame URL and an output_path. Do not only describe the design. If the user asks to modify the Figma canvas itself, use MCP server "figma" when configured and say clearly when it is not connected.`,
      `When a task touches coding, agents, UI, brand, or design, inspect the relevant required local resource in depth before deciding.`,
      `If the user asks you to modify, run, inspect, check, publish, commit, or otherwise act on the project, you MUST use tools. Do not claim completion without a tool result from this turn.`,
      ``,
      buildCodingMasteryContract(),
      ``,
      buildHermesCoreContract(),
      ``,
      `## Debug Excellence`,
      `For bugs, crashes, test failures, or "not working": identify the first hard failure, reproduce or inspect logs, trace the exact runtime path, patch the smallest root cause, and verify with the closest command. For frontend/runtime UI issues with a URL/dev server, prefer chrome-devtools MCP in visible Chrome; use BrowserDebug only as a headless fallback.`,
      ``,
      `## Design Excellence`,
      `For UI/design work: inspect existing components/styles and any design resources first. Build a polished, responsive, domain-appropriate interface with complete states and clear interactions. Avoid generic placeholders, fake controls, one-note palettes, and unverified visual claims.`,
      ``,
      `## Image Inputs`,
      `The user may attach images or paste screenshots. Analyze visual content directly, extract concrete UI/debug evidence, and connect it to files/routes/components when project action is requested.`,
      ``,
      `## Session`,
      `Working directory: ${this.projectPath}`,
      `Current session: ${this.session?.getSessionId?.()?.substring(0, 8) || 'unknown'}`,
      `${requiredResourcesStr}${resourceProfileStr}${memoryStr}${plansStr}${skillsStr}${workflowStr}${blueprintStr}${startupPlanStr}${sessionSignalsStr}`,
      context ? `\n## Project Context\n${this._compactText(context, projectContextBudget, 'project context')}` : '',
      ``,
      `Be helpful, be precise, and get things done. Always respond in Vietnamese.`,
    ].join('\n');
  }

  buildFastSystemPrompt() {
    const memories = this.session?.getMemory?.() || [];
    const requiredLocalResources = this.getRequiredLocalResources();
    const resourceApplicationProfile = this.getResourceApplicationProfile();
    const requiredResourcesStr = requiredLocalResources
      ? `\nQuy tac resource bat buoc:\n${this._compactText(requiredLocalResources, 900, 'required local resources')}`
      : '';
    const resourceProfileStr = resourceApplicationProfile
      ? `\nResource profile tu dong nap:\n${this._compactText(resourceApplicationProfile, 1100, 'resource application profile')}`
      : '';
    const memoryStr = memories.length > 0
      ? `\nContext nhớ ngắn:\n${this._summarizePrompts(memories.slice(-8), {
          limit: 8,
          maxEntryChars: 160,
          maxTotalChars: 1200,
          mapper: memory => memory.text,
        })}`
      : '';

    return [
      'Bạn là Winter, trợ lý AI agent trả lời ngắn gọn bằng tiếng Việt.',
      'Ưu tiên dùng tool và context khi cần; không bịa thông tin.',
      'Nếu người dùng yêu cầu sửa file/chạy lệnh/đọc dự án thì hãy gọi tool tương ứng thay vì chỉ nói chung chung.',
      'Debug theo chuỗi: tái hiện/đọc log -> truy nguyên nhân -> sửa nhỏ nhất -> chạy kiểm chứng.',
      'UI/design: đọc giao diện hiện có và resource liên quan trước, làm polish thật, không placeholder.',
      'Nếu có ảnh/screenshot đính kèm hoặc paste từ clipboard, phân tích trực tiếp ảnh đó.',
      'Luôn tuân thủ Required Local Resource Rules nếu có; không hạ chất lượng theo model.',
      requiredResourcesStr,
      resourceProfileStr,
      memoryStr,
    ].filter(Boolean).join('\n');
  }

  buildAgentSystemPrompt(role, context = '') {
    const memories = this.session?.getMemory?.() || [];
    const plans = this.session?.getPlans?.() || [];
    const sessionContext = this.session?.getContext?.() || {};
    const requiredLocalResources = this.getRequiredLocalResources();
    const resourceApplicationProfile = this.getResourceApplicationProfile();
    const scale = getModelBudgetMultiplier(this.ai?._modelTier || '');
    const projectContextBudget = Math.round(3200 * (scale || 1));

    const memoryStr = memories.length > 0 ? this._formatMemories(memories, { maxTotalChars: Math.round(900 * (scale || 1)) }) : '';
    const requiredResourcesStr = requiredLocalResources
      ? `\n## Required Local Resource Rules\n${this._compactText(requiredLocalResources, Math.round(1600 * (scale || 1)), 'required local resources')}`
      : '';
    const resourceProfileStr = resourceApplicationProfile
      ? `\n## Auto-loaded Resource Application Profile\n${this._compactText(resourceApplicationProfile, Math.round(2200 * (scale || 1)), 'resource application profile')}`
      : '';
    const plansStr = plans.length > 0 ? this._formatPlans(plans, { maxTotalChars: Math.round(900 * (scale || 1)) }) : '';
    const skillsStr = Array.isArray(sessionContext.activeSkills) && sessionContext.activeSkills.length > 0
      ? `\n## Auto-applied Skills\n${sessionContext.activeSkills.slice(0, 12).map(skill => `- ${skill}`).join('\n')}${sessionContext.activeSkills.length > 12 ? '\n- ...' : ''}`
      : '';
    const startupPlanStr = sessionContext.bootstrapPlan?.title
      ? `\n## Startup Plan\n- ${sessionContext.bootstrapPlan.title}: ${sessionContext.bootstrapPlan.description}`
      : '';

    const rolePrompts = {
      plan: 'You are a Winter planning subagent. Break the request into a concise step-by-step plan, note dependencies, and keep the response short.',
      review: 'You are a Winter review subagent. Critique the request or implementation with specific issues, edge cases, and concrete improvements.',
      debug: 'You are a Winter debugging subagent. Reproduce or inspect the exact failing path, isolate the first hard blocker, patch the smallest root cause, and verify with the closest test/build/browser smoke.',
      research: 'You are a Winter research subagent. Gather the important facts, compare options, and summarize only what matters.',
      browser: `You are a Winter browser subagent. Bạn CÓ QUYỀN sử dụng chrome-devtools MCP hoặc VisibleBrowser để thao tác browser visible cho user xem: mở URL, click, fill form, snapshot, screenshot, đọc console/network. Dùng BrowserDebug chỉ khi cần headless fallback.`,
    };

    const rolePrompt = rolePrompts[role] || 'You are a Winter coding subagent. Solve the task directly, use tools when needed, and return a concise result.';

    const runtimeSummary = this.tools?.getRuntimeEnvironmentSummary?.() || this._defaultEnvironmentSummary();

    return [
      '## CRITICAL AI RULES (MUST FOLLOW STRICTLY):',
      '0. [REQUIRED LOCAL RESOURCES]: Always obey Required Local Resource Rules when present. They override generic behavior and apply to every model size.',
      '1. [THINKING BEFORE CODING]: State assumptions, constraints, and a brief plan before making changes. Be thorough enough to be useful, and do not invent facts.',
      '2. [AGENT LOOP]: Inspect -> hypothesize -> act -> verify -> final. Do not stop at analysis when the user asked for action.',
      '3. [DEBUG EXCELLENCE]: Reproduce or inspect the failing path first, isolate the first hard blocker, patch root cause, and verify with the closest test/build/browser smoke.',
      '4. [DESIGN EXCELLENCE]: Use rich aesthetics. Default to modern UI frameworks if applicable. Never output plain, ugly HTML/CSS. Ensure responsive, premium feel with micro-animations.',
      '5. [CODE QUALITY]: Write clean, modular, SOLID code. Check for syntax errors carefully. Do not generate incomplete code blocks.',
      '6. [NO HALLUCINATION]: If you don\'t know, use tools (Grep/Read/Web/chrome-devtools MCP/VisibleBrowser/BrowserDebug) to find out. Do not guess file paths or APIs.',
      '7. [TOOL EXECUTION FIRST]: You DO have file tools. Use Write to create/overwrite files and Edit to patch files. Never say there is no write tool.',
      '8. [IMAGE INPUTS]: If an image is attached or pasted, analyze it directly and use it as evidence for UI/debug/design decisions.',
      '',
      rolePrompt,
      '',
      '## Tool Rules',
      '- Canonical tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate, TaskList, OpenBrowser, VisibleBrowser, BrowserDebug, DesignToCode, WebFetch, WebSearch, MCP, Agent, DelegateTask, ParallelAgent.',
      '- For multi-agent work, use DelegateTask for one isolated subagent or ParallelAgent for independent concurrent subagents; do not pretend delegation happened without tool evidence.',
      '- If native tool calls are unavailable, output exactly one fallback tool call and no prose: <invoke name="Read"><parameter name="path">README.md</parameter></invoke> OR {"tool":"Read","arguments":{"path":"README.md"}} OR CALL_TOOL Read {"path":"README.md"}.',
      '- Treat skills, memories, bundled resources, local project rules, and the tool list as operational context. Use them proactively when relevant.',
      `- Runtime environment:\n${runtimeSummary}`,
      '- Prefer Write/Edit for writing files. Bash accepts both PowerShell and cmd.exe on Windows, but do not use long echo chains for code files.',
      '- For action requests, use tools before claiming anything is done. Never claim files changed, tests ran, or checks passed unless this conversation contains the matching tool result.',
      '- If a tool call fails because of an unknown alias, call the canonical tool name next.',
      '- Always start with a brief plan, then refine it when new facts appear.',
      '- Coding mastery: inspect entrypoint/callers/callees/tests first, preserve invariants, patch minimally, review the diff, and verify with the closest command.',
      '',
      buildCodingMasteryContract({ compact: true }),
      '',
      buildHermesCoreContract({ compact: true }),
      '',
      '## Project',
      `Working directory: ${this.projectPath}`,
      `Current session: ${this.session?.getSessionId?.()?.substring(0, 8) || 'unknown'}`,
      `${requiredResourcesStr}${resourceProfileStr}${memoryStr}${plansStr}${skillsStr}${startupPlanStr}`,
      context ? `\n## Project Context\n${this._compactText(context, projectContextBudget, 'project context')}` : '',
    ].join('\n');
  }

  /** @private */
  _formatMemories(memories, options = {}) {
    const priorityPatterns = [
      /^\[Recent Work Ledger\]/i,
      /^\[Conversation Summary\]/i,
      /^\[Project Anchor\]/i,
    ];
    const priority = [];
    const regular = [];

    for (const memory of memories) {
      const text = typeof memory === 'string' ? memory : memory?.text || '';
      if (priorityPatterns.some(pattern => pattern.test(text))) {
        priority.push(memory);
      } else {
        regular.push(memory);
      }
    }

    const ordered = [
      ...regular.slice(-Math.max(0, (options.limit || 10) - Math.min(priority.length, 4))),
      ...priority.slice(-4),
    ];

    return `\n## Memories (Important Context)\n${this._summarizePrompts(ordered, {
      limit: options.limit || 10,
      maxEntryChars: 220,
      maxTotalChars: options.maxTotalChars || 1200,
      mapper: memory => typeof memory === 'string' ? memory : memory?.text,
    })}`;
  }

  /** @private */
  _formatPlans(plans, options = {}) {
    return `\n## Active Plans & Tasks\n${this._summarizePrompts(plans, {
      limit: 6,
      maxEntryChars: 260,
      maxTotalChars: options.maxTotalChars || 1200,
      mapper: plan => `[${plan.status}] ${plan.title}: ${plan.description}`,
    })}`;
  }

  /** @private */
  _defaultEnvironmentSummary() {
    return formatRuntimeEnvironmentSummary(getRuntimeEnvironment());
  }

  /** @private */
  _compactText(text, maxChars = 1000, label = 'text') {
    if (this._compactText) return this._compactText(text, maxChars, label);
    if (!text || text.length <= maxChars) return text || '';
    return text.slice(0, maxChars) + `\n\n[... ${label} truncated at ${maxChars} chars]`;
  }
}
