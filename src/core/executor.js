import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MAX_OUTPUT = 2000;

export async function runCommand(command, options = {}) {
  const { timeout = 30000, cwd = process.cwd() } = options;
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });

    const duration = Date.now() - startTime;
    const truncated = truncate(stdout + '\n' + stderr, MAX_OUTPUT);

    return {
      success: true,
      command,
      stdout: truncated.stdout,
      stderr: truncated.stderr,
      fullOutput: stdout + '\n' + stderr,
      truncated: truncated.wasTruncated,
      duration
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    const output = (err.stdout || '') + '\n' + (err.stderr || err.message || '');
    const truncated = truncate(output, MAX_OUTPUT);

    const exitCode = err.status || 1;
    const signal = err.signal;

    return {
      success: false,
      command,
      stdout: truncated.stdout,
      stderr: truncated.stderr,
      fullOutput: output,
      truncated: truncated.wasTruncated,
      duration,
      exitCode,
      signal,
      error: err.message
    };
  }
}

function truncate(output, max) {
  if (output.length <= max) {
    return { stdout: output, stderr: '', wasTruncated: false };
  }
  return {
    stdout: output.slice(0, max) + '\n... (truncated)',
    stderr: '',
    wasTruncated: true
  };
}

export function detectErrorPatterns(output) {
  const errors = [];

  const patterns = [
    { regex: /Parse error|syntax error/i, type: 'SYNTAX_ERROR', severity: 'HIGH' },
    { regex: /Fatal error:|Error:/i, type: 'FATAL_ERROR', severity: 'HIGH' },
    { regex: /Exception|exception/i, type: 'EXCEPTION', severity: 'MEDIUM' },
    { regex: /Warning:|warn/i, type: 'WARNING', severity: 'LOW' },
    { regex: /failed|FAILED/i, type: 'FAILED', severity: 'MEDIUM' },
    { regex: /Error not found|not defined/i, type: 'UNDEFINED', severity: 'MEDIUM' },
    { regex: /Class .* not found/i, type: 'MISSING_CLASS', severity: 'HIGH' },
    { regex: /Method .* not found/i, type: 'MISSING_METHOD', severity: 'MEDIUM' },
    { regex: /Argument \d+ expected/i, type: 'WRONG_ARGS', severity: 'MEDIUM' },
    { regex: /connection refused|ECONNREFUSED/i, type: 'CONNECTION', severity: 'HIGH' },
    { regex: /permission denied|EACCES/i, type: 'PERMISSION', severity: 'HIGH' },
    { regex: /no such file|DOES NOT EXIST/i, type: 'FILE_NOT_FOUND', severity: 'HIGH' }
  ];

  for (const { regex, type, severity } of patterns) {
    const match = output.match(regex);
    if (match) {
      errors.push({
        type,
        severity,
        message: match[0],
        context: extractContext(output, match.index, 100)
      });
    }
  }

  return errors;
}

function extractContext(output, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(output.length, index + radius);
  return output.slice(start, end);
}

export function parseErrorForLlm(errors) {
  if (errors.length === 0) return 'No errors detected.';

  return errors.map(e => `[${e.severity}] ${e.type}: ${e.message}`).join('\n');
}
