import test from 'node:test';
import assert from 'node:assert/strict';

import { WinterInputController } from './input-controller.js';

function createReplStub(overrides = {}) {
  return {
    running: true,
    readlineClosed: false,
    useUnicodeUi: false,
    slashMenu: { open: false, line: '', items: [], selected: 0, printedLines: 0 },
    taskQueue: [],
    inputQueue: Promise.resolve(),
    getSlashSuggestions: () => [],
    getClipboardImage: async () => null,
    closeSlashMenu() {},
    closeInputBox() {},
    showInputPrompt() {},
    processInputTask() {},
    async chat() {},
    rl: {
      line: '',
      setPrompt(value) {
        this.promptText = value;
      },
      prompt() {
        this.prompted = true;
      },
      write() {},
    },
    ...overrides,
  };
}

test('WinterInputController builds stable bottom input panel', () => {
  const repl = createReplStub();
  const input = new WinterInputController(repl);
  const panel = input.buildInputPanel();

  assert.ok(panel.top.length > 0);
  assert.ok(panel.status.length > 0);
  assert.ok(panel.prompt.length > 0);
});

test('WinterInputController direct clipboard paste sends image attachment', async () => {
  const chats = [];
  const writes = [];
  const repl = createReplStub({
    getClipboardImage: async () => ({ mime: 'image/png', base64: 'AAAA' }),
    async chat(prompt, images) {
      chats.push({ prompt, images });
    },
    rl: {
      line: 'debug ảnh này',
      write(value, options) {
        writes.push({ value, options });
      },
      prompt() {},
      setPrompt() {},
    },
  });
  const input = new WinterInputController(repl);

  const handled = await input.handleDirectClipboardPaste();
  await repl.inputQueue;

  assert.equal(handled, true);
  assert.deepEqual(chats, [{
    prompt: 'debug ảnh này',
    images: [{ mime: 'image/png', base64: 'AAAA' }],
  }]);
  assert(writes.some(entry => entry.value === null && entry.options?.ctrl === true && entry.options?.name === 'u'));
  assert.equal(repl.isProcessing, false);
});

test('WinterInputController direct clipboard paste inserts short text', async () => {
  const writes = [];
  const repl = createReplStub({
    getClipboardPayload: async () => ({ type: 'text', text: 'hello clipboard' }),
    rl: {
      line: '',
      write(value, options) {
        writes.push({ value, options });
      },
      prompt() {},
      setPrompt() {},
    },
  });
  const input = new WinterInputController(repl);

  const handled = await input.handleDirectClipboardPaste();

  assert.equal(handled, true);
  assert.deepEqual(writes, [{ value: 'hello clipboard', options: undefined }]);
});

test('WinterInputController direct clipboard paste persists large text', async () => {
  const writes = [];
  const handledInputs = [];
  const text = Array.from({ length: 9 }, (_, index) => `line ${index + 1}`).join('\n');
  const repl = createReplStub({
    getClipboardPayload: async () => ({ type: 'text', text }),
    normalizePastedText: value => String(value).replace(/\r\n/g, '\n'),
    shouldPersistPastedText: value => String(value).split(/\n/).length >= 8,
    persistPastedText: async value => ({ index: 1, lines: String(value).split(/\n/).length, path: 'paste.txt' }),
    formatPastedTextReference: paste => `[Pasted text #${paste.index}: ${paste.lines} lines -> ${paste.path}]`,
    handleInput: async value => handledInputs.push(value),
    rl: {
      line: '',
      write(value, options) {
        writes.push({ value, options });
      },
      prompt() {},
      setPrompt() {},
    },
  });
  const input = new WinterInputController(repl);

  const handled = await input.handleDirectClipboardPaste();
  await repl.inputQueue;

  assert.equal(handled, true);
  assert(writes.some(entry => entry.value === null && entry.options?.ctrl === true && entry.options?.name === 'u'));
  assert.deepEqual(handledInputs, ['[Pasted text #1: 9 lines -> paste.txt]']);
});

test('WinterInputController slash selection preserves suffix', () => {
  const writes = [];
  let prompted = 0;
  const repl = createReplStub({
    slashMenu: {
      open: true,
      line: '/pro hello',
      items: [{ cmd: '/project', usage: '<path>' }],
      selected: 0,
      printedLines: 0,
    },
    rl: {
      line: '/pro hello',
      write(value, options) {
        writes.push({ value, options });
      },
      prompt() {
        prompted++;
      },
    },
  });
  const input = new WinterInputController(repl);

  assert.equal(input.handleSlashMenuKey({ name: 'tab' }), true);
  assert(writes.some(entry => entry.value === '/project hello'));
  assert.equal(prompted, 1);
});

test('WinterInputController redraws slash menu in place on TTY', () => {
  const writes = [];
  let prompted = 0;
  const repl = createReplStub({
    slashMenu: {
      open: true,
      line: '/',
      items: [
        { cmd: '/help', desc: 'Show help' },
        { cmd: '/provider', desc: 'Switch provider' },
      ],
      selected: 0,
      printedLines: 0,
    },
    rl: {
      line: '/',
      prompt() {
        prompted++;
      },
    },
  });
  const input = new WinterInputController(repl);
  const originalWrite = process.stdout.write;
  const originalIsTTY = process.stdout.isTTY;

  process.stdout.write = chunk => {
    writes.push(String(chunk));
    return true;
  };
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

  try {
    input.renderSlashMenu();
    repl.slashMenu.line = '/p';
    repl.slashMenu.items = [{ cmd: '/provider', desc: 'Switch provider' }];
    input.renderSlashMenu();
  } finally {
    process.stdout.write = originalWrite;
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  }

  const output = writes.join('');
  assert.match(output, /Command Palette/);
  assert.match(output, /\x1b\[[0-9]+A/);
  assert.match(output, /\x1b\[0J/);
  assert.equal(prompted, 2);
});

test('WinterInputController slash menu scrolls selected item into view', () => {
  const repl = createReplStub({
    slashMenu: {
      open: true,
      line: '/',
      items: Array.from({ length: 12 }, (_, index) => ({ cmd: `/cmd${index}`, desc: `Command ${index}` })),
      selected: 0,
      offset: 0,
      printedLines: 0,
    },
    rl: {
      line: '/',
      prompt() {},
    },
  });
  const input = new WinterInputController(repl);
  input.renderSlashMenu = () => {};

  for (let i = 0; i < 8; i++) {
    input.moveSlashSelection(1);
  }

  assert.equal(repl.slashMenu.selected, 8);
  assert.equal(repl.slashMenu.offset, 2);

  input.moveSlashSelection(-1);
  input.moveSlashSelection(-1);
  input.moveSlashSelection(-1);

  assert.equal(repl.slashMenu.selected, 5);
  assert.equal(repl.slashMenu.offset, 2);

  for (let i = 0; i < 7; i++) {
    input.moveSlashSelection(-1);
  }

  assert.equal(repl.slashMenu.selected, 10);
  assert.equal(repl.slashMenu.offset, 5);
});
