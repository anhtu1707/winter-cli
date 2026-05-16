/**
 * Benchmark Engine — Đo độ thông minh của models trong Winter CLI
 *
 * Cố định câu hỏi test (logic, coding, math, reasoning, language)
 * + Coding task thật → chạy qua providers → chấm điểm → so sánh
 */

import { colors } from '../cli/snowflake-logo.js';

// ── Question Bank ────────────────────────────────────────────────────────────

const BENCHMARK_QUESTIONS = [
  {
    id: 'q01',
    category: 'logic',
    question: `If all cats are mammals and some mammals are dogs, are all cats dogs? Explain your reasoning step by step.`,
    keywords: ['not', 'no', 'incorrect', 'cannot conclude', 'not necessarily', 'invalid'],
    weight: 1,
  },
  {
    id: 'q02',
    category: 'coding',
    question: `Write a JavaScript function called isPalindrome that checks if a string is a palindrome (reads the same forwards and backwards). Include example usage.`,
    keywords: ['function', 'palindrome', 'reverse', 'split', 'return'],
    weight: 1.5,
  },
  {
    id: 'q03',
    category: 'math',
    question: `What is 15% of 200? Show your calculation.`,
    keywords: ['30', '15', '200', '0.15'],
    weight: 0.5,
  },
  {
    id: 'q04',
    category: 'reasoning',
    question: `A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Think carefully.`,
    keywords: ['0.05', '5 cents', '5 cent', '0.05$', '5¢', 'five cents'],
    weight: 1.5,
  },
  {
    id: 'q05',
    category: 'coding',
    question: `What's wrong with this code and how would you fix it?\n\nfunction add(a, b) {\n  return a + b;\n}\nconsole.log(add(5, '3'));`,
    keywords: ['string', 'type', 'concatenation', 'number', 'parse', 'typeof', 'coercion'],
    weight: 1,
  },
  {
    id: 'q06',
    category: 'language',
    question: `Translate this sentence to Vietnamese: "Good morning, how are you today?"`,
    keywords: ['chào', 'sáng', 'khỏe', 'hôm nay', 'bạn'],
    weight: 0.5,
  },
  {
    id: 'q07',
    category: 'logic',
    question: `You have a 3-gallon jug and a 5-gallon jug. How can you measure exactly 4 gallons of water? Explain step by step.`,
    keywords: ['fill', 'pour', '3', '5', '4', 'empty'],
    weight: 1.5,
  },
  {
    id: 'q08',
    category: 'coding',
    question: `Write a recursive function to calculate the nth Fibonacci number. Explain how memoization can optimize it.`,
    keywords: ['function', 'fibonacci', 'recursive', 'memoization', 'cache'],
    weight: 1.5,
  },
];

const BENCHMARK_TASKS = [
  {
    id: 't01',
    category: 'coding-task',
    title: 'API Fetch with Error Handling',
    description: 'Write a JavaScript function that fetches JSON data from a URL, handles network errors, HTTP errors, and invalid JSON responses gracefully.',
    evaluationCriteria: ['error handling', 'try/catch', 'async/await', 'fetch', 'response.ok'],
    weight: 2,
  },
  {
    id: 't02',
    category: 'coding-task',
    title: 'Event Emitter Class',
    description: 'Create a simple EventEmitter class in JavaScript with on(), off(), and emit() methods. It should support multiple listeners for the same event and removing listeners.',
    evaluationCriteria: ['class', 'on', 'off', 'emit', 'listeners', 'events'],
    weight: 2,
  },
  {
    id: 't03',
    category: 'coding-task',
    title: 'Fix This Bug',
    description: `What's wrong with this code? Identify ALL bugs and provide a fixed version:\n\nconst users = [\n  { name: 'Alice', age: 30 },\n  { name: 'Bob', age: 25 },\n  { name: 'Charlie', age: 35 },\n];\n\nconst adultUsers = users.filter(u => u.age >= 18);\nadultUsers.forEach(u => {\n  console.log(u.Name);\n});\n\nadultUsers.sort((a, b) => a.age - b.age);\nconst totalAge = adultUsers.reduce((acc, u) => acc + u.age);\nconsole.log('Average age:', totalAge / adultUsers.length);`,
    evaluationCriteria: ['Name', 'name', 'undefined', 'reduce', 'initial', 'initialize', 'capital N'],
    weight: 2.5,
  },
];

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreAnswer(question, answer) {
  if (!answer || typeof answer !== 'string') return 0;

  const lower = answer.toLowerCase();
  let matches = 0;

  for (const kw of question.keywords) {
    if (lower.includes(kw.toLowerCase())) {
      matches++;
    }
  }

  const ratio = question.keywords.length > 0 ? matches / question.keywords.length : 0;

  // Bonus: longer, well-structured answers tend to be better
  const words = answer.split(/\s+/).length;
  const lengthBonus = words > 50 ? 0.1 : words > 20 ? 0.05 : 0;

  return Math.min(1, ratio + lengthBonus);
}

function scoreTask(task, answer) {
  if (!answer || typeof answer !== 'string') return 0;

  const lower = answer.toLowerCase();
  let matches = 0;

  for (const criterion of task.evaluationCriteria) {
    if (lower.includes(criterion.toLowerCase())) {
      matches++;
    }
  }

  const ratio = task.evaluationCriteria.length > 0 ? matches / task.evaluationCriteria.length : 0;
  const words = answer.split(/\s+/).length;
  const lengthBonus = words > 100 ? 0.1 : words > 50 ? 0.05 : 0;

  return Math.min(1, ratio + lengthBonus);
}

// ── Benchmark Runner ─────────────────────────────────────────────────────────

export class BenchmarkRunner {
  constructor(aiManager) {
    this.ai = aiManager;
  }

  /**
   * Run all benchmark questions across specified providers.
   * @param {string[]} providerNames - List of provider names (e.g., ['claude', 'openai', 'ollama'])
   * @param {object} options
   * @param {boolean} options.tasks - Whether to include coding tasks (default: true)
   * @param {boolean} options.questions - Whether to include fixed questions (default: true)
   */
  async run(providerNames, options = {}) {
    const { questions = true, tasks = true } = options;

    await this.ai.init();

    // Filter to only ready providers
    const providers = providerNames
      .map(name => ({ name, provider: this.ai.providers[name] }))
      .filter(({ provider }) => provider && provider.ready);

    if (providers.length === 0) {
      return { error: 'No ready providers found. Configure providers in winter.json first.' };
    }

    const results = {};
    const startTime = Date.now();

    for (const { name, provider } of providers) {
      console.log(`${colors.dim}Benchmarking ${colors.bright}${name}${colors.reset}${colors.dim}...${colors.reset}`);

      const providerResults = [];
      let totalScore = 0;
      let maxScore = 0;

      // Fixed questions
      if (questions) {
        for (const q of BENCHMARK_QUESTIONS) {
          const qStart = Date.now();
          const answer = await this.askProvider(provider, q.question);
          const elapsed = Date.now() - qStart;
          const score = scoreAnswer(q, answer);

          providerResults.push({
            type: 'question',
            id: q.id,
            category: q.category,
            question: q.question,
            answer: answer.slice(0, 500), // truncate for display
            score,
            weightedScore: score * q.weight,
            maxWeightedScore: q.weight,
            elapsed,
          });

          totalScore += score * q.weight;
          maxScore += q.weight;
        }
      }

      // Coding tasks
      if (tasks) {
        for (const t of BENCHMARK_TASKS) {
          const tStart = Date.now();
          const answer = await this.askProvider(provider, t.description);
          const elapsed = Date.now() - tStart;
          const score = scoreTask(t, answer);

          providerResults.push({
            type: 'task',
            id: t.id,
            category: t.category,
            title: t.title,
            question: t.description,
            answer: answer.slice(0, 500),
            score,
            weightedScore: score * t.weight,
            maxWeightedScore: t.weight,
            elapsed,
          });

          totalScore += score * t.weight;
          maxScore += t.weight;
        }
      }

      const overall = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      results[name] = {
        provider: name,
        model: provider.model,
        results: providerResults,
        totalScore,
        maxScore,
        overall,
        elapsed: Date.now() - startTime,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      totalElapsed: Date.now() - startTime,
      providers: results,
      // Sort providers by overall score descending
      ranking: Object.values(results)
        .sort((a, b) => b.overall - a.overall)
        .map(r => ({ name: r.provider, model: r.model, score: r.overall, elapsed: r.elapsed })),
    };
  }

  async askProvider(provider, prompt) {
    try {
      const messages = [
        { role: 'system', content: 'You are a helpful AI assistant. Answer concisely and accurately.' },
        { role: 'user', content: prompt },
      ];
      const data = await this.ai.sendRequestToProvider(provider, messages, {
        enableTools: false,
        model: provider.model,
      });
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      return `[ERROR: ${err.message}]`;
    }
  }

  // ── Format Results ────────────────────────────────────────────────────────

  formatResults(benchmarkResult) {
    if (benchmarkResult.error) {
      return `\n${colors.red}${benchmarkResult.error}${colors.reset}\n`;
    }

    const lines = [];
    lines.push(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    lines.push(`${colors.bright}${colors.cyan}   🧠 WINTER MODEL BENCHMARK${colors.reset}`);
    lines.push(`${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    lines.push(`  ${colors.dim}${benchmarkResult.timestamp}${colors.reset}`);
    lines.push(`  ${colors.dim}Total time: ${(benchmarkResult.totalElapsed / 1000).toFixed(1)}s${colors.reset}`);
    lines.push('');

    // Ranking
    lines.push(`${colors.bright}🏆 RANKING${colors.reset}`);
    lines.push(`${'─'.repeat(40)}`);
    benchmarkResult.ranking.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ` ${i + 1}.`;
      const bar = this._scoreBar(r.score, 20);
      lines.push(`  ${medal} ${colors.bright}${r.name}${colors.reset} ${bar} ${r.score}%`);
      lines.push(`     ${colors.dim}Model: ${r.model} | Time: ${(r.elapsed / 1000).toFixed(1)}s${colors.reset}`);
    });
    lines.push('');

    // Detail per provider
    for (const [name, data] of Object.entries(benchmarkResult.providers)) {
      lines.push(`${colors.bright}${'─'.repeat(50)}${colors.reset}`);
      lines.push(`${colors.bright}📊 ${name}${colors.reset} ${colors.dim}(${data.model})${colors.reset}`);
      lines.push(`${'─'.repeat(50)}`);

      const categories = {};
      for (const r of data.results) {
        const cat = r.category || 'other';
        if (!categories[cat]) categories[cat] = { count: 0, totalScore: 0, maxScore: 0 };
        categories[cat].count++;
        categories[cat].totalScore += r.score;
        categories[cat].maxScore += 1;
      }

      for (const [cat, stats] of Object.entries(categories)) {
        const catPct = Math.round((stats.totalScore / stats.maxScore) * 100);
        const bar = this._scoreBar(catPct, 10);
        lines.push(`  ${bar} ${colors.dim}${cat}:${colors.reset} ${catPct}% (${stats.count} items)`);
      }
      lines.push('');

      // Per-item breakdown
      for (const r of data.results) {
        const icon = r.score >= 0.8 ? '✅' : r.score >= 0.5 ? '🟡' : r.score >= 0.2 ? '🟠' : '❌';
        const label = r.type === 'question' ? r.id : r.title;
        lines.push(`  ${icon} ${colors.dim}${label}:${colors.reset} ${Math.round(r.score * 100)}% (${(r.elapsed / 1000).toFixed(1)}s)`);
        // Show preview of answer
        const preview = r.answer.replace(/\n/g, ' ').slice(0, 120);
        lines.push(`    ${colors.dim}${preview}${r.answer.length > 120 ? '...' : ''}${colors.reset}`);
      }
      lines.push('');
    }

    lines.push(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);

    return lines.join('\n');
  }

  _scoreBar(score, width = 20) {
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;
    const filledChar = '█';
    const emptyChar = '░';
    return colors.green + filledChar.repeat(filled) + colors.dim + emptyChar.repeat(empty) + colors.reset;
  }

  // ── History ───────────────────────────────────────────────────────────────

  formatHistorySummary(benchmarkResult) {
    return benchmarkResult.ranking
      .map(r => `[${r.name}] Score: ${r.score}% | Model: ${r.model} | Time: ${(r.elapsed / 1000).toFixed(1)}s`)
      .join('\n');
  }
}

// Export question/task banks for testing
export { BENCHMARK_QUESTIONS, BENCHMARK_TASKS, scoreAnswer, scoreTask };
