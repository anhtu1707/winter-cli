/**
 * ❄️ Winter CLI VS Code Extension ❄️
 * Connects VS Code to Winter CLI's MCP server for inline AI features:
 * - Inline completions
 * - Code chat
 * - Code review/refactor/fix
 * - Test generation
 */

const vscode = require('vscode');

const SERVER_PORT = 4157;
const SERVER_HOST = '127.0.0.1';

let outputChannel = null;
let statusBarItem = null;

/**
 * Activate the extension.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  outputChannel = vscode.window.createOutputChannel('Winter CLI');
  outputChannel.appendLine('❄️ Winter CLI extension activated');

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '❄️ Winter';
  statusBarItem.command = 'winter.startChat';
  statusBarItem.tooltip = 'Winter AI — Click to chat';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register all commands
  const commands = [
    vscode.commands.registerCommand('winter.startChat', () => startChat()),
    vscode.commands.registerCommand('winter.inlineCompletion', () => triggerInlineCompletion()),
    vscode.commands.registerCommand('winter.explainCode', () => performAction('explain')),
    vscode.commands.registerCommand('winter.refactorCode', () => performAction('refactor')),
    vscode.commands.registerCommand('winter.fixCode', () => performAction('fix')),
    vscode.commands.registerCommand('winter.generateTests', () => generateTests()),
    vscode.commands.registerCommand('winter.openTerminal', () => openTerminal()),
    vscode.commands.registerCommand('winter.codeReview', () => codeReview()),
  ];

  commands.forEach(cmd => context.subscriptions.push(cmd));

  // Check if Winter CLI is running
  checkWinterRunning();
}

/**
 * Deactivate the extension.
 */
function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine('❄️ Winter CLI extension deactivated');
  }
}

/**
 * Check if the Winter CLI MCP server is running.
 */
async function checkWinterRunning() {
  try {
    const connected = await sendMessage({ type: 'ping' });
    if (connected) {
      statusBarItem.text = '❄️ Winter';
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = '❄️ Winter (offline)';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  } catch {
    statusBarItem.text = '❄️ Winter (offline)';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
}

/**
 * Start a chat session.
 * Opens a webview panel or uses the integrated terminal.
 */
async function startChat() {
  const terminal = vscode.window.createTerminal('Winter CLI');
  terminal.show();
  terminal.sendText('winter');
}

/**
 * Trigger inline completion at cursor position.
 */
async function triggerInlineCompletion() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  const document = editor.document;
  const filePath = document.uri.fsPath;
  const position = editor.selection.active;
  const line = position.line + 1; // 1-based
  const column = position.character;

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Winter: Generating completions...' },
    async () => {
      try {
        const result = await sendMessage({
          type: 'inline:complete',
          path: filePath,
          line,
          column,
        });

        if (result && result.completions && result.completions.length > 0) {
          const best = result.completions[0];
          editor.edit(editBuilder => {
            editBuilder.insert(position, best.text);
          });
          vscode.window.setStatusBarMessage(`❄️ Inserted: ${best.text.substring(0, 30)}...`, 3000);
        } else {
          vscode.window.showInformationMessage('No completions available');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Winter: ${err.message}`);
      }
    }
  );
}

/**
 * Perform an AI action on selected code (explain/refactor/fix).
 */
async function performAction(action) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
    vscode.window.showInformationMessage('No code selected');
    return;
  }

  const actions = {
    explain: { title: 'Explain Code', prompt: `Explain this code:\n\n${selectedText}` },
    refactor: { title: 'Refactor Code', prompt: `Refactor this code:\n\n${selectedText}` },
    fix: { title: 'Fix Code', prompt: `Find and fix bugs in this code:\n\n${selectedText}` },
  };

  const actionConfig = actions[action];
  if (!actionConfig) return;

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: `Winter: ${actionConfig.title}...` },
    async () => {
      try {
        const result = await sendMessage({
          type: 'ai:action',
          action,
          code: selectedText,
          filePath: editor.document.uri.fsPath,
        });

        if (result && result.response) {
          // Show result in output channel
          outputChannel.clear();
          outputChannel.appendLine(`❄️ ${actionConfig.title}`);
          outputChannel.appendLine('─'.repeat(50));
          outputChannel.appendLine(result.response);
          outputChannel.show();

          // If it's a refactor/fix, offer to apply changes
          if ((action === 'refactor' || action === 'fix') && result.editedContent) {
            const apply = await vscode.window.showInformationMessage(
              'Winter has suggestions. Apply changes?',
              'Yes', 'No', 'Preview'
            );
            if (apply === 'Yes') {
              await editor.edit(editBuilder => {
                editBuilder.replace(selection, result.editedContent);
              });
              vscode.window.showInformationMessage('Applied!');
            } else if (apply === 'Preview') {
              // Show diff
              vscode.commands.executeCommand('vscode.diff',
                editor.document.uri,
                vscode.Uri.parse(`untitled:${editor.document.fileName}.winter`),
                'Original ↔ Winter'
              );
            }
          }
        } else {
          vscode.window.showInformationMessage('No response from Winter');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Winter: ${err.message}`);
      }
    }
  );
}

/**
 * Generate tests for the current file.
 */
async function generateTests() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const content = editor.document.getText();

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Winter: Generating tests...' },
    async () => {
      try {
        const result = await sendMessage({
          type: 'ai:action',
          action: 'generate-tests',
          code: content,
          filePath,
        });

        if (result && result.response) {
          outputChannel.clear();
          outputChannel.appendLine('❄️ Generated Tests');
          outputChannel.appendLine('─'.repeat(50));
          outputChannel.appendLine(result.response);
          outputChannel.show();

          const createFile = await vscode.window.showInformationMessage(
            'Create test file with generated tests?',
            'Create', 'Cancel'
          );
          if (createFile === 'Create' && result.editedContent) {
            const testPath = filePath.replace(/\.(\w+)$/, '.test.$1');
            const uri = vscode.Uri.file(testPath);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(result.editedContent, 'utf8'));
            vscode.window.showInformationMessage(`Created: ${testPath}`);
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Winter: ${err.message}`);
      }
    }
  );
}

/**
 * Open Winter CLI in a terminal.
 */
function openTerminal() {
  const terminal = vscode.window.createTerminal('Winter CLI');
  terminal.show();
  terminal.sendText('winter');
}

/**
 * Code review of the current file.
 */
async function codeReview() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const content = editor.document.getText();

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Winter: Reviewing code...' },
    async () => {
      try {
        const result = await sendMessage({
          type: 'ai:action',
          action: 'review',
          code: content,
          filePath,
        });

        if (result && result.response) {
          // Show diagnostics
          const diagnostics = [];
          if (result.diagnostics) {
            for (const d of result.diagnostics) {
              const range = new vscode.Range(
                new vscode.Position(d.line - 1, d.column || 0),
                new vscode.Position(d.line - 1, (d.endColumn || d.column || 0) + 50)
              );
              diagnostics.push(new vscode.Diagnostic(
                range,
                d.message,
                d.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                d.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                vscode.DiagnosticSeverity.Information
              ));
            }
          }

          if (diagnostics.length > 0) {
            const diagnosticCollection = vscode.languages.createDiagnosticCollection('winter');
            diagnosticCollection.set(editor.document.uri, diagnostics);
            setTimeout(() => diagnosticCollection.clear(), 30000);
          }

          outputChannel.clear();
          outputChannel.appendLine('❄️ Code Review');
          outputChannel.appendLine('─'.repeat(50));
          outputChannel.appendLine(result.response);
          outputChannel.show();
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Winter: ${err.message}`);
      }
    }
  );
}

/**
 * Send a JSON message to the Winter MCP server.
 * Returns parsed response or null.
 */
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    const net = require('net');

    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Connection timed out. Is Winter running? (winter --mcp)'));
    }, 5000);

    let responseData = '';

    client.connect(SERVER_PORT, SERVER_HOST, () => {
      client.write(JSON.stringify(message) + '\n');
    });

    client.on('data', (data) => {
      responseData += data.toString();
      try {
        const response = JSON.parse(responseData);
        clearTimeout(timeout);
        client.destroy();
        resolve(response);
      } catch {
        // Incomplete JSON, wait for more data
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      client.destroy();
      reject(new Error(`Cannot connect to Winter MCP server on ${SERVER_HOST}:${SERVER_PORT}. Start Winter with 'winter --mcp' first.`));
    });

    client.on('close', () => {
      clearTimeout(timeout);
      if (responseData) {
        try {
          resolve(JSON.parse(responseData));
        } catch {
          reject(new Error('Invalid response from Winter MCP server'));
        }
      } else {
        reject(new Error('Connection closed without response'));
      }
    });
  });
}

module.exports = { activate, deactivate };
