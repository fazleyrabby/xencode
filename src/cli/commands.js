import chalk from 'chalk';
import { getStats } from '../core/session.js';
import { unpackContext } from '../core/context.js';

export async function handleCommand(session, input) {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'exit':
    case 'quit':
      console.log(chalk.dim('Goodbye!'));
      process.exit(0);
      return false;

    case 'reset':
      const { resetSession } = await import('../core/session.js');
      Object.assign(session, resetSession(session));
      console.log(chalk.green('Session reset. All state cleared.\n'));
      return true;

    case 'stats':
      printStats(session);
      return true;

    case 'files':
      printFiles(session);
      return true;

    case 'plan':
      printPlan(session);
      return true;

    case 'context':
      printContext(session);
      return true;

    case 'debug':
      session.debug = !session.debug;
      console.log(chalk.yellow(`Debug mode: ${session.debug ? 'ON' : 'OFF'}`));
      return true;

    case 'history':
      printHistory(session, args);
      return true;

    case 'memory':
      printMemory(session);
      return true;

    case 'help':
      printHelp();
      return true;

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      console.log(chalk.dim('Type /help for available commands'));
      return true;
  }
}

function printStats(session) {
  const stats = getStats(session);
  
  console.log(chalk.bold('\n📊 Session Stats'));
  console.log(chalk.dim('─'.repeat(30)));
  console.log(`  Session ID: ${chalk.cyan(stats.sessionId)}`);
  console.log(`  Steps:      ${chalk.cyan(stats.steps)}`);
  console.log(`  Success:    ${chalk.cyan(stats.successRate)}`);
  console.log(`  Avg Latency:${chalk.cyan(stats.avgLatency)}`);
  console.log(`  Working:    ${chalk.cyan(stats.workingFiles)} files`);
  console.log(`  Uptime:     ${chalk.cyan(stats.uptime)}`);
  console.log();
}

function printFiles(session) {
  console.log(chalk.bold('\n📁 Working Files'));
  console.log(chalk.dim('─'.repeat(30)));
  
  if (session.workingFiles.size === 0) {
    console.log(chalk.dim('  No files modified yet'));
  } else {
    for (const file of session.workingFiles) {
      console.log(`  ${chalk.green('●')} ${file}`);
    }
  }
  console.log();
}

function printPlan(session) {
  console.log(chalk.bold('\n📋 Last Plan'));
  console.log(chalk.dim('─'.repeat(30)));
  
  if (!session.lastPlan) {
    console.log(chalk.dim('  No plan generated yet'));
  } else {
    console.log(chalk.cyan(JSON.stringify(session.lastPlan, null, 2)));
  }
  console.log();
}

function printContext(session) {
  console.log(chalk.bold('\n📝 Current Context'));
  console.log(chalk.dim('─'.repeat(30)));
  
  if (!session.lastContext) {
    console.log(chalk.dim('  No context available'));
  } else {
    const preview = session.lastContext.slice(0, 500);
    console.log(chalk.dim(preview + (session.lastContext.length > 500 ? '...' : '')));
  }
  console.log();
}

function printHistory(session, args) {
  console.log(chalk.bold('\n📜 History'));
  console.log(chalk.dim('─'.repeat(30)));
  
  const limit = parseInt(args[0]) || 10;
  const history = session.history.slice(-limit);
  
  if (history.length === 0) {
    console.log(chalk.dim('  No history yet'));
  } else {
    history.forEach((entry, i) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const action = entry.action || entry.type || 'unknown';
      console.log(`  ${chalk.dim(time)} ${chalk.white(action)}`);
      if (entry.input) {
        console.log(chalk.dim(`    ${entry.input.slice(0, 60)}...`));
      }
    });
  }
  console.log();
}

function printMemory(session) {
  console.log(chalk.bold('\n🧠 Session Memory'));
  console.log(chalk.dim('─'.repeat(30)));
  
  const conventions = session.memory.conventions || {};
  const patterns = session.memory.patterns || [];
  
  if (Object.keys(conventions).length === 0 && patterns.length === 0) {
    console.log(chalk.dim('  No memory stored yet'));
  } else {
    if (Object.keys(conventions).length > 0) {
      console.log(chalk.bold('\n  Conventions:'));
      for (const [key, value] of Object.entries(conventions)) {
        console.log(`    ${key}: ${value}`);
      }
    }
    if (patterns.length > 0) {
      console.log(chalk.bold('\n  Patterns:'));
      for (const pattern of patterns) {
        console.log(`    - ${pattern}`);
      }
    }
  }
  console.log();
}

function printHelp() {
  console.log(chalk.bold('\n🔧 Available Commands'));
  console.log(chalk.dim('─'.repeat(30)));
  console.log('  /exit      Quit the session');
  console.log('  /reset     Reset session state');
  console.log('  /stats     Show session statistics');
  console.log('  /files     List working files');
  console.log('  /plan      Show last plan');
  console.log('  /context   Show current context');
  console.log('  /history   Show recent history');
  console.log('  /memory    Show session memory');
  console.log('  /debug     Toggle debug mode');
  console.log('  /help      Show this help');
  console.log();
}