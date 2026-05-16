/**
 * ❄️ TODO TOOL ❄️
 * Persistent todo list management
 */

import { promises as fs } from 'fs';
import path from 'path';

export class TodoTool {
  constructor(todoDir) {
    this.todoDir = todoDir || path.join(process.cwd(), '.winter');
    this.todoFile = path.join(this.todoDir, 'todos.json');
  }

  async load() {
    try {
      await fs.mkdir(this.todoDir, { recursive: true });
      const raw = await fs.readFile(this.todoFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async save(todos) {
    await fs.mkdir(this.todoDir, { recursive: true });
    await fs.writeFile(this.todoFile, JSON.stringify(todos, null, 2), 'utf8');
  }

  nextId(todos) {
    const maxId = todos.reduce((max, t) => Math.max(max, parseInt(t.id, 10) || 0), 0);
    return String(maxId + 1);
  }

  async write(title, status = 'pending', priority = 'medium') {
    const todos = await this.load();
    const todo = {
      id: this.nextId(todos),
      title: String(title || '').trim(),
      status: ['pending', 'in_progress', 'completed', 'cancelled'].includes(status) ? status : 'pending',
      priority: ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!todo.title) {
      return { success: false, error: 'title is required' };
    }

    todos.push(todo);
    await this.save(todos);
    return { success: true, todo };
  }

  async list(filterStatus) {
    let todos = await this.load();
    if (filterStatus) {
      todos = todos.filter(t => t.status === filterStatus);
    }
    return {
      success: true,
      todos,
      count: todos.length,
    };
  }

  async update(id, changes = {}) {
    const todos = await this.load();
    const todo = todos.find(t => t.id === String(id));
    if (!todo) {
      return { success: false, error: `Todo not found: ${id}`, validIds: todos.map(t => t.id) };
    }

    if (changes.title !== undefined) todo.title = String(changes.title).trim();
    if (changes.status !== undefined && ['pending', 'in_progress', 'completed', 'cancelled'].includes(changes.status)) {
      todo.status = changes.status;
    }
    if (changes.priority !== undefined && ['low', 'medium', 'high', 'critical'].includes(changes.priority)) {
      todo.priority = changes.priority;
    }

    todo.updatedAt = new Date().toISOString();
    await this.save(todos);
    return { success: true, todo };
  }

  async delete(id) {
    const todos = await this.load();
    const index = todos.findIndex(t => t.id === String(id));
    if (index === -1) {
      return { success: false, error: `Todo not found: ${id}` };
    }

    const removed = todos.splice(index, 1)[0];
    await this.save(todos);
    return { success: true, todo: removed };
  }
}
