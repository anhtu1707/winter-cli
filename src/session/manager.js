/**
 * ❄️ SESSION MANAGER ❄️
 * Handles session management with context memory,
 * plans, and project tracking.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import crypto from 'crypto';

export class SessionManager {
  constructor(config) {
    this.config = config;
    this.winterDir = path.join(homedir(), '.winter');
    this.sessionsDir = path.join(this.winterDir, 'sessions');
    this.currentSession = null;
    this.context = {};
    this.plans = [];
    this.memory = [];
    this.initialized = false;
  }

  async init(options = {}) {
    if (this.initialized) return;
 
    // Create directories
    await fs.mkdir(path.join(this.sessionsDir, 'active'), { recursive: true });
    await fs.mkdir(path.join(this.sessionsDir, 'projects'), { recursive: true });
    await fs.mkdir(path.join(this.sessionsDir, 'cache'), { recursive: true });
 
    // Nếu có truyền sessionId thì cố gắng load nó
    if (options.sessionId) {
      const success = await this.loadSession(options.sessionId);
      if (success) {
        await this.rememberProject(this.currentSession?.project || options.project || process.cwd());
        this.initialized = true;
        return;
      }
      console.log(`\x1b[33m⚠ Không tìm thấy session ${options.sessionId}, tạo session mới...\x1b[0m`);
    }

    // Luôn tạo session mới nếu không yêu cầu load hoặc load thất bại
    await this.newSession(options);
    await this.rememberProject(options.project || this.currentSession?.project || process.cwd());
    this.initialized = true;
  }

  async loadSession(sessionId) {
    const sessionPath = path.join(this.sessionsDir, 'active', `${sessionId}.json`);
    try {
      const sessionData = await fs.readFile(sessionPath, 'utf8');
      const session = JSON.parse(sessionData);

      this.currentSession = session;
      this.context = session.context || {};
      this.plans = session.plans || [];
      this.memory = session.memory || [];
      this.currentSession.history = session.history || []; // Khôi phục lịch sử chat!
      
      return true;
    } catch (e) {
      return false;
    }
  }

  async newSession(options = {}) {
    const sessionId = crypto.randomUUID();
    const sessionPath = path.join(this.sessionsDir, 'active', `${sessionId}.json`);

    const session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      project: options.project || null,
      context: {},
      plans: [],
      memory: [],
      history: [],
    };

    // Ensure directory exists
    await fs.mkdir(path.join(this.sessionsDir, 'active'), { recursive: true });

    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
    this.currentSession = session;
    this.context = session.context;
    this.plans = session.plans;
    this.memory = session.memory;

    await this.rememberProject(session.project || options.project || process.cwd());

    // Update current session pointer
    const currentPath = path.join(this.sessionsDir, 'active', 'current.json');
    await fs.writeFile(currentPath, JSON.stringify({ id: sessionId }));

    return session;
  }

  async loadActiveSession() {
    const activePath = path.join(this.sessionsDir, 'active', 'current.json');

    try {
      const data = await fs.readFile(activePath, 'utf8');
      const currentInfo = JSON.parse(data);

      if (currentInfo.id) {
        // Load the actual session file
        const sessionPath = path.join(this.sessionsDir, 'active', `${currentInfo.id}.json`);
        const sessionData = await fs.readFile(sessionPath, 'utf8');
        const session = JSON.parse(sessionData);

        this.currentSession = session;
        this.context = session.context || {};
        this.plans = session.plans || [];
        this.memory = session.memory || [];
        this.currentSession.history = session.history || [];
      }
    } catch {
      // Create new session if none exists
      await this.newSession();
    }
  }

  async saveSession() {
    if (!this.currentSession) return;

    this.currentSession.updatedAt = new Date().toISOString();
    this.currentSession.context = this.context;
    this.currentSession.plans = this.plans;
    this.currentSession.memory = this.memory;

    // Ensure directory exists
    await fs.mkdir(path.join(this.sessionsDir, 'active'), { recursive: true });

    const sessionPath = path.join(this.sessionsDir, 'active', `${this.currentSession.id}.json`);
    await fs.writeFile(sessionPath, JSON.stringify(this.currentSession, null, 2));

    // Update current symlink
    const currentPath = path.join(this.sessionsDir, 'active', 'current.json');
    await fs.writeFile(currentPath, JSON.stringify({ id: this.currentSession.id }));
  }

  async addToMemory(text, type = 'info') {
    this.memory.push({
      id: crypto.randomUUID(),
      text,
      type,
      createdAt: new Date().toISOString(),
      sessionId: this.currentSession?.id,
    });
    await this.saveSession();
  }

  // Backwards-compatible alias used by other modules
  async addMemory(text, type = 'info') {
    return this.addToMemory(text, type);
  }

  // Replace previous memory entries that start with a given prefix
  // Handles both legacy string entries and object entries with `text`.
  async replaceMemory(prefix, content, type = 'info') {
    const mem = this.memory || [];
    const filtered = mem.filter(m => {
      if (!m) return true;
      if (typeof m === 'string') return !m.startsWith(prefix);
      if (typeof m === 'object' && m.text) return !m.text.startsWith(prefix);
      return true;
    });

    this.memory = filtered;
    await this.addToMemory(`${prefix}:
${content}`, type);
  }

  async updateContext(key, value) {
    this.context[key] = {
      value,
      updatedAt: new Date().toISOString(),
    };
    await this.saveSession();
  }

  async createPlan(title, description) {
    const plan = {
      id: crypto.randomUUID(),
      title,
      description,
      status: 'pending',
      steps: [],
      createdAt: new Date().toISOString(),
    };
    this.plans.push(plan);
    await this.saveSession();
    return plan;
  }

  async addPlanStep(planId, step) {
    const plan = this.plans.find(p => p.id === planId);
    if (plan) {
      plan.steps.push({
        id: crypto.randomUUID(),
        ...step,
        status: 'pending',
      });
      await this.saveSession();
    }
  }

  async updatePlanStatus(planId, status) {
    const plan = this.plans.find(p => p.id === planId);
    if (plan) {
      plan.status = status;
      plan.updatedAt = new Date().toISOString();
      await this.saveSession();
    }
  }

  async updatePlan(planId, updates = {}) {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return null;

    if (updates.title !== undefined) plan.title = updates.title;
    if (updates.description !== undefined) plan.description = updates.description;
    if (updates.status !== undefined) plan.status = updates.status;
    plan.updatedAt = new Date().toISOString();

    await this.saveSession();
    return plan;
  }

  async addToHistory(entry) {
    if (this.currentSession) {
      if (!this.currentSession.history) {
        this.currentSession.history = [];
      }
      this.currentSession.history.push({
        id: crypto.randomUUID(),
        ...entry,
        timestamp: new Date().toISOString(),
      });
      await this.saveSession();
    }
  }

  getHistory(limit = 20) {
    if (!this.currentSession || !this.currentSession.history) return [];
    return this.currentSession.history.slice(-limit);
  }

  getContext() {
    return this.context;
  }

  getPlans() {
    return this.plans;
  }

  getMemory() {
    return this.memory;
  }

  async listSessions() {
    const activeDir = path.join(this.sessionsDir, 'active');
    const files = await fs.readdir(activeDir);
    const sessions = [];

    for (const file of files) {
      if (file.endsWith('.json') && file !== 'current.json') {
        try {
          const data = await fs.readFile(path.join(activeDir, file), 'utf8');
          const session = JSON.parse(data);
          sessions.push({
            id: session.id,
            createdAt: session.createdAt,
            project: session.project,
          });
        } catch {
          // Skip invalid files
        }
      }
    }

    return sessions;
  }

  async switchSession(sessionId) {
    const sessionPath = path.join(this.sessionsDir, 'active', `${sessionId}.json`);
    const data = await fs.readFile(sessionPath, 'utf8');
    const session = JSON.parse(data);

    this.currentSession = session;
    this.context = session.context || {};
    this.plans = session.plans || [];
    this.memory = session.memory || [];

    await this.rememberProject(session.project || process.cwd());

    await this.saveSession();
    return session;
  }

  async rememberProject(projectPath) {
    if (!projectPath) return;

    if (this.config?.setProjectCurrent) {
      await this.config.setProjectCurrent(projectPath);
      return;
    }

    if (this.config?.load && this.config?.save) {
      const config = await this.config.load();
      config.project = config.project || {};
      config.project.current = projectPath;
      config.project.lastOpenedAt = new Date().toISOString();
      await this.config.save(config);
    }
  }

  getSessionId() {
    return this.currentSession?.id || 'none';
  }
}