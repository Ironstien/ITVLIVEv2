/**
 * In-memory ring buffer for server console output (founder download).
 * Installed once at process start; logs survive until the process restarts.
 */

const MAX_ENTRIES = Number(process.env.SERVER_LOG_MAX_ENTRIES) || 5000;

/** @type {{ ts: number, level: string, message: string }[]} */
const entries = [];
let droppedCount = 0;
let startedAt = Date.now();
let installed = false;

const originals = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function formatArg(value) {
  if (value == null) return String(value);
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMessage(args) {
  return args.map(formatArg).join(' ');
}

function pushEntry(level, args) {
  const message = formatMessage(args);
  if (entries.length >= MAX_ENTRIES) {
    entries.shift();
    droppedCount += 1;
  }
  entries.push({
    ts: Date.now(),
    level,
    message,
  });
}

function wrap(level, original) {
  return (...args) => {
    pushEntry(level, args);
    original(...args);
  };
}

function install() {
  if (installed) return;
  installed = true;
  startedAt = Date.now();
  console.log = wrap('log', originals.log);
  console.warn = wrap('warn', originals.warn);
  console.error = wrap('error', originals.error);

  process.on('uncaughtException', (err) => {
    pushEntry('error', ['[uncaughtException]', err]);
  });
  process.on('unhandledRejection', (reason) => {
    pushEntry('error', ['[unhandledRejection]', reason]);
  });
}

function formatTimestamp(ts) {
  return new Date(ts).toISOString();
}

function getMeta() {
  const bytes = entries.reduce((n, e) => n + e.message.length + 32, 0);
  return {
    count: entries.length,
    maxEntries: MAX_ENTRIES,
    droppedCount,
    startedAt,
    approxBytes: bytes,
    installed,
  };
}

function getRecent(limit = 50) {
  const n = Math.max(1, Math.min(Number(limit) || 50, 500));
  return entries.slice(-n).map((e) => ({
    ts: e.ts,
    level: e.level,
    message: e.message,
  }));
}

function exportText() {
  const meta = getMeta();
  const header = [
    'ITVLive v2 — server log export',
    `Exported: ${formatTimestamp(Date.now())}`,
    `Buffer started: ${formatTimestamp(meta.startedAt)}`,
    `Entries: ${meta.count}${meta.droppedCount ? ` (${meta.droppedCount} older entries dropped)` : ''}`,
    `Max buffer: ${meta.maxEntries} lines`,
    '',
    '---',
    '',
  ].join('\n');

  const body = entries
    .map((e) => `${formatTimestamp(e.ts)} [${e.level.toUpperCase()}] ${e.message}`)
    .join('\n');

  return `${header}${body}${body ? '\n' : ''}`;
}

function clear() {
  entries.length = 0;
  droppedCount = 0;
  startedAt = Date.now();
}

module.exports = {
  install,
  getMeta,
  getRecent,
  exportText,
  clear,
};
