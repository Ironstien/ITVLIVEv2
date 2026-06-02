const { isJwtConfigured } = require('../lib/jwt');

const DEFAULT_JWT_SECRET = 'change-me-to-a-long-random-secret';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getProductionEnvIssues() {
  if (!isProduction()) return [];

  const issues = [];

  if (!process.env.MONGODB_URI?.trim()) {
    issues.push('MONGODB_URI is required in production');
  }

  if (!isJwtConfigured()) {
    issues.push('JWT_SECRET is required in production');
  } else if (String(process.env.JWT_SECRET).trim() === DEFAULT_JWT_SECRET) {
    issues.push('JWT_SECRET must not use the default placeholder in production');
  }

  return issues;
}

function validateProductionEnv() {
  const issues = getProductionEnvIssues();
  if (!issues.length) return;

  console.error('[env] Production configuration errors:');
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  process.exit(1);
}

function getHealthStatus() {
  const production = isProduction();
  const db = require('./db').isDbConnected();
  const jwt = isJwtConfigured();
  const jwtPlaceholder =
    jwt && String(process.env.JWT_SECRET).trim() === DEFAULT_JWT_SECRET;

  const ready = !production || (db && jwt && !jwtPlaceholder);

  return {
    ready,
    production,
    db,
    jwt,
    jwtPlaceholder,
  };
}

module.exports = {
  DEFAULT_JWT_SECRET,
  isProduction,
  getProductionEnvIssues,
  validateProductionEnv,
  getHealthStatus,
};
