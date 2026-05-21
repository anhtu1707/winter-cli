/**
 * ❄ INSERT TEXT TOOL ❄
 * Insert text at a specific line or position in a file
 */

import { promises as fs } from 'fs';
import path from 'path';
import { diffLines } from 'diff';

export class InsertTextTool {
  async insert(filePath, insertData, options = {}) {
    if (!filePath) {
      return { success: false, error: 'file_path is required' };
    }
    if (!insertData || typeof insertData !== 'string') {
      return { success: false, error: 'insert_text is required' };
    }

    try {
      const resolved = path.resolve(filePath);
      const content = await fs.readFile(resolved, 'utf8');
      const lines = content.split('\n');
      const insertLines = insertData.split('\n');
      let newContent;

      // Support different insertion modes
      const mode = options.mode || 'line';
      const position = (options.position !== undefined) ? options.position : (options.line !== undefined ? options.line : options.at);

      if (mode === 'line' && position !== undefined) {
        // Insert at specific line number (0-based, or 1-based if specified)
        const isOneBased = options.lineBased !== false;
        const lineIndex = isOneBased ? Math.max(0, parseInt(position, 10) - 1) : parseInt(position, 10);

        if (lineIndex < 0 || lineIndex > lines.length) {
          return {
            success: false,
            error: `Line position out of range: ${position}. File has ${lines.length} lines (${isOneBased ? '1-based' : '0-based'})`,
          };
        }

        lines.splice(lineIndex, 0, ...insertLines);
        newContent = lines.join('\n');
      } else if (mode === 'after' && position !== undefined) {
        // Insert after the first line containing the search text
        const searchIndex = lines.findIndex(l => l.includes(position));
        if (searchIndex === -1) {
          return { success: false, error: `Search text not found in file: "${position}"` };
        }
        lines.splice(searchIndex + 1, 0, ...insertLines);
        newContent = lines.join('\n');
      } else if (mode === 'before' && position !== undefined) {
        // Insert before the first line containing the search text
        const searchIndex = lines.findIndex(l => l.includes(position));
        if (searchIndex === -1) {
          return { success: false, error: `Search text not found in file: "${position}"` };
        }
        lines.splice(searchIndex, 0, ...insertLines);
        newContent = lines.join('\n');
      } else if (mode === 'end' || position === 'end') {
        // Append to end of file
        const trailingNewline = content.endsWith('\n') ? '' : '\n';
        newContent = content + trailingNewline + insertData;
      } else if (mode === 'beginning' || position === 'beginning') {
        // Insert at beginning of file
        newContent = insertData + '\n' + content;
      } else {
        return {
          success: false,
          error: 'Invalid insertion mode or position. Use mode: "line" (with line number), "after"/"before" (with search text), "end", or "beginning".',
        };
      }

      await fs.writeFile(resolved, newContent, 'utf8');

      const diffOutput = diffLines(content, newContent)
        .filter(part => part.added)
        .map(part => part.value.split('\n').filter(l => l.trim()).join('\n'))
        .filter(Boolean)
        .join('\n');

      return {
        success: true,
        path: resolved,
        mode,
        linesInserted: insertLines.length,
        diff: diffOutput,
      };
    } catch (error) {
      return { success: false, error: error.message, path: filePath };
    }
  }
}
