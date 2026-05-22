import { formatRuntimeEnvironmentSummary, getRuntimeEnvironment } from './runtime-env.js';
import { getModelBudgetMultiplier } from '../ai/model-capabilities.js';

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

  buildSystemPrompt(context = '', options = {}) {
    const memories = this.session?.getMemory?.() || [];
    const plans = this.session?.getPlans?.() || [];
    const sessionContext = this.session?.getContext?.() || {};
    const environmentSummary = this.tools?.getRuntimeEnvironmentSummary?.() || this._defaultEnvironmentSummary();
    const requiredLocalResources = this.getRequiredLocalResources();
    const scale = getModelBudgetMultiplier(options.modelTier);
    const projectContextBudget = options.projectContextBudget || Math.round(3200 * scale);
    const compactSystemPrompt = options.compactSystemPrompt ?? (scale <= 0.75);
    const memoryBudget = Math.round(1200 * scale);
    const planBudget = Math.round(1200 * scale);
    const requiredResourcesBudget = Math.round((compactSystemPrompt ? 1200 : 1600) * scale);
    const workflowBudget = Math.round(900 * scale);
    const blueprintBudget = Math.round(700 * scale);

    const memoryStr = memories.length > 0
      ? this._formatMemories(memories, { maxTotalChars: memoryBudget })
      : '';
    const requiredResourcesStr = requiredLocalResources
      ? `\n## Required Local Resource Rules\n${this._compactText(requiredLocalResources, requiredResourcesBudget, 'required local resources')}`
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
        `${requiredResourcesStr}${memoryStr}${plansStr}${skillsStr}${workflowStr}${blueprintStr}${startupPlanStr}${sessionSignalsStr}`,
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
      `Browser capability: You CAN browse URLs! Use WebFetch to fetch page content (text extraction) or BrowserDebug for Chrome automation (JS rendering, screenshots). If user shares a URL or asks to view a website, use these tools automatically.`,
      `When a task touches coding, agents, UI, brand, or design, inspect the relevant required local resource in depth before deciding.`,
      `If the user asks you to modify, run, inspect, check, publish, commit, or otherwise act on the project, you MUST use tools. Do not claim completion without a tool result from this turn.`,
      ``,
      `## Debug Excellence`,
      `For bugs, crashes, test failures, or "not working": identify the first hard failure, reproduce or inspect logs, trace the exact runtime path, patch the smallest root cause, and verify with the closest command. For frontend/runtime UI issues, use BrowserDebug when a URL or dev server is available.`,
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
      `${requiredResourcesStr}${memoryStr}${plansStr}${skillsStr}${workflowStr}${blueprintStr}${startupPlanStr}${sessionSignalsStr}`,
      context ? `\n## Project Context\n${this._compactText(context, projectContextBudget, 'project context')}` : '',
      ``,
      `Be helpful, be precise, and get things done. Always respond in Vietnamese.`,
    ].join('\n');
  }

  buildFastSystemPrompt() {
    const memories = this.session?.getMemory?.() || [];
    const requiredLocalResources = this.getRequiredLocalResources();
    const requiredResourcesStr = requiredLocalResources
      ? `\nQuy tac resource bat buoc:\n${this._compactText(requiredLocalResources, 900, 'required local resources')}`
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
      memoryStr,
    ].filter(Boolean).join('\n');
  }

  buildAgentSystemPrompt(role, context = '') {
    const memories = this.session?.getMemory?.() || [];
    const plans = this.session?.getPlans?.() || [];
    const sessionContext = this.session?.getContext?.() || {};
    const requiredLocalResources = this.getRequiredLocalResources();
    const scale = getModelBudgetMultiplier(this.ai?._modelTier || '');
    const projectContextBudget = Math.round(3200 * (scale || 1));

    const memoryStr = memories.length > 0 ? this._formatMemories(memories, { maxTotalChars: Math.round(900 * (scale || 1)) }) : '';
    const requiredResourcesStr = requiredLocalResources
      ? `\n## Required Local Resource Rules\n${this._compactText(requiredLocalResources, Math.round(1600 * (scale || 1)), 'required local resources')}`
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
      browser: `You are a Winter browser subagent. Bạn CÓ QUYỀN sử dụng tool 'BrowserDebug' để tương tác với trình duyệt. Hãy dùng nó để mở URL, chụp ảnh màn hình (nếu cần), hoặc chạy JS để kiểm tra trang web.`,
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
      '6. [NO HALLUCINATION]: If you don\'t know, use tools (Grep/Read/Web/BrowserDebug) to find out. Do not guess file paths or APIs.',
      '7. [TOOL EXECUTION FIRST]: You DO have file tools. Use Write to create/overwrite files and Edit to patch files. Never say there is no write tool.',
      '8. [IMAGE INPUTS]: If an image is attached or pasted, analyze it directly and use it as evidence for UI/debug/design decisions.',
      '',
      rolePrompt,
      '',
      '## Tool Rules',
      '- Canonical tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate, TaskList, BrowserDebug, WebFetch, WebSearch.',
      '- If native tool calls are unavailable, output exactly one fallback tool call and no prose: <invoke name="Read"><parameter name="path">README.md</parameter></invoke> OR {"tool":"Read","arguments":{"path":"README.md"}} OR CALL_TOOL Read {"path":"README.md"}.',
      '- Treat skills, memories, bundled resources, local project rules, and the tool list as operational context. Use them proactively when relevant.',
      `- Runtime environment:\n${runtimeSummary}`,
      '- Prefer Write/Edit for writing files. Bash accepts both PowerShell and cmd.exe on Windows, but do not use long echo chains for code files.',
      '- For action requests, use tools before claiming anything is done. Never claim files changed, tests ran, or checks passed unless this conversation contains the matching tool result.',
      '- If a tool call fails because of an unknown alias, call the canonical tool name next.',
      '- Always start with a brief plan, then refine it when new facts appear.',
      '',
      '## Project',
      `Working directory: ${this.projectPath}`,
      `Current session: ${this.session?.getSessionId?.()?.substring(0, 8) || 'unknown'}`,
      `${requiredResourcesStr}${memoryStr}${plansStr}${skillsStr}${startupPlanStr}`,
      context ? `\n## Project Context\n${this._compactText(context, projectContextBudget, 'project context')}` : '',
    ].join('\n');
  }

  /** @private */
  _formatMemories(memories, options = {}) {
    return `\n## Memories (Important Context)\n${this._summarizePrompts(memories, {
      limit: 8,
      maxEntryChars: 220,
      maxTotalChars: options.maxTotalChars || 1200,
      mapper: memory => memory.text,
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
