import { renderBox, supportsUnicodeUi, terminalWidth } from './terminal-ui.js';

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  bgCyan: '\x1b[46m',
  bgMagenta: '\x1b[45m',
};

const DARK_THEME = { cyan: '\x1b[36m', blue: '\x1b[34m', magenta: '\x1b[35m', white: '\x1b[37m', red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m' };
const LIGHT_THEME = { cyan: '\x1b[96m', blue: '\x1b[94m', magenta: '\x1b[95m', white: '\x1b[97m', red: '\x1b[91m', yellow: '\x1b[93m', green: '\x1b[92m', dim: '\x1b[2m' };

export function applyColorTheme(theme = 'dark') {
  const selected = String(theme || '').toLowerCase() === 'light' ? LIGHT_THEME : DARK_THEME;
  Object.assign(colors, selected, { theme: String(theme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark' });
  return colors.theme;
}

const snowflakeArt = String.raw`
                          ii
                         .i;
                 ,        ;i        ,
                       ;i::;:i;
                         ,i1:
        :,,    ,,     ;:,::i,;:i: ,   i    ii;
        ,ii;;: ii  ,1  :;iiiii:  ;1  .1, i;:,
            :::ii,,;1.   ;iii;   :1:,:i1;,
            ,;i:,i:i1:i, ,;i;  ;i;1i;;  :;:
            ,.  ,i1iii11, ,;, ,11ii;ii;
               :;:  ::,,:i111i:  ,,   ,:
               ::   ,,, :i111i:,,,:  :;:
                :ii;ii11: ,;,  11iii1i:
            :i:  ;;i1;;;  ;i;, ,i:1i:i,:i;:
             ,;1i;,:1;   ;iiii    1;,,i1::,
          ,,;i, 1,  i;  :iiiii;:  1:  ii ,;;ii,
         ;ii    i,  , :i::,;:,::;.    ,:    ,,:
                          :ii:
                        ;i:;;:i;
                           ;i
                           ;i,
                           ;i. 
`;

export const miniLogo = `${colors.cyan}${supportsUnicodeUi() ? '❄' : '*'}${colors.reset}`;

export function welcomeBanner(version, info = {}) {
  const pPath = info.project || 'Unknown';
  const displayPath = pPath; // Hiển thị đầy đủ đường dẫn chính xác
  const pId = info.session || 'New';
  const provider = info.provider || 'default';
  const model = info.model || 'unknown';

  // Tính toán chiều rộng động (nhỏ hơn 5% cửa sổ, tối thiểu 60, tối đa 100 cho đẹp)
  const columns = process.stdout.columns || 80;
  const W = Math.max(60, Math.min(Math.floor(columns * 0.95), 100));
  const unicode = supportsUnicodeUi();
  const dot = `${colors.green}${unicode ? '●' : '*'}${colors.reset}`;

  // Căn giữa Snowflake Art
  const artLines = snowflakeArt.split('\n').filter(l => l.trim() !== '' || l.length > 0);
  // Tìm chiều dài thực tế lớn nhất của art (bỏ qua khoảng trắng thừa ở cuối)
  const maxArtWidth = Math.max(...artLines.map(l => l.trimEnd().length));
  const artPadding = Math.max(0, Math.floor((W - maxArtWidth) / 2));
  const centeredArt = artLines.map(l => ' '.repeat(artPadding) + l.trimEnd()).join('\n');

  // Căn giữa tiêu đề
  const title = `W I N T E R   v${version}`;
  const titlePadding = Math.max(0, Math.floor((W - title.length) / 2));

  const subtitle = `Build by Atus | fb: iam.anhtu | github: anhtu1707`;
  const subPadding = Math.max(0, Math.floor((W - subtitle.length) / 2));

  const infoWidth = Math.max(60, Math.min(terminalWidth(60, 100, 80), 100));
  const banner = `${colors.cyan}${centeredArt}${colors.reset}

${' '.repeat(titlePadding)}${colors.bright}${colors.magenta}W I N T E R${colors.reset}  ${colors.dim}v${version}${colors.reset}
${' '.repeat(subPadding)}${colors.dim}${subtitle}${colors.reset}
${renderBox({
  title: '',
  width: infoWidth,
  borderColor: colors.blue,
  titleColor: colors.blue,
  body: [
    `${dot} ${colors.cyan}Project:${colors.reset} ${colors.green}${displayPath}${colors.reset}`,
    `${dot} ${colors.cyan}Model:  ${colors.reset} ${model} ${colors.dim}(${provider})${colors.reset}`,
    `${dot} ${colors.cyan}Session:${colors.reset} ${colors.yellow}${pId}${colors.reset}`,
    `${colors.dim}Gõ ${colors.cyan}/help${colors.dim} để xem lệnh · ${colors.cyan}/auto${colors.dim} chế độ tự sửa · ${colors.cyan}ESC${colors.dim} để hủy${colors.reset}`,
  ],
})}
`;
  return banner;
}

export const statusIcons = {
  online: `${colors.green}${supportsUnicodeUi() ? '●' : 'on'}${colors.reset}`,
  offline: `${colors.dim}${supportsUnicodeUi() ? '○' : 'off'}${colors.reset}`,
  warning: `${colors.yellow}${supportsUnicodeUi() ? '◆' : '!'}${colors.reset}`,
  error: `${colors.red}${supportsUnicodeUi() ? '✖' : 'x'}${colors.reset}`,
  success: `${colors.green}${supportsUnicodeUi() ? '✓' : 'ok'}${colors.reset}`,
  thinking: `${colors.cyan}${supportsUnicodeUi() ? '◉' : '...'}${colors.reset}`,
  queue: `${colors.magenta}${supportsUnicodeUi() ? '◎' : 'queue'}${colors.reset}`,
};

export function sessionIndicator(sessionId) {
  const id = sessionId ? sessionId.substring(0, 8) : 'none';
  return `${colors.dim}[${colors.cyan}session:${id}${colors.dim}]${colors.reset}`;
}

export function providerStatus(name, status) {
  const icon = status === 'ready' ? statusIcons.online : statusIcons.offline;
  return `${icon} ${name}`;
}

export const snowflake = snowflakeArt;
