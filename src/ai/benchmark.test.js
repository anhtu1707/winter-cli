import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARK_QUESTIONS, BENCHMARK_TASKS, scoreAnswer, scoreTask, BenchmarkRunner } from './benchmark.js';

describe('Benchmark Questions', () => {
  it('has 8 questions across categories', () => {
    assert.equal(BENCHMARK_QUESTIONS.length, 8);
    const categories = new Set(BENCHMARK_QUESTIONS.map(q => q.category));
    assert(categories.has('logic'));
    assert(categories.has('coding'));
    assert(categories.has('math'));
    assert(categories.has('reasoning'));
    assert(categories.has('language'));
  });

  it('each question has id, keywords, weight', () => {
    for (const q of BENCHMARK_QUESTIONS) {
      assert.ok(q.id);
      assert.ok(Array.isArray(q.keywords));
      assert.ok(q.keywords.length > 0);
      assert.ok(q.weight > 0);
    }
  });

  it('all question ids are unique', () => {
    const ids = BENCHMARK_QUESTIONS.map(q => q.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('Benchmark Tasks', () => {
  it('has 3 coding tasks', () => {
    assert.equal(BENCHMARK_TASKS.length, 3);
    for (const t of BENCHMARK_TASKS) {
      assert.equal(t.category, 'coding-task');
      assert.ok(t.title);
      assert.ok(t.evaluationCriteria.length > 0);
    }
  });

  it('all task ids are unique', () => {
    const ids = BENCHMARK_TASKS.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('scoreAnswer', () => {
  it('returns 0 for empty answer', () => {
    assert.equal(scoreAnswer(BENCHMARK_QUESTIONS[0], ''), 0);
    assert.equal(scoreAnswer(BENCHMARK_QUESTIONS[0], null), 0);
    assert.equal(scoreAnswer(BENCHMARK_QUESTIONS[0], undefined), 0);
  });

  it('scores based on keyword matches', () => {
    const q = BENCHMARK_QUESTIONS.find(q => q.id === 'q03'); // math: 15% of 200
    const good = scoreAnswer(q, '15% of 200 is 30. Calculation: 200 × 0.15 = 30');
    const poor = scoreAnswer(q, 'I think it might be around 20');
    assert.ok(good > poor, `good=${good} should be > poor=${poor}`);
  });

  it('perfect answer gets high score', () => {
    const q = BENCHMARK_QUESTIONS.find(q => q.id === 'q03');
    const score = scoreAnswer(q, '15% of 200 is 30. Because 15% = 0.15 × 200 = 30');
    assert.ok(score >= 0.5, `score=${score} should be >= 0.5`);
  });
});

describe('scoreTask', () => {
  it('returns 0 for empty answer', () => {
    assert.equal(scoreTask(BENCHMARK_TASKS[0], ''), 0);
    assert.equal(scoreTask(BENCHMARK_TASKS[0], null), 0);
  });

  it('scores based on evaluation criteria', () => {
    const task = BENCHMARK_TASKS[0]; // API fetch
    const good = scoreTask(task, 'async function fetchData(url) { try { const res = await fetch(url); if (!res.ok) throw new Error("HTTP error"); return await res.json(); } catch (e) { console.error(e); } }');
    const poor = scoreTask(task, 'function get() { return data; }');
    assert.ok(good > poor, `good=${good} should be > poor=${poor}`);
  });
});

describe('BenchmarkRunner', () => {
  it('returns error when no ready providers', async () => {
    const mockAi = {
      init: async () => {},
      providers: {},
    };
    const runner = new BenchmarkRunner(mockAi);
    const result = await runner.run(['test-provider']);
    assert.ok(result.error);
    assert.ok(result.error.includes('No ready providers'));
  });

  it('runs with mock provider', async () => {
    const mockAi = {
      init: async () => {},
      providers: {
        mock: {
          name: 'mock',
          model: 'test-model',
          ready: true,
        },
      },
      sendRequestToProvider: async (provider, messages) => {
        const lastMsg = messages[messages.length - 1].content;
        // Return different answers based on keywords
        return {
          choices: [{
            message: { content: `Answer to: ${lastMsg.slice(0, 50)}...` },
          }],
        };
      },
    };
    const runner = new BenchmarkRunner(mockAi);
    const result = await runner.run(['mock'], { questions: true, tasks: false });

    assert.ok(result.providers.mock);
    assert.equal(result.providers.mock.model, 'test-model');
    assert.ok(Array.isArray(result.providers.mock.results));
    assert.equal(result.providers.mock.results.length, BENCHMARK_QUESTIONS.length);
    assert.ok(result.ranking.length > 0);
    assert.equal(result.ranking[0].name, 'mock');
  });

  it('formats results without error', () => {
    const mockAi = { init: async () => {} };
    const runner = new BenchmarkRunner(mockAi);

    const result = {
      timestamp: '2026-01-01T00:00:00.000Z',
      totalElapsed: 5000,
      providers: {
        mock: {
          provider: 'mock',
          model: 'test-model',
          results: [
            {
              type: 'question',
              id: 'q01',
              category: 'logic',
              question: 'Test?',
              answer: 'Test answer that is long enough for scoring',
              score: 0.8,
              weightedScore: 0.8,
              maxWeightedScore: 1,
              elapsed: 1000,
            },
          ],
          totalScore: 0.8,
          maxScore: 1,
          overall: 80,
          elapsed: 5000,
        },
      },
      ranking: [
        { name: 'mock', model: 'test-model', score: 80, elapsed: 5000 },
      ],
    };

    const output = runner.formatResults(result);
    assert.ok(output.includes('WINTER MODEL BENCHMARK'));
    assert.ok(output.includes('mock'));
    assert.ok(output.includes('80%'));
    assert.ok(output.includes('RANKING'));
  });

  it('formatHistorySummary returns compact output', () => {
    const mockAi = { init: async () => {} };
    const runner = new BenchmarkRunner(mockAi);

    const result = {
      ranking: [
        { name: 'claude', model: 'sonnet', score: 85, elapsed: 3000 },
        { name: 'ollama', model: 'llama3', score: 62, elapsed: 5000 },
      ],
    };

    const summary = runner.formatHistorySummary(result);
    assert.ok(summary.includes('claude'));
    assert.ok(summary.includes('ollama'));
    assert.ok(summary.includes('85%'));
    assert.ok(summary.includes('62%'));
  });
});
