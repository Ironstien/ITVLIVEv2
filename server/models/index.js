/**
 * Register all Mongoose models. Safe to require before connectDB().
 */
require('./User');
require('./Playlist');
require('./PlaylistItem');
require('./Song');
require('./PlaySession');
require('./Vote');
require('./XpTransaction');
require('./StaffAuditLog');
require('./BlockedVideo');
require('./PlatformSettings');

module.exports = {
  User: require('./User'),
  Playlist: require('./Playlist'),
  PlaylistItem: require('./PlaylistItem'),
  Song: require('./Song'),
  PlaySession: require('./PlaySession'),
  Vote: require('./Vote'),
  XpTransaction: require('./XpTransaction'),
  StaffAuditLog: require('./StaffAuditLog'),
  BlockedVideo: require('./BlockedVideo'),
  PlatformSettings: require('./PlatformSettings'),
};
