const mongoose = require('mongoose');

let connected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[db] MONGODB_URI not set — running without database');
    return false;
  }

  try {
    await mongoose.connect(uri);
    connected = true;
    console.log('[db] Connected');
    return true;
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    return false;
  }
}

function isDbConnected() {
  return connected && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDbConnected };
