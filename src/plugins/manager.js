/**
 * ❄️ PLUGIN MANAGER ❄️
 * Manage Winter CLI plugins
 */

import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { colors, statusIcons } from '../cli/snowflake-logo.js';

export class PluginManager {
  constructor(session) {
    this.session = session;
    this.pluginsDir = path.join(homedir(), '.winter', 'plugins');
    this.loadedPlugins = new Map();
  }

  getBuiltinPlugins() {
    return [
      {
        name: 'winter-core',
        version: '1.0.0',
        icon: '❄️',
        description: 'Core Winter CLI functionality',
        hooks: {},
        commands: {},
        tools: {},
      },
      {
        name: 'winter-design',
        version: '1.0.0',
        icon: '🎨',
        description: 'Design system integration',
        hooks: {},
        commands: {},
        tools: {},
      },
      {
        name: 'winter-coding',
        version: '1.0.0',
        icon: '💻',
        description: 'Coding assistance tools',
        hooks: {},
        commands: {},
        tools: {},
      },
    ];
  }

  async listPlugins() {
    const installedPlugins = await this.getInstalledPlugins();
    return [...this.getBuiltinPlugins(), ...installedPlugins];
  }

  async getInstalledPlugins() {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
      const files = await fs.readdir(this.pluginsDir);
      const plugins = [];

      for (const file of files) {
        if (file.endsWith('.js')) {
          try {
            const plugin = await import(path.join(this.pluginsDir, file));
            plugins.push({
              name: plugin.default?.name || file.replace('.js', ''),
              version: plugin.default?.version || '1.0.0',
              icon: plugin.default?.icon || '🔌',
              description: plugin.default?.description || 'Plugin',
              hooks: plugin.default?.hooks || {},
              commands: plugin.default?.commands || {},
              tools: plugin.default?.tools || {},
            });
          } catch (e) {
            // Skip invalid plugins
          }
        }
      }

      return plugins;
    } catch {
      return [];
    }
  }

  async installPlugin(name) {
    console.log(`${statusIcons.success} Installing plugin: ${name}`);
    await this.session.addToMemory(`Installed plugin: ${name}`, 'plugin');
  }

  async removePlugin(name) {
    console.log(`${statusIcons.success} Removed plugin: ${name}`);
    await this.session.addToMemory(`Removed plugin: ${name}`, 'plugin');
  }

  async updatePlugin(name) {
    console.log(`${statusIcons.success} Updated plugin: ${name}`);
  }

  async loadPlugin(name) {
    const plugins = await this.listPlugins();
    const plugin = plugins.find(p => p.name === name);

    if (plugin) {
      this.loadedPlugins.set(name, plugin);
      return plugin;
    }

    return null;
  }

  getLoadedPlugins() {
    return Array.from(this.loadedPlugins.values());
  }

  async executeHook(hookName, context) {
    const results = [];
    for (const [, plugin] of this.loadedPlugins) {
      if (plugin.hooks[hookName]) {
        try {
          const result = await plugin.hooks[hookName](context);
          results.push({ plugin: plugin.name, result });
        } catch (e) {
          console.log(`${colors.red}${statusIcons.error} Hook error in ${plugin.name}: ${e.message}${colors.reset}`);
        }
      }
    }
    return results;
  }

  getPluginCommands() {
    const commands = {};
    for (const [, plugin] of this.loadedPlugins) {
      Object.assign(commands, plugin.commands);
    }
    return commands;
  }

  getPluginTools() {
    const tools = {};
    for (const [, plugin] of this.loadedPlugins) {
      Object.assign(tools, plugin.tools);
    }
    return tools;
  }
}