import readline from 'readline';

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

console.log('Press keys to see events. Press Ctrl+C to exit.');

process.stdin.on('keypress', (str, key) => {
  console.log({ str, key });
  if (key.ctrl && key.name === 'c') process.exit();
});
