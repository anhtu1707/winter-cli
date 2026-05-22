const fs = require('fs');

const path = 'C:\\Users\\PHUCANSOLUTIONS\\.gemini\\antigravity\\brain\\d2d5166d-b441-4b6a-a54e-3920cf684ce3\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(path, 'utf8');

const regex = /"TargetFile":"e:\/dev\/app\/winter\/([^"]+)"/g;
const files = new Set();
let match;

while ((match = regex.exec(content)) !== null) {
  files.add(match[1]);
}

console.log("Modified files from previous agent:");
for (const file of Array.from(files).sort()) {
  console.log(file);
}
