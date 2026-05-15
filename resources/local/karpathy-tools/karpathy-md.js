/**
 * karpathy-md.js - Apply Karpathy-style coding guidelines to projects
 * Usage: node karpathy-md.js <command> [args]
 */

const fs = require('fs');
const path = require('path');

// Colors
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
};

const log = (text, color = 'reset') => console.log(`${C[color]}${text}${C.reset}`);

// Source templates
const TEMPLATES_DIR = path.join(process.env.HOME || '', 'andrej-karpathy-skills');
const TOOLS_DIR = path.join(process.env.HOME || '', 'karpathy-tools');

// Check if template exists
function hasTemplate(name) {
  return fs.existsSync(path.join(TEMPLATES_DIR, name));
}

// Commands
const cmd = process.argv[2];
const arg = process.argv[3];

switch (cmd) {
  case 'init':
  case 'add': {
    const target = path.join(process.cwd(), 'CLAUDE.md');
    const source = path.join(TEMPLATES_DIR, 'CLAUDE.md');

    if (fs.existsSync(target)) {
      log(`⚠️  CLAUDE.md already exists`, 'yellow');
      log('Options: karpathy-md merge (to append)', 'dim');
      break;
    }

    if (!fs.existsSync(source)) {
      log(`❌ Source template not found`, 'red');
      break;
    }

    fs.copyFileSync(source, target);
    log(`✅ Added CLAUDE.md with Karpathy guidelines`, 'green');
    break;
  }

  case 'merge':
  case 'append': {
    const target = path.join(process.cwd(), 'CLAUDE.md');
    const source = path.join(TEMPLATES_DIR, 'CLAUDE.md');

    if (!fs.existsSync(target)) {
      log(`❌ No CLAUDE.md found in current directory`, 'yellow');
      log('Run: karpathy-md init', 'dim');
      break;
    }

    if (!fs.existsSync(source)) {
      log(`❌ Source template not found`, 'red');
      break;
    }

    const existing = fs.readFileSync(target, 'utf8');
    const toAppend = fs.readFileSync(source, 'utf8');

    // Append under header
    fs.writeFileSync(target, existing + '\n\n---\n\n' + toAppend);
    log(`✅ Merged Karpathy guidelines into existing CLAUDE.md`, 'green');
    break;
  }

  case 'view':
  case 'show':
    if (hasTemplate('CLAUDE.md')) {
      console.log(fs.readFileSync(path.join(TEMPLATES_DIR, 'CLAUDE.md'), 'utf8'));
    } else {
      log(`❌ Template not found`, 'red');
    }
    break;

  case 'examples':
    if (hasTemplate('EXAMPLES.md')) {
      console.log(fs.readFileSync(path.join(TEMPLATES_DIR, 'EXAMPLES.md'), 'utf8'));
    } else {
      log(`❌ Examples file not found`, 'red');
    }
    break;

  case 'rules':
    log(`\n📋 The 4 Karpathy Rules:\n`, 'cyan');
    console.log(`
${C.yellow}1. Think Before Coding${C.reset}
   • State assumptions explicitly
   • Ask when uncertain - don't guess
   • Present multiple interpretations

${C.yellow}2. Simplicity First${C.reset}
   • No speculative features
   • No over-engineering
   • If 200 lines could be 50, rewrite

${C.yellow}3. Surgical Changes${C.reset}
   • Touch only what's needed
   • Don't "improve" unrelated code
   • Match existing style

${C.yellow}4. Goal-Driven Execution${C.reset}
   • Define success criteria first
   • Write tests to verify
   • Loop until goals are met
`);
    break;

  default:
    console.log(`
${C.cyan}karpathy-md${C.reset} - Apply Karpathy-style coding guidelines

${C.yellow}Commands:${C.reset}
  init     Add CLAUDE.md to current project
  merge    Append guidelines to existing CLAUDE.md
  view     Show the guidelines
  examples Show practical examples
  rules    Show the 4 rules summary

${C.yellow}Examples:${C.reset}
  cd my-project && karpathy-md init
  karpathy-md view
  karpathy-md rules
`);
}