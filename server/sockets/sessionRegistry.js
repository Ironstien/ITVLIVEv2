/**
 * One active socket per authenticated userId.
 * A new connection replaces (disconnects) the previous tab.
 */
class SessionRegistry {
  constructor() {
    /** @type {Map<string, string>} userId → socketId */
    this.byUserId = new Map();
  }

  claim(io, userId, socket) {
    const id = String(userId);
    const prevSocketId = this.byUserId.get(id);
    if (prevSocketId && prevSocketId !== socket.id) {
      const prev = io.sockets.sockets.get(prevSocketId);
      if (prev) {
        prev.emit('session:replaced', {
          message: 'Your account connected from another tab or browser.',
        });
        prev.disconnect(true);
      }
    }
    this.byUserId.set(id, socket.id);
  }

  release(userId, socketId) {
    const id = String(userId);
    if (this.byUserId.get(id) === socketId) {
      this.byUserId.delete(id);
    }
  }

  getSocketsForUser(userId) {
    const sid = this.byUserId.get(String(userId));
    return sid ? [sid] : [];
  }

  getConnectedUserIds() {
    return [...this.byUserId.keys()];
  }

  forceDisconnect(io, userId, message = 'Disconnected by staff.') {
    const id = String(userId);
    const sid = this.byUserId.get(id);
    if (!sid) return false;
    const sock = io.sockets.sockets.get(sid);
    if (sock) {
      sock.emit('session:replaced', { message });
      sock.disconnect(true);
    }
    if (this.byUserId.get(id) === sid) {
      this.byUserId.delete(id);
    }
    return true;
  }
}

module.exports = { SessionRegistry };
