const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', '..', 'data');
const REPORTS_FILE = path.join(REPORTS_DIR, 'bug-reports.jsonl');

const MAX_DESCRIPTION_LEN = 2000;
const MAX_STEPS_LEN = 4000;

async function ensureReportsDir() {
  await fsp.mkdir(REPORTS_DIR, { recursive: true });
}

function countLinesInFile(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return 0;
  return content.trim().split('\n').filter(Boolean).length;
}

async function appendBugReport(payload) {
  const description = String(payload.description || '').trim();
  if (!description) {
    return { error: 'Description is required' };
  }
  if (description.length > MAX_DESCRIPTION_LEN) {
    return { error: `Description must be at most ${MAX_DESCRIPTION_LEN} characters` };
  }

  const steps = String(payload.steps || '').trim().slice(0, MAX_STEPS_LEN);

  const entry = {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `br-${Date.now()}`,
    at: new Date().toISOString(),
    description,
    steps: steps || null,
    pageUrl: String(payload.pageUrl || '').trim().slice(0, 500) || null,
    userAgent: String(payload.userAgent || '').trim().slice(0, 500) || null,
    userId: payload.userId ? String(payload.userId) : null,
    username: payload.username ? String(payload.username).trim().slice(0, 24) : null,
    email: payload.email ? String(payload.email).trim().slice(0, 200) : null,
  };

  await ensureReportsDir();
  await fsp.appendFile(REPORTS_FILE, `${JSON.stringify(entry)}\n`, 'utf8');

  return { ok: true, id: entry.id };
}

function getReportsMeta() {
  return {
    ok: true,
    count: countLinesInFile(REPORTS_FILE),
    filePath: 'data/bug-reports.jsonl',
  };
}

function getReportsFilePath() {
  if (!fs.existsSync(REPORTS_FILE)) return null;
  return REPORTS_FILE;
}

module.exports = {
  REPORTS_FILE,
  appendBugReport,
  getReportsMeta,
  getReportsFilePath,
  MAX_DESCRIPTION_LEN,
};
