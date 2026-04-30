export function createSession() {
  return {
    id: crypto.randomUUID(),
    history: [],
    lastPlan: null,
    lastContext: null,
    lastResult: null,
    workingFiles: new Set(),
    memory: {
      conventions: {},
      patterns: []
    },
    stats: {
      steps: 0,
      tokens: 0,
      latency: 0,
      successful: 0
    },
    debug: false,
    startedAt: Date.now()
  };
}

export function resetSession(session) {
  return {
    ...createSession(),
    id: session.id,
    startedAt: session.startedAt
  };
}

export function recordStep(session, step) {
  session.history.push({
    ...step,
    timestamp: Date.now()
  });
  session.stats.steps++;
  if (step.latency) {
    session.stats.latency += step.latency;
  }
}

export function recordSuccess(session) {
  session.stats.successful++;
}

export function addWorkingFile(session, filePath) {
  session.workingFiles.add(filePath);
}

export function updateMemory(session, key, value) {
  const keys = key.split('.');
  let current = session.memory;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export function getSuccessRate(session) {
  if (session.stats.steps === 0) return 0;
  return session.stats.successful / session.stats.steps;
}

export function getStats(session) {
  return {
    sessionId: session.id.slice(0, 8),
    steps: session.stats.steps,
    successRate: Math.round(getSuccessRate(session) * 100) + '%',
    workingFiles: session.workingFiles.size,
    avgLatency: session.stats.steps > 0 ? Math.round(session.stats.latency / session.stats.steps) + 'ms' : '0ms',
    uptime: formatDuration(Date.now() - session.startedAt)
  };
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}