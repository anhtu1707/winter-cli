const { execSync } = require('child_process');
const fs = require('fs');

console.log('Đang khôi phục tui.js và snowflake-logo.js về bản gốc...');
try {
  execSync('git checkout -- src/cli/tui.js src/cli/snowflake-logo.js', { stdio: 'inherit' });
} catch (e) {
  console.log('Lỗi khi chạy git checkout. Chắc chắn bạn đã cài git và thư mục này là git repo.');
}

console.log('Đang áp dụng giao diện FREEBUFF...');

// 1. Cập nhật snowflake-logo.js
let logoCode = fs.readFileSync('src/cli/snowflake-logo.js', 'utf8');
const newBanner = `export function welcomeBanner(version, info = {}) {
  const displayPath = info.project || 'Unknown';
  const provider = info.provider || 'default';
  const model = info.model || 'unknown';

  const W = Math.max(60, Math.min(process.stdout.columns || 80, 100));
  const white = colors.white;
  const dim = colors.dim;
  const bright = colors.bright;
  const reset = colors.reset;
  const green = '\\x1b[92m';
  const bgBlue = '\\x1b[48;5;236m'; 

  const logo = [
    ' __        __  _   _  _   _ ______ _____  ______ _____ ',
    ' \\\\ \\\\      / / | \\\\ | || \\\\ | ||  ____|  __ \\\\|  ____|  __ \\\\',
    '  \\\\ \\\\ /\\\\ / /__|  \\\\| ||  \\\\| || |__  | |__) | |__  | |__) |',
    '   \\\\ V  V / _ \\\\ . \` || . \` ||  __| |  _  /|  __| |  _  / ',
    '    \\\\_/\\\\_/  __/ |\\\\  || |\\\\  || |____| | \\\\ \\\\| |____| | \\\\ \\\\',
    '           |___|_| \\\\_||_| \\\\_||______|_|  \\\\_\\\\______|_|  \\\\_\\\\',
  ];
  const logoLines = logo.map(line => \`\${bright}\${green}\${line}\${reset}\`);

  const leftStatus = \` \${provider} · \${model} \`;
  const rightStatus = \` ✕ End session \`;
  const padding = Math.max(0, W - leftStatus.length - rightStatus.length);
  const statusBar = \`\${bgBlue}\${white}\${leftStatus}\${' '.repeat(padding)}\${rightStatus}\${reset}\`;

  const banner = [
    ...logoLines,
    '',
    \`\${white}Winter will run commands on your behalf to help you build.\${reset}\`,
    '',
    \`\${white}Directory\${reset} \${dim}\${displayPath}\${reset}\`,
    '',
    statusBar
  ].join('\\n');
  return banner;
}`;

logoCode = logoCode.replace(/export function welcomeBanner[\s\S]*?return banner;\n}/, newBanner);
fs.writeFileSync('src/cli/snowflake-logo.js', logoCode);

// 2. Cập nhật tui.js
let tuiCode = fs.readFileSync('src/cli/tui.js', 'utf8');
const newInputPanel = `export function renderInputPanel(snapshot, {
  colors,
  width = terminalWidth(66, 124),
  box = ASCII_BOX,
} = {}) {
  const c = colors || {};
  const panelWidth = Math.max(64, width - 2);
  const innerWidth = Math.max(20, panelWidth - 4);
  
  return {
    top: \`\${c.dim}┌\${'─'.repeat(innerWidth + 2)}┐\${c.reset}\`,
    status: '',
    hint: '',
    prompt: \`\${c.bright}\${c.green}│\${c.reset} \`,
    bottom: \`\${c.dim}└\${'─'.repeat(innerWidth + 2)}┘\${c.reset}\`,
  };
}`;

tuiCode = tuiCode.replace(/export function renderInputPanel[\s\S]*?return \{[\s\S]*?bottom:.*?\n  \};\n}/, newInputPanel);
fs.writeFileSync('src/cli/tui.js', tuiCode);

console.log('Hoàn tất! Hãy chạy lại lệnh winter để xem kết quả.');
