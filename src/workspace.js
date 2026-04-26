import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const WORKSPACE_DIR = join(PROJECT_ROOT, '.xencode');
const PROJECTS_DIR = join(WORKSPACE_DIR, 'projects');
const CURRENT_FILE = join(WORKSPACE_DIR, 'current_project.json');

export function getWorkspaceDir() {
  return WORKSPACE_DIR;
}

export function getProjectDir(projectId) {
  return join(PROJECTS_DIR, projectId);
}

export function getProjectDbPath(projectId) {
  return join(getProjectDir(projectId), 'index.db');
}

function hashPath(path) {
  return createHash('sha256').update(path).digest('hex').substring(0, 16);
}

function getProjectId(path) {
  const resolved = path.startsWith('/') ? path : join(process.cwd(), path);
  const name = basename(resolved);
  const hash = hashPath(resolved);
  return `${name}-${hash}`;
}

function ensureWorkspace() {
  if (!existsSync(WORKSPACE_DIR)) {
    mkdirSync(WORKSPACE_DIR, { recursive: true });
  }
  if (!existsSync(PROJECTS_DIR)) {
    mkdirSync(PROJECTS_DIR, { recursive: true });
  }
}

function readCurrentProject() {
  if (!existsSync(CURRENT_FILE)) {
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(CURRENT_FILE, 'utf-8'));
    return data.project_id || null;
  } catch {
    return null;
  }
}

function writeCurrentProject(projectId) {
  ensureWorkspace();
  writeFileSync(CURRENT_FILE, JSON.stringify({ project_id: projectId }, null, 2), 'utf-8');
}

function readProjectMeta(projectId) {
  const metaPath = join(getProjectDir(projectId), 'meta.json');
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeProjectMeta(projectId, meta) {
  const projectDir = getProjectDir(projectId);
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }
  writeFileSync(join(projectDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

export function registerProject(path) {
  const resolved = path.startsWith('/') ? path : join(process.cwd(), path);
  const projectId = getProjectId(resolved);
  const projectName = basename(resolved);

  ensureWorkspace();

  const projectDir = getProjectDir(projectId);
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }

  writeProjectMeta(projectId, {
    name: projectName,
    path: resolved,
    indexed_at: null,
    chunk_count: 0,
    created_at: Date.now()
  });

  return projectId;
}

export function setCurrentProject(projectId) {
  const projectDir = getProjectDir(projectId);
  if (!existsSync(projectDir)) {
    throw new Error(`Project "${projectId}" not found. Index it first.`);
  }
  writeCurrentProject(projectId);
  return projectId;
}

export function getCurrentProject() {
  const projectId = readCurrentProject();
  if (!projectId) {
    return null;
  }
  const meta = readProjectMeta(projectId);
  if (!meta) {
    return null;
  }
  return { id: projectId, ...meta };
}

export function autoDetectProject(cwd) {
  const resolved = cwd || process.cwd();
  const projectId = getProjectId(resolved);

  if (existsSync(getProjectDir(projectId))) {
    const meta = readProjectMeta(projectId);
    if (meta) {
      writeCurrentProject(projectId);
      return { id: projectId, ...meta };
    }
  }

  const projects = listProjects();
  for (const project of projects) {
    if (resolved === project.path || resolved.startsWith(project.path + '/')) {
      writeCurrentProject(project.id);
      return project;
    }
  }

  return null;
}

export function listProjects() {
  ensureWorkspace();
  if (!existsSync(PROJECTS_DIR)) {
    return [];
  }

  const currentId = readCurrentProject();
  const entries = readdirSync(PROJECTS_DIR);
  const projects = [];

  for (const entry of entries) {
    const projectDir = join(PROJECTS_DIR, entry);
    if (!existsSync(join(projectDir, 'meta.json'))) {
      continue;
    }
    const meta = readProjectMeta(entry);
    if (!meta) {
      continue;
    }
    projects.push({
      id: entry,
      ...meta,
      isCurrent: entry === currentId
    });
  }

  return projects;
}

export function updateProjectMeta(projectId, updates) {
  const meta = readProjectMeta(projectId);
  if (!meta) {
    return;
  }
  writeProjectMeta(projectId, { ...meta, ...updates });
}

export function resolveProjectDb() {
  let project = getCurrentProject();

  if (!project) {
    project = autoDetectProject();
  }

  if (!project) {
    return null;
  }

  const dbPath = getProjectDbPath(project.id);
  if (!existsSync(dbPath)) {
    return null;
  }

  return { projectId: project.id, dbPath, meta: project };
}
