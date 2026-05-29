/**
 * ❄ DESIGN COMMANDS ❄
 * Design system integration with brand guidelines
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { colors, statusIcons } from '../cli/snowflake-logo.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class DesignCommands {
  constructor(repl) {
    this.repl = repl;
    this.session = repl.session;
    this.config = repl.config;
    this.projectPath = repl.projectPath || null;
    this.brandsDir = path.join(packageRoot, 'resources', 'local', 'awesome-design-md', 'design-md');
  }

  async execute(action, args) {
    const requestedAction = String(action || '').trim();
    if (!requestedAction) {
      await this.printHelp();
      await this.listBrands();
      return;
    }

    switch (requestedAction.toLowerCase()) {
      case 'search':
      case 'find':
      case 'tim':
        await this.search(args[0] || '');
        break;
      case 'add':
      case 'install':
        await this.addBrand(args[0]);
        break;
      case 'apply':
      case 'use':
      case 'set':
        await this.applyBrand(args[0]);
        break;
      case 'list':
      case 'ls':
        await this.listBrands();
        break;
      case 'preview':
      case 'show':
      case 'view':
        await this.previewBrand(args[0]);
        break;
      case 'init':
        await this.initBrandsDir();
        break;
      case 'help':
      case '--help':
      case '-h':
        await this.printHelp();
        break;
      default:
        if (await this.brandExists(requestedAction)) {
          await this.applyBrand(requestedAction);
        } else {
          await this.search(requestedAction);
        }
    }
  }

  async printHelp() {
    console.log(`${colors.cyan}/design usage:${colors.reset}`);
    console.log('  /design <brand>              Apply a design system to the current project');
    console.log('  /design search <query>       Search bundled design systems');
    console.log('  /design preview <brand>      Preview DESIGN.md');
    console.log('  /design add <brand>          Copy DESIGN.md into the current project');
    console.log('  /design list                 List all bundled brands');
    console.log('');
  }

  async brandExists(brand) {
    if (!brand) return false;
    const brandDir = path.join(this.brandsDir, brand);
    return await fs.access(brandDir).then(() => true).catch(() => false);
  }

  async search(query) {
    if (!query) {
      console.log(`${colors.yellow}Usage: winter design search <query>${colors.reset}`);
      return;
    }

    try {
      const brands = await fs.readdir(this.brandsDir);
      const matches = brands.filter(b =>
        b.toLowerCase().includes(query.toLowerCase())
      );

      if (matches.length === 0) {
        console.log(`${colors.yellow}No matches found for "${query}"${colors.reset}`);
        return;
      }

      console.log(`\n${colors.cyan}Found ${matches.length} matches:${colors.reset}`);
      matches.forEach((brand, i) => {
        console.log(`  ${i + 1}. ${brand}`);
      });
      console.log('');

      await this.session?.addToMemory?.(`Searched design brands for: ${query}`, 'search');
    } catch (error) {
      console.log(`${colors.red}${statusIcons.error} Error: ${error.message}${colors.reset}`);
      console.log(`${colors.dim}Make sure you have awesome-design-md installed${colors.reset}`);
    }
  }

  async addBrand(brand) {
    if (!brand) {
      console.log(`${colors.yellow}Usage: winter design add <brand>${colors.reset}`);
      return;
    }

    try {
      const brandDir = path.join(this.brandsDir, brand);
      let fileContent = null;
      let fileName = null;

      // Check for DESIGN.md or README.md
      const designPath = path.join(brandDir, 'DESIGN.md');
      const readmePath = path.join(brandDir, 'README.md');

      if (await fs.access(designPath).then(() => true).catch(() => false)) {
        fileContent = await fs.readFile(designPath, 'utf8');
        fileName = 'DESIGN.md';
      } else if (await fs.access(readmePath).then(() => true).catch(() => false)) {
        fileContent = await fs.readFile(readmePath, 'utf8');
        fileName = 'README.md';
      }

      if (!fileContent) {
        console.log(`${colors.red}${statusIcons.error} Brand "${brand}" not found${colors.reset}`);
        return;
      }

      // Write to current project
      const targetPath = path.join(this.repl?.projectPath || this.projectPath || process.cwd(), fileName);
      await fs.writeFile(targetPath, fileContent);

      console.log(`${statusIcons.success} Added ${fileName} for ${brand}`);
      await this.session?.addToMemory?.(`Added design file: ${brand}`, 'design');
    } catch (error) {
      console.log(`${colors.red}${statusIcons.error} Error: ${error.message}${colors.reset}`);
    }
  }

  async applyBrand(brand) {
    if (!brand) {
      console.log(`${colors.yellow}Usage: winter design apply <brand>${colors.reset}`);
      return;
    }

    try {
      const brandDir = path.join(this.brandsDir, brand);
      let fileContent = null;
      let fileName = null;

      const designPath = path.join(brandDir, 'DESIGN.md');
      const readmePath = path.join(brandDir, 'README.md');

      if (await fs.access(designPath).then(() => true).catch(() => false)) {
        fileContent = await fs.readFile(designPath, 'utf8');
        fileName = 'DESIGN.md';
      } else if (await fs.access(readmePath).then(() => true).catch(() => false)) {
        fileContent = await fs.readFile(readmePath, 'utf8');
        fileName = 'README.md';
      }

      if (!fileContent) {
        console.log(`${colors.red}${statusIcons.error} Brand "${brand}" not found${colors.reset}`);
        return;
      }

      console.log(`${colors.cyan}${statusIcons.info} Analyzing and applying ${brand} design system...${colors.reset}`);
      
      const prompt = `Please act as a Senior UI/UX Engineer. Analyze the following design system (${brand}) and apply it to this project with real tool calls. Inspect the existing UI files/styles first, then make focused code changes and verify with the closest build/typecheck/smoke command. Do not only describe the design. Focus on colors, typography, border radiuses, interactive states, and overall visual aesthetics as defined in the document.

<design_system>
${fileContent}
</design_system>

Start by reviewing the codebase, especially tailwind configs or global css, then rewrite the main components. Create a plan if needed.`;
      
      // Inject the task to the AI REPL loop
      await this.repl.chat(prompt);
      
    } catch (error) {
      console.log(`${colors.red}${statusIcons.error} Error: ${error.message}${colors.reset}`);
    }
  }

  async listBrands() {
    try {
      const brands = await fs.readdir(this.brandsDir);
      const sortedBrands = brands.sort();

      console.log(`\n${colors.cyan}Available Design Systems (${sortedBrands.length}):${colors.reset}\n`);

      // Group by first letter
      const grouped = {};
      sortedBrands.forEach(b => {
        const letter = b[0].toUpperCase();
        if (!grouped[letter]) grouped[letter] = [];
        grouped[letter].push(b);
      });

      Object.keys(grouped).sort().forEach(letter => {
        console.log(`${colors.yellow}[${letter}]${colors.reset}`);
        grouped[letter].forEach(b => console.log(`  ${b}`));
        console.log('');
      });
    } catch (error) {
      console.log(`${colors.red}${statusIcons.error} Error: ${error.message}${colors.reset}`);
      console.log(`${colors.dim}Make sure you have awesome-design-md installed${colors.reset}`);
    }
  }

  async previewBrand(brand) {
    if (!brand) {
      console.log(`${colors.yellow}Usage: winter design preview <brand>${colors.reset}`);
      return;
    }

    try {
      const brandDir = path.join(this.brandsDir, brand);
      let content = null;
      let fileName = null;

      const designPath = path.join(brandDir, 'DESIGN.md');
      const readmePath = path.join(brandDir, 'README.md');

      if (await fs.access(designPath).then(() => true).catch(() => false)) {
        content = await fs.readFile(designPath, 'utf8');
        fileName = 'DESIGN.md';
      } else if (await fs.access(readmePath).then(() => true).catch(() => false)) {
        content = await fs.readFile(readmePath, 'utf8');
        fileName = 'README.md';
      }

      if (!content) {
        console.log(`${colors.red}${statusIcons.error} Brand "${brand}" not found${colors.reset}`);
        return;
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`${colors.cyan}≡ ${brand} - ${fileName}${colors.reset}`);
      console.log('='.repeat(60));
      console.log('');

      // Show first 80 lines
      const lines = content.split('\n').slice(0, 80);
      console.log(lines.join('\n'));

      if (content.split('\n').length > 80) {
        console.log(`\n${colors.dim}... (truncated, ${content.split('\n').length - 80} more lines)${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.red}${statusIcons.error} Error: ${error.message}${colors.reset}`);
    }
  }

  async initBrandsDir() {
    const localDir = path.join(this.repl?.projectPath || this.projectPath || process.cwd(), '.design-systems');
    await fs.mkdir(localDir, { recursive: true });
    console.log(`${statusIcons.success} Created ${localDir}/`);
  }
}
