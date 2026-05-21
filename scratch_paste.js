const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'test> '
});
rl.prompt();

let lastChunkLength = 0;
process.stdin.on('data', (chunk) => {
  lastChunkLength = chunk.length;
  // console.log(`\n[chunk length: ${chunk.length}, content: ${JSON.stringify(chunk.toString())}]`);
});

rl.on('line', (line) => {
  if (lastChunkLength > 2) {
    console.log(`\n(Line came from paste! length=${lastChunkLength}) line=${line}`);
  } else {
    console.log(`\n(Line came from enter key! length=${lastChunkLength}) line=${line}`);
  }
  rl.prompt();
});
