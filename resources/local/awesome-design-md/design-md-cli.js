/**
 * design-md-cli.js - Interactive CLI for awesome-design-md
 * Usage: node design-md-cli.js <command> [args]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DESIGN_MD_DIR = path.join(__dirname, 'design-md');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(text, color = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

function readDesignFile(brand) {
  const dir = path.join(DESIGN_MD_DIR, brand);
  if (fs.existsSync(path.join(dir, 'DESIGN.md'))) {
    return { file: 'DESIGN.md', content: fs.readFileSync(path.join(dir, 'DESIGN.md'), 'utf8') };
  }
  if (fs.existsSync(path.join(dir, 'README.md'))) {
    return { file: 'README.md', content: fs.readFileSync(path.join(dir, 'README.md'), 'utf8') };
  }
  return null;
}

function search(query) {
  const brands = fs.readdirSync(DESIGN_MD_DIR).filter(f =>
    fs.statSync(path.join(DESIGN_MD_DIR, f)).isDirectory()
  );

  const matches = brands.filter(b => b.toLowerCase().includes(query.toLowerCase()));

  if (matches.length === 0) {
    log(`❌ No matches for "${query}"`, 'yellow');
    return;
  }

  log(`\n🔍 Results for "${query}" (${matches.length}):\n`, 'cyan');
  matches.forEach((brand, i) => {
    const data = readDesignFile(brand);
    const size = data ? Math.round(data.content.length / 1024) : 0;
    log(`  ${i + 1}. ${brand} ${colors.dim}(~${size}KB)${colors.reset}`);
  });
  console.log();
}

function addToProject(brand) {
  const data = readDesignFile(brand);

  if (!data) {
    log(`❌ Brand "${brand}" not found`, 'yellow');
    log('Run: node design-md-cli.js list', 'dim');
    return false;
  }

  const targetPath = path.join(process.cwd(), data.file);

  if (fs.existsSync(targetPath)) {
    log(`⚠️  ${data.file} already exists`, 'yellow');
    return false;
  }

  fs.writeFileSync(targetPath, data.content);
  log(`✅ Added ${data.file} for ${brand}`, 'green');
  return true;
}

function preview(brand) {
  const data = readDesignFile(brand);

  if (!data) {
    log(`❌ Brand "${brand}" not found`, 'yellow');
    return;
  }

  console.log('\n' + '='.repeat(60));
  log(`📋 ${brand} - ${data.file}`, 'cyan');
  console.log('='.repeat(60) + '\n');

  // Show first 50 lines
  const lines = data.content.split('\n').slice(0, 50);
  console.log(lines.join('\n'));
  console.log(colors.dim + '\n... (truncated)' + colors.reset);
}

function list() {
  const brands = fs.readdirSync(DESIGN_MD_DIR).filter(f =>
    fs.statSync(path.join(DESIGN_MD_DIR, f)).isDirectory()
  ).sort();

  log(`\n📦 Available brands: ${brands.length}\n`, 'cyan');

  // Group by first letter
  const grouped = {};
  brands.forEach(b => {
    const letter = b[0].toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(b);
  });

  Object.keys(grouped).sort().forEach(letter => {
    console.log(`\n${colors.yellow}[${letter}]${colors.reset}`);
    grouped[letter].forEach(b => {
      const data = readDesignFile(b);
      const size = data ? Math.round(data.content.length / 1024) : 0;
      console.log(`  ${b.padEnd(15)} ${colors.dim}${size}KB${colors.reset}`);
    });
  });
  console.log();
}

// Main CLI
const cmd = process.argv[2];
const arg = process.argv[3];

switch (cmd) {
  case 'search':
  case 'find':
    search(arg || '');
    break;

  case 'add':
    addToProject(arg);
    break;

  case 'preview':
  case 'view':
    preview(arg);
    break;

  case 'list':
    list();
    break;

  case 'init':
    fs.mkdirSync('.design-systems', { recursive: true });
    log('✅ Created .design-systems/', 'green');
    break;

  default:
    console.log(`
${colors.cyan}design-md CLI${colors.reset} - Search and add DESIGN.md files

${colors.yellow}Commands:${colors.reset}
  search <name>  Search for a brand
  add <brand>    Add design file to project
  preview <brand> Preview design file
  list           List all brands
  init           Create .design-systems/ dir

${colors.yellow}Examples:${colors.reset}
  node design-md-cli.js search stripe
  node design-md-cli.js add vercel
  node design-md-cli.js preview figma
`);
}