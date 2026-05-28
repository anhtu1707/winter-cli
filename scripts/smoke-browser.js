#!/usr/bin/env node

import process from 'node:process';
import { ToolExecutor } from '../src/tools/executor.js';

const html = [
  '<html>',
  '<head><title>Winter Visible Smoke</title></head>',
  '<body>',
  '<button id="ok">OK</button>',
  '<script>',
  'document.querySelector("#ok").addEventListener("click",()=>document.body.dataset.clicked="yes")',
  '</script>',
  '</body>',
  '</html>',
].join('');

const tools = new ToolExecutor({
  projectPath: process.cwd(),
  config: { async load() { return {}; } },
  session: null,
});

const browserDebug = await tools.execute('BrowserDebug', {
  url: `data:text/html,${encodeURIComponent(html)}`,
  action: 'document.title',
});

if (browserDebug.success === false) {
  console.error(`BrowserDebug smoke failed: ${browserDebug.error}`);
  process.exit(1);
}

const visibleBrowser = await tools.execute('VisibleBrowser', {
  url: `data:text/html,${encodeURIComponent(html)}`,
  action: 'click',
  selector: '#ok',
  browser: 'chrome',
  keep_open: false,
});

if (visibleBrowser.success === false) {
  console.error(`VisibleBrowser smoke failed: ${visibleBrowser.error}`);
  console.error(visibleBrowser.recovery || '');
  process.exit(1);
}

if (visibleBrowser.visible !== true || visibleBrowser.controlled !== true || visibleBrowser.title !== 'Winter Visible Smoke') {
  console.error(`VisibleBrowser smoke returned incomplete evidence: ${JSON.stringify(visibleBrowser, null, 2)}`);
  process.exit(1);
}

console.log('Browser smoke passed: BrowserDebug and VisibleBrowser controlled a real Chromium page.');
