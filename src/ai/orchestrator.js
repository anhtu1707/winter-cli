/**
 * ❄ MULTI-MODEL ORCHESTRATOR ❄
 * Run multiple AI models in parallel, compare results, vote, and merge.
 */

import { classifyModelTier, MODEL_TIERS } from './model-capabilities.js';
import { colors } from '../cli/snowflake-logo.js';

const ENSEMBLE_STRATEGIES = {
  /** Run all, return all side by side */
  ALL: 'all',
  /** Run all, vote to pick best */
  VOTE: 'vote',
  /** Run in pipeline: classify → parallel → merge → review */
  PIPELINE: 'pipeline',
  /** Run cheapest first, upgrade only if needed */
  SMART: 'smart',
};

function measureTime() {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1e6;
}

export class Orchestrator {
  constructor({ ai, tools, projectPath } = {}) {
    this.ai = ai;
    this.tools = tools;
    this.projectPath = projectPath || process.cwd();
    this._voteTemplates = {
      code: `You are a senior engineer. Compare these solutions and pick the best one.
Criteria: correctness, simplicity, readability, performance.
Respond with the NUMBER of the best solution only, no explanation.

{solutions}`,
      general: `Compare these answers and pick the best one.
Criteria: accuracy, completeness, clarity, helpfulness.
Respond with the NUMBER of the best solution only, no explanation.

{solutions}`,
      creative: `You are a creative director. Compare these approaches and pick the best one.
Criteria: creativity, originality, effectiveness, polish.
Respond with the NUMBER of the best solution only, no explanation.

{solutions}`,
    };
  }

  /**
   * Run all available providers on the same prompt, return results side by side.
   * @param {string} prompt
   * @param {object} [options]
   * @param {string} [options.system] - System prompt override
   * @param {boolean} [options.verbose] - Show per-provider timing
   * @returns {Promise<object>} results grouped by provider
   */
  async ensemble(prompt, options = {}) {
    await this.ai.init();
    const providers = Object.entries(this.ai.providers)
      .filter(([, p]) => p.ready)
      .slice(0, 6); // Max 6 providers

    if (providers.length === 0) {
      return { error: 'No providers available', results: {} };
    }

    const messages = [
      { role: 'system', content: options.system || this.ai.getSystemPrompt() },
      { role: 'user', content: prompt },
    ];

    console.log(`\n${colors.cyan}◆ Ensemble: running ${providers.length} providers in parallel...${colors.reset}`);

    const results = await Promise.allSettled(
      providers.map(async ([name, provider]) => {
        const elapsed = measureTime();
        const data = await this.ai.sendRequestToProvider(provider, messages, {
          enableTools: false,
          model: options.model || provider.model,
        });
        const ms = elapsed();
        return {
          name,
          provider,
          content: data.choices?.[0]?.message?.content || '',
          model: provider.model,
          tier: classifyModelTier(provider.model, name),
          usage: data.usage || {},
          ms,
        };
      })
    );

    const output = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        output[r.name] = {
          content: r.content,
          model: r.model,
          tier: r.tier,
          usage: r.usage,
          ms: r.ms,
          error: null,
        };
        if (options.verbose !== false) {
          const msStr = `${r.ms.toFixed(0)}ms`.padStart(8);
          const tierStr = (r.tier || 'unknown').padEnd(10);
          const modelStr = r.model.padEnd(32).slice(0, 32);
          console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}${r.name}${colors.reset} ${colors.dim}(${modelStr} tier=${tierStr} ${msStr})${colors.reset}`);
        }
      } else {
        const err = result.reason;
        // Extract name from error context if possible
        const name = err.message?.includes(':') ? err.message.split(':')[0] : 'unknown';
        output[name] = {
          content: '',
          model: 'unknown',
          tier: null,
          usage: {},
          ms: 0,
          error: err.message,
        };
        console.log(`  ${colors.red}✖${colors.reset} ${name}: ${err.message}`);
      }
    }

    return { results: output };
  }

  /**
   * Run multiple models, then use a judge model to vote for the best answer.
   * @param {string} prompt
   * @param {object} [options]
   * @param {string} [options.judge] - Provider to use as judge (default: best available)
   * @param {string} [options.taskType] - 'code' | 'general' | 'creative' (influences voting criteria)
   * @returns {Promise<object>} winner and all results
   */
  async vote(prompt, options = {}) {
    const ensembleResults = await this.ensemble(prompt, options);
    if (ensembleResults.error) return ensembleResults;

    const results = ensembleResults.results;
    const entries = Object.entries(results).filter(([, r]) => !r.error && r.content.trim().length > 10);

    if (entries.length === 0) {
      return { ...ensembleResults, winner: null, error: 'No usable results to vote on' };
    }

    if (entries.length === 1) {
      const [name] = entries[0];
      return { ...ensembleResults, winner: name, votes: {} };
    }

    // Build voting prompt
    const taskType = options.taskType || this._detectTaskType(prompt);
    const template = this._voteTemplates[taskType] || this._voteTemplates.general;
    const solutionBlocks = entries
      .map(([name, r], i) => `[Solution ${i + 1}] (${name}/${r.model})\n${r.content.slice(0, 2000)}`)
      .join('\n\n---\n\n');
    const votePrompt = template.replace('{solutions}', solutionBlocks);

    console.log(`\n${colors.cyan}✓  Voting: comparing ${entries.length} solutions...${colors.reset}`);

    // Choose judge — prefer best available model
    const judgeProvider = options.judge || this._pickBestJudge(entries.map(([n]) => n));
    const judge = this.ai.providers[judgeProvider];

    let winnerIndex = 0;
    if (judge) {
      try {
        const judgeResult = await this.ai.sendRequestToProvider(judge, [
          { role: 'user', content: votePrompt }
        ], { enableTools: false, model: options.model || judge.model });
        const judgeText = judgeResult.choices?.[0]?.message?.content || '';

        // Parse vote: look for a number
        const numMatch = judgeText.match(/(\d+)/);
        if (numMatch) {
          winnerIndex = Math.max(0, Math.min(entries.length - 1, parseInt(numMatch[1], 10) - 1));
        }
      } catch (err) {
        console.log(`  ${colors.yellow}⚠ Judge ${judgeProvider} failed: ${err.message}. Defaulting to first.${colors.reset}`);
      }
    }

    const [winnerName] = entries[winnerIndex];
    console.log(`  ${colors.green}★ Winner: ${winnerName}${colors.reset}`);

    return {
      ...ensembleResults,
      winner: winnerName,
      votes: { judge: judgeProvider, winnerIndex },
    };
  }

  /**
   * Full pipeline orchestration: classify → parallel execution → merge → review.
   * @param {string} task
   * @param {object} [options]
   * @returns {Promise<object>} pipeline result
   */
  async orchestrate(task, options = {}) {
    const startTime = measureTime();
    console.log(`\n${colors.cyan}» Pipeline orchestration starting...${colors.reset}`);

    // Step 1: Classify task
    const taskInfo = this._classifyTask(task);
    console.log(`  ${colors.dim}1/4 Classify:${colors.reset} ${taskInfo?.category || 'general'} (${taskInfo?.type || 'moderate'})`);

    // Step 2: Run multiple models in parallel with different focuses
    const strategies = this._buildStrategies(taskInfo);
    console.log(`  ${colors.dim}2/4 Execute:${colors.reset} ${strategies.length} parallel strategies`);

    const parallelResults = await Promise.allSettled(
      strategies.map(async (strategy) => {
        const elapsed = measureTime();
        const systemPrompt = [
          (this.ai.getSystemPrompt?.() || 'You are Winter, an expert AI coding assistant.')
            + `\n\n## Role\nYou are a ${strategy.role} subagent focusing on: ${strategy.focus}\n## Task\n${task}`,
          `\n## Strategy Focus\n${strategy.focus}`,
          taskInfo ? `\n## Task Context\nCategory: ${taskInfo.category}\nType: ${taskInfo.type}` : '',
        ].join('\n');

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task },
        ];

        const data = await this.ai.sendRequest(messages, {
          ...options,
          enableTools: true,
        });
        const content = data.choices?.[0]?.message?.content || '';
        return {
          strategy: strategy.name,
          role: strategy.role,
          focus: strategy.focus,
          content,
          ms: elapsed(),
        };
      })
    );

    const strategyResults = [];
    for (const r of parallelResults) {
      if (r.status === 'fulfilled') {
        strategyResults.push(r.value);
        console.log(`    ${colors.green}✓${colors.reset} ${r.value.strategy} (${r.value.ms.toFixed(0)}ms)`);
      } else {
        console.log(`    ${colors.red}✖${colors.reset} ${r.reason.message}`);
      }
    }

    // Step 3: Merge results
    console.log(`  ${colors.dim}3/4 Merge:${colors.reset} combining ${strategyResults.length} perspectives`);
    const merged = await this._mergeResults(task, strategyResults, options);

    // Step 4: Review
    console.log(`  ${colors.dim}4/4 Review:${colors.reset} final quality check`);
    const reviewed = await this._reviewResult(task, merged.content, options);

    const totalMs = startTime();
    console.log(`  ${colors.green}✓${colors.reset} Pipeline complete in ${totalMs.toFixed(0)}ms`);

    return {
      task,
      taskInfo,
      strategies: strategyResults,
      merged: merged.content,
      review: reviewed,
      totalMs,
    };
  }

  /**
   * Smart routing: run cheapest model first, upgrade if needed.
   */
  async smartRoute(prompt, options = {}) {
    await this.ai.init();
    const providers = Object.entries(this.ai.providers).filter(([, p]) => p.ready);

    // Sort by capability tier (smallest first)
    const tierOrder = { tiny: 0, small: 1, medium: 2, large: 3, flagship: 4 };
    providers.sort((a, b) => {
      const ta = tierOrder[classifyModelTier(a[1].model, a[0])] ?? 2;
      const tb = tierOrder[classifyModelTier(b[1].model, b[0])] ?? 2;
      return ta - tb;
    });

    const taskInfo = this._classifyTask(prompt);
    const complexity = taskInfo?.type || 'moderate';
    const requiredTier = complexity === 'deep' || complexity === 'complex'
      ? 'large' : complexity === 'moderate' ? 'medium' : 'small';

    console.log(`\n${colors.cyan}◆ Smart route: required tier=${requiredTier}, task=${complexity}${colors.reset}`);

    const messages = [
      { role: 'system', content: options.system || this.ai.getSystemPrompt() },
      { role: 'user', content: prompt },
    ];

    for (const [name, provider] of providers) {
      const tier = classifyModelTier(provider.model, name);
      const tierValue = tierOrder[tier] ?? 2;
      const requiredValue = tierOrder[requiredTier] ?? 2;

      if (tierValue < requiredValue) {
        console.log(`  ${colors.dim}⏭ Skipping ${name} (${tier}) — below required ${requiredTier}${colors.reset}`);
        continue;
      }

      console.log(`  ${colors.cyan}→ Trying ${name} (${tier})...${colors.reset}`);
      try {
        const elapsed = measureTime();
        const data = await this.ai.sendRequestToProvider(provider, messages, {
          ...options,
          enableTools: options.enableTools !== false,
        });
        const content = data.choices?.[0]?.message?.content || '';
        const ms = elapsed();

        // Quick quality check for complex tasks
        if (content.length < 20) {
          console.log(`  ${colors.yellow}⚠ ${name} response too short (${content.length} chars), trying next...${colors.reset}`);
          continue;
        }

        console.log(`  ${colors.green}✓ ${name} succeeded (${ms.toFixed(0)}ms, ${content.length} chars)${colors.reset}`);
        return {
          provider: name,
          model: provider.model,
          tier,
          content,
          ms,
        };
      } catch (err) {
        console.log(`  ${colors.yellow}⚠ ${name} failed: ${err.message}${colors.reset}`);
        continue;
      }
    }

    return { error: 'No provider could handle the request', content: '' };
  }

  /** @private */
  _classifyTask(task) {
    const text = String(task || '').toLowerCase();
    if (/\b(code|function|impl|api|db|sql|react|component|test|bug|fix)\b/.test(text)) {
      return { category: 'code', type: 'complex' };
    }
    if (/\b(design|ui|ux|layout|style|theme|color|animat|responsive)\b/.test(text)) {
      return { category: 'design', type: 'moderate' };
    }
    if (/\b(doc|readme|explain|summary|describe|write|essay)\b/.test(text)) {
      return { category: 'writing', type: 'simple' };
    }
    return { category: 'general', type: 'moderate' };
  }

  /** @private */
  _detectTaskType(prompt) {
    const text = String(prompt || '').toLowerCase();
    if (/\b(code|function|class|implement|api|route|endpoint|database|sql|query|migration|component|react|vue|angular|node|python|javascript|typescript)\b/.test(text)) {
      return 'code';
    }
    if (/\b(draw|design|ui|layout|color|theme|animation|creative|art|write|story|poem|essay)\b/.test(text)) {
      return 'creative';
    }
    return 'general';
  }

  /** @private */
  _pickBestJudge(availableProviders) {
    // Prefer flagship models for judging
    const preference = ['claude', 'openai', 'custom', 'groq', 'ollama'];
    for (const name of preference) {
      if (availableProviders.includes(name)) return name;
    }
    return availableProviders[0] || null;
  }

  /** @private */
  _buildStrategies(taskInfo) {
    const strategies = [];

    strategies.push({
      name: 'Implementation',
      role: 'coding',
      focus: 'Write clean, correct code. Focus on the implementation details, edge cases, and correctness.',
    });

    strategies.push({
      name: 'Architecture',
      role: 'review',
      focus: 'Focus on architecture, design patterns, separation of concerns, and scalability. Suggest improvements to the overall structure.',
    });

    if (taskInfo?.category === 'design' || taskInfo?.category === 'ui') {
      strategies.push({
        name: 'Design',
        role: 'research',
        focus: 'Focus on UI/UX, visual design, responsive layout, accessibility, and user experience. Suggest design improvements.',
      });
    }

    strategies.push({
      name: 'Testing',
      role: 'debug',
      focus: 'Focus on testability, edge cases, error handling, and potential bugs. Identify what could go wrong.',
    });

    return strategies;
  }

  /** @private */
  async _mergeResults(task, strategyResults, options) {
    if (strategyResults.length === 0) {
      return { content: 'No strategy results to merge.' };
    }

    if (strategyResults.length === 1) {
      return { content: strategyResults[0].content };
    }

    const mergePrompt = `I have received multiple perspectives on the following task:

TASK: ${task}

Please merge the following responses into a single coherent answer. Resolve any contradictions, keep the best ideas from each, and produce the final output.

${strategyResults.map((s, i) => `=== ${s.strategy} (${s.role}) ===\n${s.content.slice(0, 3000)}`).join('\n\n')}

Final merged response:`;

    try {
      const data = await this.ai.sendRequest([
        { role: 'system', content: 'You are a merge specialist. Combine multiple perspectives into one coherent answer.' },
        { role: 'user', content: mergePrompt },
      ], { ...options, enableTools: false });

      return { content: data.choices?.[0]?.message?.content || '' };
    } catch (err) {
      // Fallback: concatenate
      return { content: strategyResults.map(s => `## ${s.strategy}\n${s.content}`).join('\n\n') };
    }
  }

  /** @private */
  async _reviewResult(task, mergedContent, options) {
    if (!mergedContent || mergedContent.length < 20) return null;

    const reviewPrompt = `Review this response for a task and provide a brief quality assessment:

TASK: ${task}

RESPONSE:
${mergedContent.slice(0, 4000)}

Check for:
1. Does it actually answer the task?
2. Are there any errors or hallucinations?
3. Is the code correct (if any)?
4. Is it complete and actionable?

Provide a brief assessment (2-3 sentences):`;

    try {
      const data = await this.ai.sendRequest([
        { role: 'user', content: reviewPrompt }
      ], { ...options, enableTools: false });

      return { assessment: data.choices?.[0]?.message?.content || '' };
    } catch {
      return null;
    }
  }
}
