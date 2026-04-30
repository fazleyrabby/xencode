import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { dirname } from 'path';

export async function validate(code, filePath) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (!code || code.trim().length === 0) {
    result.valid = false;
    result.errors.push('Empty code provided');
    return result;
  }

  const isPHP = filePath.endsWith('.php');
  
  if (isPHP) {
    const phpResult = validatePHP(code);
    if (!phpResult.valid) {
      result.valid = false;
      result.errors.push(...phpResult.errors);
    }
    result.warnings.push(...phpResult.warnings);
  }

  const patternIssues = checkPatterns(code, filePath);
  result.warnings.push(...patternIssues);

  return result;
}

function validatePHP(code) {
  const result = { valid: true, errors: [], warnings: [] };
  
  let tempFile;
  try {
    tempFile = `/tmp/xencode_validate_${Date.now()}.php`;
    writeFileSync(tempFile, code, 'utf-8');
    execSync(`php -l ${tempFile}`, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (err) {
    result.valid = false;
    const errorMsg = String(err.output || err.message || '');
    const match = errorMsg.match(/PHP Parse error.*on line \d+/);
    result.errors.push(match ? match[0] : 'PHP syntax error');
  } finally {
    if (tempFile && existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
  
  return result;
}

function checkPatterns(code, filePath) {
  const warnings = [];
  
  const duplicates = findDuplicateMethods(code);
  if (duplicates.length > 0) {
    warnings.push(`Duplicate method names found: ${duplicates.join(', ')}`);
  }
  
  const missingImports = checkMissingImports(code, filePath);
  if (missingImports.length > 0) {
    warnings.push(`Possible missing imports: ${missingImports.join(', ')}`);
  }
  
  const invalidPatterns = [
    { pattern: /\bvar\s+\$/, message: 'Use private/public/protected instead of var' },
    { pattern: /\bmysql_\w+\(/, message: 'Use PDO or Query Builder instead of mysql_* functions' },
    { pattern: /@\(.*\)/, message: 'Suspicious eval-like pattern' }
  ];
  
  for (const { pattern, message } of invalidPatterns) {
    if (pattern.test(code)) {
      warnings.push(message);
    }
  }
  
  return warnings;
}

function findDuplicateMethods(code) {
  const methodRegex = /(?:public|private|protected)\s+(?:static\s+)?function\s+(\w+)\s*\(/g;
  const methods = [];
  const duplicates = [];
  let match;
  
  while ((match = methodRegex.exec(code)) !== null) {
    const name = match[1];
    if (methods.includes(name) && !duplicates.includes(name)) {
      duplicates.push(name);
    }
    methods.push(name);
  }
  
  return duplicates;
}

function checkMissingImports(code, filePath) {
  const missing = [];
  
  if (!filePath.endsWith('.php')) return missing;
  
  const usedClasses = [];
  const classUsageRegex = /\b([A-Z][a-zA-Z0-9_]+)::/g;
  let match;
  while ((match = classUsageRegex.exec(code)) !== null) {
    usedClasses.push(match[1]);
  }
  
  const importRegex = /use\s+([A-Z][a-zA-Z0-9_\\]+)/g;
  const imports = [];
  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[1].split('\\').pop());
  }
  
  const commonLaravel = ['Model', 'Controller', 'Request', 'Response', 'Validator', 'DB', 'Log'];
  for (const cls of usedClasses) {
    if (!imports.includes(cls) && !commonLaravel.includes(cls)) {
      missing.push(cls);
    }
  }
  
  return missing;
}