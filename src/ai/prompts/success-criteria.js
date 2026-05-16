/**
 * Success Criteria - Defines verifiable goals for task completion.
 * Transforms imperative instructions into declarative goals.
 */

import { classifyTask, TASK_CATEGORIES } from './task-classifier.js';

export class SuccessCriteria {
  constructor({ task, category, context } = {}) {
    this.task = task;
    this.category = category;
    this.context = context;
    this.criteria = [];
    this.validations = [];
  }

  /**
   * Generate success criteria from a user request.
   */
  static fromRequest(userInput, context = {}) {
    const classifier = classifyTask(userInput);
    const criteria = new SuccessCriteria({
      task: userInput,
      category: classifier.category,
      context,
    });

    criteria.addBaseCriteria();
    criteria.addCategorySpecificCriteria();

    return criteria;
  }

  /**
   * Add a verifiable criterion.
   */
  add(description, { verification, expected } = {}) {
    this.criteria.push({ description, verification, expected });
    return this;
  }

  /**
   * Add a validation step.
   */
  validate(description, check) {
    this.validations.push({ description, check });
    return this;
  }

  /**
   * Base criteria common to all tasks.
   */
  addBaseCriteria() {
    this.add('Task completed without errors');
    this.add('Existing functionality preserved', {
      verification: 'Run existing tests',
    });
    this.add('No unused imports, variables, or dead code introduced', {
      verification: 'Manual review',
    });
    return this;
  }

  /**
   * Category-specific criteria.
   */
  addCategorySpecificCriteria() {
    switch (this.category) {
      case TASK_CATEGORIES.EDIT:
        this.addEditCriteria();
        break;
      case TASK_CATEGORIES.DEBUG:
        this.addDebugCriteria();
        break;
      case TASK_CATEGORIES.REFACTOR:
        this.addRefactorCriteria();
        break;
      case TASK_CATEGORIES.TEST:
        this.addTestCriteria();
        break;
      case TASK_CATEGORIES.GENERATE:
        this.addGenerateCriteria();
        break;
      case TASK_CATEGORIES.REVIEW:
        this.addReviewCriteria();
        break;
      case TASK_CATEGORIES.SEARCH:
        this.addSearchCriteria();
        break;
      default:
        break;
    }
    return this;
  }

  addEditCriteria() {
    this.add('Changes are minimal and targeted', {
      verification: 'Diff review - only lines related to request changed',
    });
    this.add('Code style matches surrounding code', {
      verification: 'Visual inspection of formatting, naming, patterns',
    });
  }

  addDebugCriteria() {
    this.add('Root cause identified and fixed', {
      verification: 'Write test that reproduces bug, confirm it passes after fix',
    });
    this.add('No regressions introduced', {
      verification: 'Run test suite',
    });
  }

  addRefactorCriteria() {
    this.add('Behavior preserved exactly', {
      verification: 'Tests pass before and after (identical output)',
    });
    this.add('Code is measurably simpler', {
      verification: 'Reduced line count, fewer conditionals, clearer naming',
    });
  }

  addTestCriteria() {
    this.add('Tests cover the requested functionality', {
      verification: 'Run tests - all pass',
    });
    this.add('Tests are deterministic', {
      verification: 'Run 3 times - consistent results',
    });
  }

  addGenerateCriteria() {
    this.add('Generated code follows project conventions', {
      verification: 'Matches patterns in existing files',
    });
    this.add('Code is functional and handles edge cases', {
      verification: 'Run typecheck + tests',
    });
  }

  addReviewCriteria() {
    this.add('All critical issues identified', {
      verification: 'Check: security, performance, correctness, style',
    });
    this.add('Actionable suggestions provided', {
      verification: 'Each issue has a clear fix recommendation',
    });
  }

  addSearchCriteria() {
    this.add('All relevant results found', {
      verification: 'Search terms cover synonyms and related concepts',
    });
    this.add('Results are relevant', {
      verification: 'Each result matches the search intent',
    });
  }

  /**
   * Build a criteria prompt for the AI.
   */
  buildPrompt() {
    const lines = ['## Success Criteria'];

    if (this.criteria.length > 0) {
      lines.push('Verify these outcomes:');
      this.criteria.forEach((c, i) => {
        lines.push(`  ${i + 1}. ${c.description}`);
        if (c.verification) {
          lines.push(`     Verify: ${c.verification}`);
        }
      });
    }

    if (this.validations.length > 0) {
      lines.push('', 'Validation steps:');
      this.validations.forEach((v, i) => {
        lines.push(`  ${i + 1}. ${v.description}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Check if all criteria are met (simplified).
   */
  isComplete() {
    return this.criteria.every(c => c.verified);
  }

  markVerified(description) {
    const criterion = this.criteria.find(c => c.description === description);
    if (criterion) {
      criterion.verified = true;
    }
    return this;
  }

  toJSON() {
    return {
      task: this.task,
      category: this.category,
      criteria: this.criteria,
      validations: this.validations,
    };
  }
}

export default SuccessCriteria;
