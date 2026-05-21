import { DiffView } from './src/cli/diff-view.js';

const dv = new DiffView();
dv.promptDiff('test.js', 'const a = 1;\nconsole.log(a);', 'const a = 2;\nconsole.log(a);\n// added');
