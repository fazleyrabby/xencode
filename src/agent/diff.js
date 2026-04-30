import { createTwoFilesPatch } from 'diff';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';

export function generateDiff(filePath, newContent) {
  let oldContent = '';
  let fileName = filePath;

  if (existsSync(filePath)) {
    oldContent = readFileSync(filePath, 'utf-8');
  }

  fileName = filePath.split('/').pop();

  const patch = createTwoFilesPatch(
    `a/${fileName}`,
    `b/${fileName}`,
    oldContent,
    newContent,
    '',
    ''
  );

  return patch;
}

export function formatDiff(diffText) {
  const lines = diffText.split('\n');
  const output = [];

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++')) {
      output.push(chalk.dim(line));
    } else if (line.startsWith('+')) {
      output.push(chalk.green(line));
    } else if (line.startsWith('-')) {
      output.push(chalk.red(line));
    } else if (line.startsWith('@@')) {
      output.push(chalk.cyan(line));
    } else {
      output.push(line);
    }
  }

  return output.join('\n');
}

export function generateDiffForPatch(patchResult) {
  const { file, patch } = patchResult;

  if (!patch || !patch.content) {
    return '';
  }

  // If before is empty, this is an insert - show minimal diff
  if (!patch.before) {
    return generateInsertDiff(file, patch.content);
  }

  const diffText = generateDiff(file, patch.content);
  return formatDiff(diffText);
}

function generateInsertDiff(filePath, newMethod) {
  const fileName = filePath.split('/').pop();
  const lines = newMethod.split('\n');

  const header = `--- a/${fileName}\n+++ b/${fileName}`;
  const hunk = `@@ -0,0 +1,${lines.length} @@`;

  const diffLines = [header, hunk];
  for (const line of lines) {
    diffLines.push(chalk.green('+ ' + line));
  }

  return diffLines.join('\n');
}

export function generateFullFileDiff(filePath, newContent) {
  const diffText = generateDiff(filePath, newContent);
  return formatDiff(diffText);
}
