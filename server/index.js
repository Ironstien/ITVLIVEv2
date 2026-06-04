require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { connectDB } = require('./config/db');
const { validateProductionEnv, getHealthStatus } = require('./config/env');
const { registerSockets, room } = require('./sockets');
const { isTestDjEnabled, TEST_DJ_DISPLAY_NAME } = require('./config/testDj');
const { loadPlatformState } = require('./services/platform');
const { migrateLegacyStaffRoles } = require('./services/staff');
const { migrateLegacyPlaylistItemIndexes } = require('./services/playlist');
const { ensureFounderAdminsInDb } = require('./config/founderAdmins');

validateProductionEnv();

const PHASE = 8;
if (process.env.MONGODB_URI) {
  require('./models');
}

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`;

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlists');
const songRoutes = require('./routes/songs');
const adminRoutes = require('./routes/admin');
const helpRoutes = require('./routes/help');
const usersRoutes = require('./routes/users');
const badgesRoutes = require('./routes/badges');
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/help', helpRoutes);

app.get('/health', (_req, res) => {
  const status = getHealthStatus();
  res.status(status.ready ? 200 : 503).json({
    ok: status.ready,
    name: 'INTO THE VOID',
    version: '2.1.2',
    phase: PHASE,
    db: status.db,
    jwt: status.jwt,
    production: status.production,
    online: room.countRealOnlineUsers(),
    nowPlaying: room.nowPlaying?.videoId || null,
    testDj: isTestDjEnabled(),
    testDjName: isTestDjEnabled() ? TEST_DJ_DISPLAY_NAME : null,
  });
});

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/queue-track', async (req, res) => {
    try {
      const result = await room.injectDevTrack(req.body || {});
      if (result.error) {
        res.status(400).json(result);
        return;
      }
      const io = req.app.get('io');
      if (io && result.started) {
        io.emit('player:sync', room.getPlayerSync());
        io.emit('room:state', room.getRoomState());
      } else if (io) {
        io.emit('room:state', room.getRoomState());
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to queue track' });
    }
  });
}

app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

registerSockets(io);
app.set('io', io);

async function start() {
  await connectDB();
  await migrateLegacyPlaylistItemIndexes();
  await migrateLegacyStaffRoles();
  await ensureFounderAdminsInDb();
  await loadPlatformState();

  server.listen(PORT, () => {
    console.log(`[itvlive-v2] http://localhost:${PORT}`);
    console.log(`[itvlive-v2] health http://localhost:${PORT}/health`);
    if (room.nowPlaying) {
      io.emit('player:sync', room.getPlayerSync());
      io.emit('room:state', room.getRoomState());
    }
  });
}

start().catch((err) => {
  console.error('[itvlive-v2] failed to start:', err);
  process.exit(1);
});
