import { renderStatusPanel, renderCommandCenter, renderInputPanel } from './src/cli/tui.js';
import { colors } from './src/cli/snowflake-logo.js';

try {
  const snapshot = {
    provider: 'test', model: 'test', projectPath: '/test', sessionShort: '123', projectName: 'test'
  };
  console.log('Testing renderStatusPanel...');
  const status = renderStatusPanel(snapshot, { colors });
  console.log(status);
  
  console.log('Testing renderCommandCenter...');
  const center = renderCommandCenter({ colors });
  console.log(center);

  console.log('Testing renderInputPanel...');
  const input = renderInputPanel(snapshot, { colors });
  console.log(input);

  console.log('ALL TUI FUNCTIONS RAN SUCCESSFULLY');
} catch (e) {
  console.error('ERROR:', e.stack);
}
