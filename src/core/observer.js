import { detectErrorPatterns, parseErrorForLlm } from './executor.js';

export async function observe(result) {
  const { success, stdout, stderr, fullOutput, command, truncated } = result;

  const errors = detectErrorPatterns(fullOutput);
  const structured = extractStructuredErrors(errors, fullOutput);

  const observations = {
    success,
    errorCount: errors.length,
    errors,
    structured,
    errorSummary: parseErrorForLlm(errors),
    hasErrors: errors.length > 0,
    truncated,
    command,
    verdict: 'PASS',
    message: 'Execution completed successfully',
    suggestion: null
  };

  if (!success && errors.length > 0) {
    observations.verdict = 'FAIL';
    observations.message = `${structured.length} error(s) detected`;
    observations.suggestion = suggestFix(structured, command);
  } else if (success) {
    observations.verdict = 'PASS';
    observations.message = 'Execution successful';
  }

  return observations;
}

function extractStructuredErrors(errors, rawOutput) {
  return errors.map(err => {
    const structured = {
      type: err.type,
      severity: err.severity,
      message: err.message,
      file: null,
      line: null
    };

    // Extract file path
    const fileMatch = rawOutput.match(/in\s+([\/\w\-\.]+\.(?:php|js|ts|vue))+/i);
    if (fileMatch) {
      structured.file = fileMatch[1];
    }

    // Extract line number
    const lineMatch = rawOutput.match(/on\s+line\s+(\d+)/i) || rawOutput.match(/:\s*(\d+)\s*/);
    if (lineMatch) {
      structured.line = parseInt(lineMatch[1], 10);
    }

    return structured;
  });
}

function suggestFix(structured, command) {
  const errorTypes = structured.map(e => e.type);
  const errorFile = structured.find(e => e.file)?.file;

  if (errorTypes.includes('SYNTAX_ERROR')) {
    return 'Fix PHP syntax errors. Check missing brackets, semicolons, typos.';
  }

  if (errorTypes.includes('MISSING_CLASS')) {
    const cls = structured.find(e => e.type === 'MISSING_CLASS')?.message.match(/Class (\S+)/)?.[1];
    if (cls) {
      return `Class "${cls}" not found. Check imports or run composer dump-autoload.`;
    }
    return 'Missing class. Check imports or run composer dump-autoload.';
  }

  if (errorTypes.includes('UNDEFINED')) {
    return 'Undefined variable/function. Check spelling or file inclusion.';
  }

  if (errorTypes.includes('CONNECTION')) {
    return 'Connection refused. Start server with php artisan serve.';
  }

  if (errorTypes.includes('FILE_NOT_FOUND') && errorFile) {
    return `File "${errorFile}" not found. Verify path exists.`;
  }

  return `Review errors from: ${command}`;
}

export function formatObservations(observations) {
  const lines = [];

  lines.push(`Verdict: ${observations.verdict}`);
  lines.push(`Message: ${observations.message}`);

  if (observations.structured.length > 0) {
    lines.push('\nErrors:');
    for (const err of observations.structured) {
      lines.push(`  [${err.severity}] ${err.type}`);
      if (err.file) lines.push(`    File: ${err.file}`);
      if (err.line) lines.push(`    Line: ${err.line}`);
      lines.push(`    ${err.message}`);
    }
  }

  if (observations.suggestion) {
    lines.push(`\nSuggestion: ${observations.suggestion}`);
  }

  return lines.join('\n');
}

export function buildFixContext(observations) {
  // Build structured context for LLM to fix errors
  if (!observations.hasErrors) {
    return 'No errors to fix.';
  }

  const parts = observations.structured.map(err => {
    let part = `ERROR: ${err.type} — ${err.message}`;
    if (err.file) part += `\nFile: ${err.file}`;
    if (err.line) part += `\nLine: ${err.line}`;
    return part;
  });

  return parts.join('\n\n');
}
