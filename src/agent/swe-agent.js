export class SweAgent {
  constructor({ repl } = {}) {
    this.repl = repl;
  }

  buildPlan(task) {
    return [
      {
        phase: 'understand',
        instruction: `Restate the requested change and success criteria: ${task}`,
        verification: 'The acceptance criteria are concrete and testable.',
      },
      {
        phase: 'inspect',
        instruction: 'Inspect entrypoints, affected modules, and the closest tests before editing.',
        verification: 'The chosen files explain the failing or missing behavior.',
      },
      {
        phase: 'decompose',
        instruction: 'Split the task into small implementation steps with disjoint risks.',
        verification: 'Each step can be verified independently.',
      },
      {
        phase: 'implement',
        instruction: 'Make the smallest direct code changes that satisfy the task.',
        verification: 'No unrelated refactors or user changes were reverted.',
      },
      {
        phase: 'verify',
        instruction: 'Run focused tests first, then broader verification when shared behavior changed.',
        verification: 'Failures are fixed or reported with exact command output.',
      },
      {
        phase: 'review',
        instruction: 'Self-review your own implementation. Check each acceptance criterion. Look for edge cases.',
        verification: 'All acceptance criteria are met. No obvious bugs or edge cases missed.',
      },
      {
        phase: 'report',
        instruction: 'Report changed files, verification commands, and remaining risks.',
        verification: 'The final answer is actionable and names any unverified area.',
      },
    ];
  }

  /**
   * Builds a structured prompt with:
   * - Chain-of-Thought reasoning instructions (to help weaker models)
   * - XML-structured output format
   * - Self-verification requirements
   */
  buildPrompt(task) {
    const plan = this.buildPlan(task);
    const planText = plan
      .map((step, index) => `${index + 1}. ${step.phase}: ${step.instruction} Check: ${step.verification}`)
      .join('\n');

    return [
      '# SWE Agent — Structured Coding Task',
      '',
      'You are a structured coding assistant. You MUST follow the plan below step by step.',
      '',
      '## Chain-of-Thought Reasoning',
      '',
      'Before each action (reading a file, editing code, running a command), write your reasoning inside <thinking> tags:',
      '',
      '<thinking>',
      '1. What am I trying to accomplish in this step?',
      '2. What information do I already have?',
      '3. What is the most minimal change that achieves this?',
      '4. What could go wrong, and how will I verify?',
      '</thinking>',
      '',
      '## Output Format',
      '',
      'When reporting results, use this XML structure:',
      '',
      '<analysis>',
      'What the code currently does and what needs to change.',
      '</analysis>',
      '',
      '<changes>',
      'List of files changed and why.',
      '</changes>',
      '',
      '<verification>',
      'Commands run, test results, edge cases checked.',
      '</verification>',
      '',
      '## Rules',
      '',
      '1. DECOMPOSE before editing — split the task into small independent steps.',
      '2. USE tool results as evidence. Do NOT invent file contents, command output, or passing tests.',
      '3. KEEP edits scoped to the relevant files only.',
      '4. VERIFY each step before moving to the next.',
      '5. SELF-REVIEW after implementing — check every acceptance criterion.',
      '6. REPORT only files touched for this task.',
      '',
      `## Task`,
      '',
      task,
      '',
      '## Plan',
      '',
      planText,
    ].join('\n');
  }

  /**
   * Builds a self-verification prompt that can be sent after implementation
   * to force the model to review its own code.
   */
  buildSelfVerificationPrompt(task, changedFiles) {
    return [
      '# Self-Verification Step',
      '',
      'You just implemented changes for the following task:',
      `Task: ${task}`,
      changedFiles && changedFiles.length ? `Changed files: ${changedFiles.join(', ')}` : '',
      '',
      '## Review Instructions',
      '',
      'Now review your own implementation carefully. Write <thinking> tags for each check:',
      '',
      '<thinking>',
      '1. Does the implementation fully satisfy ALL acceptance criteria?',
      '2. Are there any edge cases NOT handled?',
      '3. Are there any potential bugs or regressions?',
      '4. Is there any dead code, unused variables, or unnecessary changes?',
      '5. Are the changes minimal and scoped to only what was requested?',
      '</thinking>',
      '',
      'After your analysis, either:',
      '- CONFIRM: All checks pass, implementation is complete.',
      '- REVISE: List what needs to be fixed and fix it.',
      '',
    ].filter(Boolean).join('\n');
  }

  /**
   * Extracts a markdown code block or XML content from LLM output.
   * Useful for parsing structured responses from weaker models.
   */
  extractStructuredOutput(text, tag) {
    if (!text) return null;
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  async run(task) {
    if (!this.repl) {
      return {
        success: false,
        error: 'SWE agent requires a REPL instance',
      };
    }

    const plan = this.buildPlan(task);
    const prompt = this.buildPrompt(task);
    await this.repl.session?.createPlan?.(
      'SWE agent task',
      plan.map(step => `${step.phase}: ${step.instruction}`).join('\n')
    );
    await this.repl.runAgent?.('debug', prompt);

    return { success: true, plan, prompt };
  }
}
