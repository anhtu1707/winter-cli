/**
 * ❄️ STRING REPLACE ALL TOOL ❄️
 * Batch replace all occurrences of a string in a file
 */

import { promises as fs } from 'fs';
import path from 'path';
import { diffLines } from 'diff';

export class StrReplaceAllTool {
  async replaceAll(filePath, oldString, newString) {
    if (!filePath) {
      return { success: false, error: 'file_path is required' };
    }
    if (typeof oldString !== 'string' || oldString === '') {
      return { success: false, error: 'old_string is required' };
    }
    if (typeof newString !== 'string') {
      return { success: false, error: 'new_string is required' };
    }

    try {
      const resolved = path.resolve(filePath);
      const content = await fs.readFile(resolved, 'utf8');

      let count = 0;
      let newContent = content;
      let pos = -1;

      // Count occurrences and replace all
      while ((pos = newContent.indexOf(oldString, pos + 1)) !== -1) {
        count++;
      }
      if (count === 0) {
        return { success: false, error: `old_string not found in file: "${oldString.slice(0, 100)}"`, path: resolved };
      }

      newContent = content.split(oldString).join(newString);

      await fs.writeFile(resolved, newContent, 'utf8');

      const diffOutput = diffLines(content, newContent)
        .filter(part => part.added || part.removed)
        .map(part => {
          const prefix = part.added ? '+ ' : '- ';
          return part.value.split('\n').filter(l => l.trim()).map(l => `${prefix}${l}`).join('\n');
        })
        .filter(Boolean)
        .join('\n');

      return {
        success: true,
        path: resolved,
        replacements: count,
        diff: diffOutput,
      };
    } catch (error) {
      return { success: false, error: error.message, path: filePath };
    }
  }
}
