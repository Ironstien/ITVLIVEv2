const { StaffAuditLog } = require('../models');
const { isDbConnected } = require('../config/db');

const DEFAULT_LIMIT = 50;

async function logStaffAction({
  actorUserId,
  actorUsername,
  action,
  targetUserId = null,
  targetUsername = null,
  details = null,
}) {
  if (!isDbConnected()) {
    console.warn('[staffAudit] skipped — database not connected', action);
    return null;
  }

  try {
    return await StaffAuditLog.create({
      actorUserId,
      actorUsername,
      action,
      targetUserId: targetUserId || null,
      targetUsername: targetUsername || null,
      details: details || null,
    });
  } catch (err) {
    console.error('[staffAudit] log failed:', err.message);
    return null;
  }
}

async function getRecentStaffAuditLog(limit = DEFAULT_LIMIT, scope = null) {
  if (!isDbConnected()) {
    return { error: 'Database not available' };
  }

  const { MOD_ACTIONS, ADMIN_ACTIONS } = require('../config/permissions');
  const MOD_AUDIT_ACTIONS = [...MOD_ACTIONS, 'timeoutUser', 'kickUser'];
  const ADMIN_AUDIT_ACTIONS = [...ADMIN_ACTIONS];

  const query = {};
  if (scope === 'mod') {
    query.action = { $in: MOD_AUDIT_ACTIONS };
  } else if (scope === 'admin') {
    query.action = { $in: ADMIN_AUDIT_ACTIONS };
  }

  const rows = await StaffAuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(1, limit), 100))
    .lean();

  return {
    ok: true,
    entries: rows.map((row) => ({
      id: String(row._id),
      actorUserId: String(row.actorUserId),
      actorUsername: row.actorUsername,
      action: row.action,
      targetUserId: row.targetUserId ? String(row.targetUserId) : null,
      targetUsername: row.targetUsername || null,
      details: row.details || null,
      createdAt: row.createdAt,
    })),
  };
}

module.exports = {
  logStaffAction,
  getRecentStaffAuditLog,
  DEFAULT_LIMIT,
};
