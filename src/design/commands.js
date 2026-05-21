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
  constructor(session, config) {
    this.session = session;
    this.config = config;
    this.brandsDir = path.join(packageRoot, 'resources', 'local', 'awesome-design-md', 'design-md');
  }

  async execute(action, args) {
    switch (action) {
      case 'search':
      case 'find':
        await this.search(args[0] || '');
        break;
      case 'add':
        await this.addBrand(args[0]);
        break;
      case 'list':
        await this.listBrands();
        break;
      case 'preview':
        await this.previewBrand(args[0]);
        break;
      case 'init':
        await this.initBrandsDir();
        break;
      default:
        await this.listBrands();
    }
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

      await this.session.addToMemory(`Searched design brands for: ${query}`, 'search');
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
      const targetPath = path.join(process.cwd(), fileName);
      await fs.writeFile(targetPath, fileContent);

      console.log(`${statusIcons.success} Added ${fileName} for ${brand}`);
      await this.session.addToMemory(`Added design file: ${brand}`, 'design');
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
    const localDir = path.join(process.cwd(), '.design-systems');
    await fs.mkdir(localDir, { recursive: true });
    console.log(`${statusIcons.success} Created ${localDir}/`);
  }
}
