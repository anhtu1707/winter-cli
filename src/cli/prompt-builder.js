/**
 * PromptBuilder — Builds system prompts for Winter CLI agents.
 * Extracted from WinterREPL to reduce repl.js size.
 */
export class PromptBuilder {
  constructor({ session, tools, projectPath, sessionPermissionGrants, compactText, summarizePrompts } = {}) {
    this.session = session;
    this.tools = tools;
    this.projectPath = projectPath;
    this.sessionPermissionGrants = sessionPermissionGrants;
    this._compactText = compactText;
    this._summarizePrompts = summarizePrompts;
  }

  buildSessionSignalsPrompt() {
    const activeProvider = this.session?.ai?.getActiveProvider?.() || 'unavailable';
    const activeModel = this.session?.ai?.providers?.[activeProvider]?.model || 'unavailable';
    const sessionContext = this.session?.getContext?.() || {};
    const activeSkills = sessionContext.activeSkills?.value || [];
    const toolAllowlist = [...(this.sessionPermissionGrants || [])];

    return [
      '## Session Signals',
      `- Project path: ${this.projectPath}`,
      `- Active provider: ${activeProvider}`,
      `- Active model: ${activeModel}`,
      `- Tool allowlist: ${toolAllowlist.length > 0 ? toolAllowlist.join(', ') : 'none'}`,
      `- Active skills: ${Array.isArray(activeSkills) && activeSkills.length > 0 ? activeSkills.join(', ') : 'none'}`,
    ].join('\n');
  }

  buildSystemPrompt(context = '') {
    const memories = this.session?.getMemory?.() || [];
    const plans = this.session?.getPlans?.() || [];
    const sessionContext = this.session?.getContext?.() || {};
    const environmentSummary = this.tools?.getRuntimeEnvironmentSummary?.() || this._defaultEnvironmentSummary();

    const memoryStr = memories.length > 0
      ? this._formatMemories(memories)
      : '';
    const plansStr = plans.length > 0
      ? this._formatPlans(plans)
      : '';
    const skillsStr = Array.isArray(sessionContext.activeSkills) && sessionContext.activeSkills.length > 0
      ? `\n## Auto-applied Skills\n${sessionContext.activeSkills.slice(0, 12).map(skill => `- ${skill}`).join('\n')}${sessionContext.activeSkills.length > 12 ? '\n- ...' : ''}`
      : '';
    const startupPlanStr = sessionContext.bootstrapPlan?.title
      ? `\n## Startup Plan\n- ${sessionContext.bootstrapPlan.title}: ${sessionContext.bootstrapPlan.description}`
      : '';
    const sessionSignalsStr = `\n${this.buildSessionSignalsPrompt()}`;

    return [
      `You are Winter, an expert AI coding assistant.`,
      ``,
      `## Runtime Environment`,
      environmentSummary,
      ``,
      `## Core Principles`,
      `1. Think Before Coding — State assumptions, ask when uncertain, surface tradeoffs.`,
      `2. Simplicity First — Minimum code that solves the problem. Nothing speculative.`,
      `3. Surgical Changes — Touch only what you must. Clean up only your own mess.`,
      `4. Goal-Driven Execution — Define success criteria. Loop until verified.`,
      ``,
      `## Tool Usage`,
      `You have access to various tools (Read, Write, Edit, Bash, Glob, Grep, etc.).`,
      `Use tools proactively. If you need information, look it up — don't guess.`,
      ``,
      `## Session`,
      `Working directory: ${this.projectPath}`,
      `Current session: ${this.session?.getSessionId?.()?.substring(0, 8) || 'unknown'}`,
      `${memoryStr}${plansStr}${skillsStr}${startupPlanStr}${sessionSignalsStr}`,
      context ? `\n## Project Context\n${this._compactText(context, 6000, 'project context')}` : '',
      ``,
      `Be helpful, be precise, and get things done. Always respond in Vietnamese.`,
    ].join('\n');
  }

  buildFastSystemPrompt() {
    const memories = this.session?.getMemory?.() || [];
    const memoryStr = memories.length > 0
      ? `\nContext nhớ ngắn:\n${this._summarizePrompts(memories.slice(-8), {
          limit: 8,
          maxEntryChars: 160,
          maxTotalChars: 1200,
          mapper: memory => memory.text,
        })}`
      : '';

    return [
      'Bạn là Winter, trợ lý AI trả lời ngắn gọn bằng tiếng Việt.',
      'Ưu tiên dùng tool và context khi cần; không bịa thông tin.',
      'Nếu người dùng yêu cầu sửa file/chạy lệnh/đọc dự án thì hãy gọi tool tương ứng thay vì chỉ nói chung chung.',
      memoryStr,
    ].filter(Boolean).join('\n');
  }

  buildAgentSystemPrompt(role, context = '') {
    const memories = this.session?.getMemory?.() || [];
    const plans = this.session?.getPlans?.() || [];
    const sessionContext = this.session?.getContext?.() || {};

    const memoryStr = memories.length > 0 ? this._formatMemories(memories) : '';
    const plansStr = plans.length > 0 ? this._formatPlans(plans) : '';
    const skillsStr = Array.isArray(sessionContext.activeSkills) && sessionContext.activeSkills.length > 0
      ? `\n## Auto-applied Skills\n${sessionContext.activeSkills.slice(0, 12).map(skill => `- ${skill}`).join('\n')}${sessionContext.activeSkills.length > 12 ? '\n- ...' : ''}`
      : '';
    const startupPlanStr = sessionContext.bootstrapPlan?.title
      ? `\n## Startup Plan\n- ${sessionContext.bootstrapPlan.title}: ${sessionContext.bootstrapPlan.description}`
      : '';

    const rolePrompts = {
      plan: 'You are a Winter planning subagent. Break the request into a concise step-by-step plan, note dependencies, and keep the response short.',
      review: 'You are a Winter review subagent. Critique the request or implementation with specific issues, edge cases, and concrete improvements.',
      debug: 'You are a Winter debugging subagent. Focus on root cause, reproduction, and the smallest fix.',
      research: 'You are a Winter research subagent. Gather the important facts, compare options, and summarize only what matters.',
      browser: `You are a Winter browser subagent. Bạn CÓ QUYỀN sử dụng tool 'BrowserDebug' để tương tác với trình duyệt. Hãy dùng nó để mở URL, chụp ảnh màn hình (nếu cần), hoặc chạy JS để kiểm tra trang web.`,
    };

    const rolePrompt = rolePrompts[role] || 'You are a Winter coding subagent. Solve the task directly, use tools when needed, and return a concise result.';

    const osInfo = process.platform === 'win32'
      ? 'Windows; Bash auto-detects PowerShell and cmd.exe syntax. Use shell="powershell" or shell="cmd" when needed.'
      : process.platform;

    return [
      '## CRITICAL AI RULES (MUST FOLLOW STRICTLY):',
      '1. [THINKING BEFORE CODING]: State assumptions, constraints, and a brief plan before making changes. Be thorough enough to be useful, and do not invent facts.',
      '2. [DESIGN EXCELLENCE]: Use rich aesthetics. Default to modern UI frameworks if applicable. Never output plain, ugly HTML/CSS. Ensure responsive, premium feel with micro-animations.',
      '3. [CODE QUALITY]: Write clean, modular, SOLID code. Check for syntax errors carefully. Do not generate incomplete code blocks.',
      '4. [NO HALLUCINATION]: If you don\'t know, use tools (Grep/Read/Web) to find out. Do not guess file paths or APIs.',
      '5. [TOOL EXECUTION FIRST]: You DO have file tools. Use Write to create/overwrite files and Edit to patch files. Never say there is no write tool.',
      '',
      rolePrompt,
      '',
      '## Tool Rules',
      '- Canonical tools: Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate, TaskList, BrowserDebug, WebFetch, WebSearch.',
      '- Treat skills, memories, bundled resources, local project rules, and the tool list as operational context. Use them proactively when relevant.',
      `- Current OS is ${osInfo}.`,
      '- Prefer Write/Edit for writing files. Bash accepts both PowerShell and cmd.exe on Windows, but do not use long echo chains for code files.',
      '- If a tool call fails because of an unknown alias, call the canonical tool name next.',
      '- Always start with a brief plan, then refine it when new facts appear.',
      '',
      '## Project',
      `Working directory: ${this.projectPath}`,
      `Current session: ${this.session?.getSessionId?.()?.substring(0, 8) || 'unknown'}`,
      `${memoryStr}${plansStr}${skillsStr}${startupPlanStr}`,
      context ? `\n## Project Context\n${this._compactText(context, 6000, 'project context')}` : '',
    ].join('\n');
  }

  /** @private */
  _formatMemories(memories) {
    return `\n## Memories (Important Context)\n${this._summarizePrompts(memories, {
      limit: 8,
      maxEntryChars: 220,
      maxTotalChars: 1600,
      mapper: memory => memory.text,
    })}`;
  }

  /** @private */
  _formatPlans(plans) {
    return `\n## Active Plans & Tasks\n${this._summarizePrompts(plans, {
      limit: 6,
      maxEntryChars: 260,
      maxTotalChars: 1600,
      mapper: plan => `[${plan.status}] ${plan.title}: ${plan.description}`,
    })}`;
  }

  /** @private */
  _defaultEnvironmentSummary() {
    return [
      `Host OS: ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : process.platform}`,
      `Node platform: ${process.platform}`,
      `Current shell hint: ${process.platform === 'win32' ? 'powershell-capable or cmd/unknown' : (process.env.SHELL || 'bash/sh')}`,
      process.platform === 'win32'
        ? 'Shell rule: Use shell:"powershell" for PowerShell cmdlets, shell:"cmd" for cmd.exe syntax, and shell:"auto" when unsure.'
        : 'Shell rule: Use the native POSIX shell on non-Windows hosts and leave shell unspecified unless a specific shell is required.',
    ].join('\n');
  }

  /** @private */
  _compactText(text, maxChars = 1000, label = 'text') {
    if (this._compactText) return this._compactText(text, maxChars, label);
    if (!text || text.length <= maxChars) return text || '';
    return text.slice(0, maxChars) + `\n\n[... ${label} truncated at ${maxChars} chars]`;
  }
}
