/**
 * ❄ INTERACTIVE TOOL ❄
 * Ask user questions with multi-select, single-select, and text input support.
 * Pauses execution and waits for user input.
 */

import { createInterface } from 'readline';

export class InteractiveTool {
  constructor(repl) {
    this.repl = repl;
  }

  async askQuestion(questions) {
    if (!questions || (Array.isArray(questions) && questions.length === 0)) {
      return { success: false, error: 'At least one question is required' };
    }

    const qList = Array.isArray(questions) ? questions : [questions];
    const answers = {};

    for (const q of qList) {
      if (!q.question && !q.message && !q.prompt) {
        answers[q.id || `q_${qList.indexOf(q)}`] = { error: 'Question text is required' };
        continue;
      }

      const questionText = q.question || q.message || q.prompt || '';
      const type = q.type || (q.options ? 'select' : 'text');
      const qId = q.id || `q_${qList.indexOf(q)}`;

      if (type === 'select' || type === 'multi-select') {
        const selected = await this.promptSelect(questionText, q.options || [], type === 'multi-select');
        answers[qId] = {
          question: questionText,
          answer: selected,
          type,
        };
      } else {
        const text = await this.promptText(questionText, q.default || '', q.validation || {});
        answers[qId] = {
          question: questionText,
          answer: text,
          type: 'text',
        };
      }
    }

    return {
      success: true,
      answers,
      count: Object.keys(answers).length,
    };
  }

  promptSelect(question, options, multiSelect) {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      // Write question
      console.log(`\n${multiSelect ? '[Select all that apply]' : '[Select one]'} ${question}`);
      options.forEach((opt, i) => {
        const label = typeof opt === 'string' ? opt : (opt.label || opt.name || `Option ${i + 1}`);
        console.log(`  ${i + 1}. ${label}`);
      });
      console.log('  (Enter number, or comma-separated numbers for multi-select)');

      rl.question('> ', (input) => {
        rl.close();
        const trimmed = input.trim();

        if (!trimmed) {
          resolve(multiSelect ? [] : null);
          return;
        }

        const indices = trimmed.split(/[,\s]+/).map(s => parseInt(s, 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < options.length);

        if (multiSelect) {
          resolve(indices.map(i => {
            const opt = options[i];
            return typeof opt === 'string' ? opt : (opt.value || opt.label || opt.name || String(opt));
          }));
        } else {
          const idx = indices[0];
          if (idx === undefined) resolve(null);
          const opt = options[idx];
          resolve(typeof opt === 'string' ? opt : (opt.value || opt.label || opt.name || String(opt)));
        }
      });
    });
  }

  promptText(question, defaultValue, validation) {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;

      rl.question(prompt, (input) => {
        rl.close();
        const answer = input.trim() || defaultValue || '';

        if (validation?.required && !answer) {
          console.log('This field is required. Please provide an answer.');
          resolve(this.promptText(question, defaultValue, validation));
          return;
        }

        if (validation?.pattern && answer) {
          const regex = new RegExp(validation.pattern);
          if (!regex.test(answer)) {
            console.log(validation.patternError || 'Invalid format. Please try again.');
            resolve(this.promptText(question, defaultValue, validation));
            return;
          }
        }

        resolve(answer);
      });
    });
  }
}
