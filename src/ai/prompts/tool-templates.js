/**
 * Tool Templates - Few-shot examples for tool usage patterns.
 * Helps the AI model understand how to use tools effectively.
 */

export const TOOL_EXAMPLES = {
  Read: [
    {
      desc: 'Read a specific file',
      input: { path: 'src/app.js' },
      output: 'File content returned with line numbers',
    },
    {
      desc: 'Read multiple files at once',
      input: { paths: ['package.json', 'tsconfig.json'] },
      output: 'Contents of all requested files',
    },
  ],

  Edit: [
    {
      desc: 'Replace a specific string in a file',
      input: { path: 'src/app.js', oldString: 'console.log', newString: 'logger.info' },
      output: 'File updated, showing the diff',
    },
    {
      desc: 'Replace multiple strings in one call',
      input: {
        path: 'src/utils.js',
        replacements: [
          { oldString: 'var ', newString: 'const ' },
          { oldString: 'function(', newString: 'function (' },
        ],
      },
      output: 'All replacements applied, showing combined diff',
    },
  ],

  Bash: [
    {
      desc: 'Run a simple command',
      input: { command: 'node --version' },
      output: 'Command stdout and stderr',
    },
    {
      desc: 'Run with timeout',
      input: { command: 'npm test', timeout: 60000 },
      output: 'Test results',
    },
    {
      desc: 'Platform-aware commands',
      input: { command: 'dir', shell: 'cmd' },
      note: 'On Windows, specify shell:"cmd" or shell:"powershell"',
    },
  ],

  Grep: [
    {
      desc: 'Search for a pattern in TypeScript files',
      input: { pattern: 'authenticate', flags: '-g *.ts' },
      output: 'Matching lines with file:line format',
    },
  ],

  TaskCreate: [
    {
      desc: 'Create a single task',
      input: { title: 'Refactor auth module', status: 'pending' },
      output: 'Task created with ID',
    },
  ],

  Parallel: [
    {
      desc: 'Run multiple independent tools concurrently',
      input: { tools: [
        { name: 'Grep', input: { pattern: 'TODO' } },
        { name: 'Glob', input: { pattern: '*.test.js' } },
      ]},
      output: 'Combined results from all tools',
    },
  ],

  Agent: [
    {
      desc: 'Spawn a sub-agent for a specific task',
      input: { name: 'code-searcher', prompt: 'Find all authentication related code' },
      output: 'Sub-agent findings',
    },
  ],
};

export function getToolExamples(toolNames = []) {
  if (!toolNames.length) return TOOL_EXAMPLES;

  const result = {};
  for (const name of toolNames) {
    if (TOOL_EXAMPLES[name]) {
      result[name] = TOOL_EXAMPLES[name];
    }
  }
  return result;
}

export function getToolGuide(toolName) {
  const examples = TOOL_EXAMPLES[toolName];
  if (!examples) return null;

  return {
    name: toolName,
    examples,
    usage: `Use ${toolName} when you need to ${examples[0]?.desc || 'perform this operation'}`,
  };
}

export default TOOL_EXAMPLES;
