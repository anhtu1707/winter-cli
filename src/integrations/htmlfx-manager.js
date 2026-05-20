import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REPO_URL = 'https://github.com/luisoncpp/html-effectiveness-scripts.git';

export class HtmlFxManager {
  constructor({ projectPath } = {}) {
    this.projectPath = projectPath || process.cwd();
    this.vendorRoot = path.join(this.projectPath, '.winter', 'vendor');
    this.repoDir = path.join(this.vendorRoot, 'html-effectiveness-scripts');
  }

  getRepoPath() {
    return this.repoDir;
  }

  getBinaryPath() {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(this.repoDir, 'target', 'release', `html-effectiveness${ext}`);
  }

  async exists(targetPath) {
    try {
      await stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureInstalled({ update = false } = {}) {
    await mkdir(this.vendorRoot, { recursive: true });
    const hasRepo = await this.exists(path.join(this.repoDir, '.git'));

    if (!hasRepo) {
      await execFileAsync('git', ['clone', REPO_URL, this.repoDir], {
        cwd: this.vendorRoot,
        maxBuffer: 10 * 1024 * 1024,
      });
    } else if (update) {
      await execFileAsync('git', ['pull', '--ff-only'], {
        cwd: this.repoDir,
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    await execFileAsync('cargo', ['build', '--release'], {
      cwd: this.repoDir,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      success: true,
      repoPath: this.repoDir,
      binaryPath: this.getBinaryPath(),
      updated: update && hasRepo,
      cloned: !hasRepo,
    };
  }

  async info() {
    const installed = await this.exists(this.repoDir);
    const binaryReady = await this.exists(this.getBinaryPath());
    return {
      installed,
      binaryReady,
      repoPath: this.repoDir,
      binaryPath: this.getBinaryPath(),
    };
  }

  async listOutputGoal() {
    const outputDir = path.join(this.repoDir, 'output_goal');
    if (!(await this.exists(outputDir))) {
      return { success: false, error: 'output_goal directory not found. Run install first.' };
    }
    const entries = await readdir(outputDir, { withFileTypes: true });
    const files = entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b));
    return { success: true, files, count: files.length, outputDir };
  }

  async compile({ inputPath, outputPath, extraArgs = [] } = {}) {
    const binary = this.getBinaryPath();
    if (!(await this.exists(binary))) {
      return { success: false, error: 'html-effectiveness binary not found. Run `winter htmlfx install` first.' };
    }
    if (!inputPath || !outputPath) {
      return { success: false, error: 'inputPath and outputPath are required' };
    }

    const args = ['-i', inputPath, '-o', outputPath, ...extraArgs];
    const { stdout, stderr } = await execFileAsync(binary, args, {
      cwd: this.projectPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      success: true,
      inputPath,
      outputPath,
      stdout: stdout || '',
      stderr: stderr || '',
    };
  }
}
