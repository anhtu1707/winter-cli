/**
 * ❄️ NOTEBOOK TOOL ❄️
 * Jupyter notebook read/edit support (.ipynb files)
 */

import { promises as fs } from 'fs';
import path from 'path';

export class NotebookTool {
  async read(notebookPath) {
    try {
      const raw = await fs.readFile(notebookPath, 'utf8');
      const nb = JSON.parse(raw);
      const cells = (nb.cells || []).map((cell, index) => ({
        id: `cell-${index}`,
        type: cell.cell_type || 'code',
        source: Array.isArray(cell.source) ? cell.source.join('') : (cell.source || ''),
        outputs: (cell.outputs || []).map(o => ({
          output_type: o.output_type,
          text: o.text ? (Array.isArray(o.text) ? o.text.join('') : o.text) : '',
          name: o.name,
          data: o.data,
        })),
        execution_count: cell.execution_count || null,
        metadata: cell.metadata || {},
      }));

      return {
        success: true,
        path: notebookPath,
        cells,
        metadata: nb.metadata || {},
        nbformat: nb.nbformat || 4,
        nbformat_minor: nb.nbformat_minor || 0,
        cellCount: cells.length,
      };
    } catch (error) {
      return { success: false, error: error.message, path: notebookPath };
    }
  }

  async edit(notebookPath, cellId, newSource) {
    try {
      const raw = await fs.readFile(notebookPath, 'utf8');
      const nb = JSON.parse(raw);

      if (!nb.cells || !Array.isArray(nb.cells)) {
        return { success: false, error: 'Invalid notebook: no cells array' };
      }

      const index = parseInt((cellId || '').replace('cell-', ''), 10);
      if (isNaN(index) || index < 0 || index >= nb.cells.length) {
        return { success: false, error: `Cell not found: ${cellId}`, validCells: nb.cells.map((_, i) => `cell-${i}`) };
      }

      const oldSource = (Array.isArray(nb.cells[index].source) ? nb.cells[index].source.join('') : nb.cells[index].source) || '';
      nb.cells[index].source = Array.isArray(nb.cells[index].source)
        ? newSource.split('\n')
        : newSource;

      await fs.writeFile(notebookPath, JSON.stringify(nb, null, 2), 'utf8');

      return {
        success: true,
        path: notebookPath,
        cellId,
        oldSource,
        newSource,
        changes: oldSource !== newSource ? 1 : 0,
      };
    } catch (error) {
      return { success: false, error: error.message, path: notebookPath, cellId };
    }
  }

  async execute(notebookPath, cellId) {
    try {
      const raw = await fs.readFile(notebookPath, 'utf8');
      const nb = JSON.parse(raw);

      if (!nb.cells || !Array.isArray(nb.cells)) {
        return { success: false, error: 'Invalid notebook: no cells array' };
      }

      const index = parseInt((cellId || '').replace('cell-', ''), 10);
      if (isNaN(index) || index < 0 || index >= nb.cells.length) {
        return { success: false, error: `Cell not found: ${cellId}` };
      }

      const cell = nb.cells[index];
      if (!cell.outputs) cell.outputs = [];

      return {
        success: true,
        path: notebookPath,
        cellId,
        cellType: cell.cell_type,
        source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
        outputs: cell.outputs.map(o => ({
          output_type: o.output_type,
          text: o.text ? (Array.isArray(o.text) ? o.text.join('') : o.text) : '',
          name: o.name,
        })),
        execution_count: cell.execution_count,
        note: 'Notebook execution is a simulation. For real execution, use Python kernel.',
      };
    } catch (error) {
      return { success: false, error: error.message, path: notebookPath, cellId };
    }
  }

  async listCells(notebookPath) {
    try {
      const raw = await fs.readFile(notebookPath, 'utf8');
      const nb = JSON.parse(raw);
      const cells = (nb.cells || []).map((cell, index) => ({
        id: `cell-${index}`,
        type: cell.cell_type || 'code',
        summary: (Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '')).split('\n')[0]?.slice(0, 80) || '',
        execution_count: cell.execution_count || null,
        hasOutputs: (cell.outputs || []).length > 0,
      }));

      return {
        success: true,
        path: notebookPath,
        cells,
        cellCount: cells.length,
        kernel: nb.metadata?.kernelspec?.display_name || nb.metadata?.kernel_info?.name || 'unknown',
        language: nb.metadata?.language_info?.name || 'python',
      };
    } catch (error) {
      return { success: false, error: error.message, path: notebookPath };
    }
  }
}
