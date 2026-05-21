/**
 * ❄ SCHEDULER TOOL ❄
 * Schedule wakeup reminders and recurring tasks
 */

import { promises as fs } from 'fs';
import path from 'path';

export class SchedulerTool {
  constructor(schedulerDir) {
    this.schedulerDir = schedulerDir || path.join(process.cwd(), '.winter');
    this.scheduleFile = path.join(this.schedulerDir, 'schedule.json');
    this.timers = new Map();
  }

  async load() {
    try {
      await fs.mkdir(this.schedulerDir, { recursive: true });
      const raw = await fs.readFile(this.scheduleFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async save(schedules) {
    await fs.mkdir(this.schedulerDir, { recursive: true });
    await fs.writeFile(this.scheduleFile, JSON.stringify(schedules, null, 2), 'utf8');
  }

  nextId(schedules) {
    const maxId = schedules.reduce((max, s) => Math.max(max, parseInt(s.id, 10) || 0), 0);
    return String(maxId + 1);
  }

  parseDelay(delay) {
    if (typeof delay === 'number') return Math.max(1000, delay);
    if (typeof delay === 'string') {
      const match = delay.match(/^(\d+)\s*(ms|s|m|h|d)?$/);
      if (!match) return null;
      const num = parseInt(match[1], 10);
      const unit = match[2] || 'ms';
      const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
      return num * (multipliers[unit] || 1);
    }
    return null;
  }

  async schedule(delay, prompt, recurring = false) {
    const delayMs = this.parseDelay(delay);
    if (!delayMs || delayMs < 1000) {
      return { success: false, error: 'delay must be at least 1000ms. Use format: "30s", "5m", "1h", "2d", or milliseconds.' };
    }
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return { success: false, error: 'prompt is required' };
    }

    const schedules = await this.load();
    const scheduled = {
      id: this.nextId(schedules),
      prompt: prompt.trim(),
      delay: delayMs,
      recurring: Boolean(recurring),
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date(Date.now() + delayMs).toISOString(),
      status: 'scheduled',
    };

    schedules.push(scheduled);
    await this.save(schedules);

    this.startTimer(scheduled);

    return {
      success: true,
      schedule: scheduled,
      willTriggerAt: scheduled.triggerAt,
    };
  }

  startTimer(scheduled) {
    const delay = new Date(scheduled.triggerAt).getTime() - Date.now();
    if (delay <= 0) return;

    const timerId = setTimeout(async () => {
      if (scheduled.recurring) {
        const newDelay = scheduled.delay;
        const newTrigger = new Date(Date.now() + newDelay).toISOString();

        const all = await this.load();
        const found = all.find(s => s.id === scheduled.id);
        if (found) {
          found.status = 'triggered';
          found.triggeredAt = new Date().toISOString();
          await this.save(all);
        }

        // Re-schedule
        await this.schedule(newDelay, scheduled.prompt, true);
      } else {
        const all = await this.load();
        const found = all.find(s => s.id === scheduled.id);
        if (found) {
          found.status = 'triggered';
          found.triggeredAt = new Date().toISOString();
          await this.save(all);
        }
      }

      this.timers.delete(scheduled.id);
    }, delay);

    this.timers.set(scheduled.id, timerId);
    this.timers.set(`timeout_${scheduled.id}`, timerId);
  }

  async list() {
    const schedules = await this.load();
    return {
      success: true,
      schedules,
      count: schedules.length,
      activeTimers: this.timers.size,
    };
  }

  async delete(id) {
    const schedules = await this.load();
    const index = schedules.findIndex(s => s.id === String(id));
    if (index === -1) {
      return { success: false, error: `Schedule not found: ${id}` };
    }

    const removed = schedules.splice(index, 1)[0];
    const timerId = this.timers.get(removed.id);
    if (timerId) {
      clearTimeout(timerId);
      this.timers.delete(removed.id);
    }

    await this.save(schedules);
    return { success: true, schedule: removed };
  }

  async clearAll() {
    for (const [id, timerId] of this.timers) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    await this.save([]);
    return { success: true, message: 'All schedules cleared' };
  }

  destroy() {
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
  }
}
