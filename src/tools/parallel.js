/**
 * Parallel Execution - Run multiple independent tools concurrently.
 * Includes dependency tracking, merging, and error isolation.
 */

export class ParallelExecutor {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 5;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Execute multiple tools in parallel.
   */
  async execute(tools, executor, context = {}) {
    if (!Array.isArray(tools) || tools.length === 0) {
      return { results: [], errors: [] };
    }

    const batches = this._batch(tools, this.maxConcurrent);
    const allResults = [];

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(async (toolCall) => {
          const toolName = toolCall.name || toolCall.tool;
          const input = toolCall.input || toolCall.args || toolCall;

          if (typeof executor === 'function') {
            return await executor(toolName, input, context);
          }
          if (executor.execute) {
            return await executor.execute(toolName, input, context);
          }
          throw new Error(`Invalid executor: ${typeof executor}`);
        })
      );

      for (let i = 0; i < batch.length; i++) {
        const result = batchResults[i];
        const toolName = batch[i].name || batch[i].tool || 'unknown';
        if (result.status === 'fulfilled') {
          allResults.push({ tool: toolName, status: 'success', result: result.value });
        } else {
          allResults.push({ tool: toolName, status: 'error', error: result.reason?.message || String(result.reason) });
        }
      }
    }

    const successful = allResults.filter(r => r.status === 'success');
    const errors = allResults.filter(r => r.status === 'error');

    return {
      results: successful,
      errors,
      total: allResults.length,
      successCount: successful.length,
      errorCount: errors.length,
    };
  }

  /**
   * Execute tools with dependency graph.
   */
  async executeWithDeps(tools, executor, context = {}) {
    const dag = this._buildDAG(tools);
    const results = new Map();
    const errors = [];

    while (dag.remaining.size > 0) {
      // Find tools with all dependencies satisfied
      const ready = [];
      for (const [name, node] of dag.remaining) {
        const depsMet = node.dependsOn.every(d => results.has(d));
        if (depsMet) ready.push(node);
      }

      if (ready.length === 0) {
        // Circular dependency or unresolvable
        for (const [name] of dag.remaining) {
          errors.push({ tool: name, error: 'Unresolved dependencies - possible circular dependency' });
        }
        break;
      }

      // Execute ready tools in parallel
      const batchResults = await this.execute(
        ready.map(r => ({ name: r.name, input: r.input })),
        executor,
        context
      );

      for (const result of batchResults.results) {
        results.set(result.tool.replace(/^error:\s*/, ''), result);
        dag.remaining.delete(result.tool.replace(/^error:\s*/, ''));
      }
      for (const err of batchResults.errors) {
        errors.push(err);
        dag.remaining.delete(err.tool);
      }
    }

    return {
      results: [...results.values()],
      errors,
      total: tools.length,
    };
  }

  /**
   * Merge results from multiple tools into a single coherent response.
   */
  mergeResults(results) {
    const merged = {};

    for (const result of results) {
      if (result.status !== 'success') continue;
      const data = result.result?.data || result.result || {};
      const tool = result.tool;

      if (typeof data === 'object' && !Array.isArray(data)) {
        Object.assign(merged, { [`${tool}_result`]: data });
      } else {
        merged[`${tool}_result`] = data;
      }
    }

    return merged;
  }

  /**
   * Batch tools into groups for controlled parallelism.
   */
  _batch(tools, size) {
    const batches = [];
    for (let i = 0; i < tools.length; i += size) {
      batches.push(tools.slice(i, i + size));
    }
    return batches;
  }

  /**
   * Build a dependency graph from tools array.
   */
  _buildDAG(tools) {
    const remaining = new Map();
    for (const tool of tools) {
      const name = tool.name || tool.tool || 'unknown';
      remaining.set(name, {
        name,
        input: tool.input || tool.args || tool,
        dependsOn: tool.dependsOn || [],
      });
    }
    return { remaining };
  }
}

export default ParallelExecutor;
