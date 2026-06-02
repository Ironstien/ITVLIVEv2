/**
 * Achievement badge definitions (launch set: tiers 1–3 subset).
 * IDs stored on user.badges — never rename once live.
 */

const LAUNCH_BADGE_IDS = [
  'account_created',
  'first_listen',
  'first_vote',
  'first_dj_play',
  'first_playlist',
  'queue_joined',
  'listener_10',
  'listener_50',
  'voter_10',
  'voter_50',
  'dj_5',
  'dj_25',
  'level_5',
  'level_10',
  'playlist_25_tracks',
  'two_playlists',
  'listener_200',
  'dj_50',
  'level_20',
  'level_30',
  'avg_score_70',
  'avg_score_85',
];

/** @type {{ id: string, name: string, tier: number, image: string, description: string }[]} */
const BADGE_DEFINITIONS = [
  {
    id: 'account_created',
    name: 'Crossed the Threshold',
    tier: 1,
    image: '/img/badges/account_created.png',
    description: 'Created an ITV account',
  },
  {
    id: 'first_listen',
    name: 'In the Pit',
    tier: 1,
    image: '/img/badges/first_listen.png',
    description: 'Listened through a track on the Main Stage',
  },
  {
    id: 'first_vote',
    name: 'Voice in the Void',
    tier: 1,
    image: '/img/badges/first_vote.png',
    description: 'Cast your first vote',
  },
  {
    id: 'first_dj_play',
    name: 'On the Decks',
    tier: 1,
    image: '/img/badges/first_dj_play.png',
    description: 'Played your first track as DJ',
  },
  {
    id: 'first_playlist',
    name: 'Crate Started',
    tier: 1,
    image: '/img/badges/first_playlist.png',
    description: 'Added tracks to a personal playlist',
  },
  {
    id: 'queue_joined',
    name: 'Queued Up',
    tier: 1,
    image: '/img/badges/queue_joined.png',
    description: 'Joined the DJ queue',
  },
  {
    id: 'listener_10',
    name: 'Pit Regular',
    tier: 2,
    image: '/img/badges/listener_10.png',
    description: 'Listened to 10 tracks',
  },
  {
    id: 'listener_50',
    name: 'Void Drifter',
    tier: 2,
    image: '/img/badges/listener_50.png',
    description: 'Listened to 50 tracks',
  },
  {
    id: 'voter_10',
    name: 'Scorekeeper',
    tier: 2,
    image: '/img/badges/voter_10.png',
    description: 'Cast 10 votes',
  },
  {
    id: 'voter_50',
    name: 'Jury of One',
    tier: 2,
    image: '/img/badges/voter_50.png',
    description: 'Cast 50 votes',
  },
  {
    id: 'dj_5',
    name: 'Rotation Rookie',
    tier: 2,
    image: '/img/badges/dj_5.png',
    description: 'DJ\'d 5 tracks',
  },
  {
    id: 'dj_25',
    name: 'Booth Hand',
    tier: 2,
    image: '/img/badges/dj_25.png',
    description: 'DJ\'d 25 tracks',
  },
  {
    id: 'level_5',
    name: 'Novice Complete',
    tier: 2,
    image: '/img/badges/level_5.png',
    description: 'Reached level 5',
  },
  {
    id: 'level_10',
    name: 'Regular',
    tier: 2,
    image: '/img/badges/level_10.png',
    description: 'Reached level 10',
  },
  {
    id: 'playlist_25_tracks',
    name: 'Deep Crate',
    tier: 2,
    image: '/img/badges/playlist_25_tracks.png',
    description: 'Built a playlist with 25+ tracks',
  },
  {
    id: 'two_playlists',
    name: 'Dual Crates',
    tier: 2,
    image: '/img/badges/two_playlists.png',
    description: 'Created two playlists',
  },
  {
    id: 'listener_200',
    name: 'Pit Dweller',
    tier: 3,
    image: '/img/badges/listener_200.png',
    description: 'Listened to 200 tracks',
  },
  {
    id: 'dj_50',
    name: 'Turntable Veteran',
    tier: 3,
    image: '/img/badges/dj_50.png',
    description: 'DJ\'d 50 tracks',
  },
  {
    id: 'level_20',
    name: 'Member',
    tier: 3,
    image: '/img/badges/level_20.png',
    description: 'Reached level 20',
  },
  {
    id: 'level_30',
    name: 'Veteran',
    tier: 3,
    image: '/img/badges/level_30.png',
    description: 'Reached level 30',
  },
  {
    id: 'avg_score_70',
    name: 'Warm Reception',
    tier: 3,
    image: '/img/badges/avg_score_70.png',
    description: 'Maintained 70+ average score as DJ (20+ votes received)',
  },
  {
    id: 'avg_score_85',
    name: 'Crowd Favourite',
    tier: 3,
    image: '/img/badges/avg_score_85.png',
    description: 'Maintained 85+ average score as DJ (50+ votes received)',
  },
];

const BADGE_BY_ID = new Map(BADGE_DEFINITIONS.map((b) => [b.id, b]));

function getBadgeDefinition(id) {
  return BADGE_BY_ID.get(id) || null;
}

function getPublicBadgeCatalog() {
  return BADGE_DEFINITIONS.map(({ id, name, tier, image, description }) => ({
    id,
    name,
    tier,
    image,
    description,
  }));
}

function resolveBadgeDetails(badgeIds) {
  const ids = Array.isArray(badgeIds) ? badgeIds : [];
  return ids
    .map((id) => {
      const def = getBadgeDefinition(id);
      if (!def) return { id, name: id, tier: 0, image: null, description: '' };
      return {
        id: def.id,
        name: def.name,
        tier: def.tier,
        image: def.image,
        description: def.description,
      };
    })
    .filter(Boolean);
}

/**
 * @param {object} user Mongoose user doc or plain object
 * @param {object} [ctx]
 * @param {number} [ctx.playlistCount]
 * @param {number} [ctx.maxPlaylistTracks]
 * @param {boolean} [ctx.hasPlaylistWithItem]
 */
function getEarnedBadgeIds(user, ctx = {}) {
  if (!user) return [];
  const stats = user.stats || {};
  const listens = stats.totalListens ?? 0;
  const plays = stats.totalPlays ?? 0;
  const votesGiven = stats.totalVotesGiven ?? 0;
  const votesReceived = stats.totalVotesReceived ?? 0;
  const avgReceived = stats.avgScoreReceived ?? 0;
  const level = user.level ?? 1;
  const playlistCount = ctx.playlistCount ?? 0;
  const maxTracks = ctx.maxPlaylistTracks ?? 0;
  const hasItems = ctx.hasPlaylistWithItem ?? maxTracks > 0;

  const earned = [];

  earned.push('account_created');

  if (listens >= 1) earned.push('first_listen');
  if (listens >= 10) earned.push('listener_10');
  if (listens >= 50) earned.push('listener_50');
  if (listens >= 200) earned.push('listener_200');

  if (votesGiven >= 1) earned.push('first_vote');
  if (votesGiven >= 10) earned.push('voter_10');
  if (votesGiven >= 50) earned.push('voter_50');

  if (plays >= 1) earned.push('first_dj_play');
  if (plays >= 5) earned.push('dj_5');
  if (plays >= 25) earned.push('dj_25');
  if (plays >= 50) earned.push('dj_50');

  if (level >= 5) earned.push('level_5');
  if (level >= 10) earned.push('level_10');
  if (level >= 20) earned.push('level_20');
  if (level >= 30) earned.push('level_30');

  if (hasItems) earned.push('first_playlist');
  if (maxTracks >= 25) earned.push('playlist_25_tracks');
  if (playlistCount >= 2) earned.push('two_playlists');

  if (ctx.hasQueued) earned.push('queue_joined');

  if (avgReceived >= 70 && votesReceived >= 20) earned.push('avg_score_70');
  if (avgReceived >= 85 && votesReceived >= 50) earned.push('avg_score_85');

  return earned.filter((id) => LAUNCH_BADGE_IDS.includes(id));
}

module.exports = {
  LAUNCH_BADGE_IDS,
  BADGE_DEFINITIONS,
  getBadgeDefinition,
  getPublicBadgeCatalog,
  resolveBadgeDetails,
  getEarnedBadgeIds,
};
