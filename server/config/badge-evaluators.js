/**
 * Automatic badge earn checks (non-manual catalog entries).
 */

const MS_PER_DAY = 86400000;

function daysSince(date) {
  if (!date) return 0;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / MS_PER_DAY);
}

/**
 * @param {object} user
 * @param {object} stats user.stats
 * @param {object} ctx
 * @returns {string[]}
 */
function evaluateAutoBadges(user, stats, ctx) {
  const earned = [];
  const push = (id) => earned.push(id);

  const listens = stats.totalListens ?? 0;
  const plays = stats.totalPlays ?? 0;
  const votesGiven = stats.totalVotesGiven ?? 0;
  const votesReceived = stats.totalVotesReceived ?? 0;
  const avgReceived = stats.avgScoreReceived ?? 0;
  const level = user.level ?? 1;
  const maxTracks = ctx.maxPlaylistTracks ?? 0;
  const hasItems = ctx.hasPlaylistWithItem ?? maxTracks > 0;
  const playlistCount = ctx.playlistCount ?? 0;
  const qualified5 = ctx.qualifiedPlaylists5 ?? 0;
  const qualified10 = ctx.qualifiedPlaylists10 ?? 0;

  push('account_created');

  if (listens >= 1) push('first_listen');
  if (listens >= 10) push('listener_10');
  if (listens >= 50) push('listener_50');
  if (listens >= 100) push('listener_100');
  if (listens >= 200) push('listener_200');
  if (listens >= 250) push('listener_250');
  if (listens >= 500) push('listener_500');
  if (listens >= 750) push('listener_750');
  if (listens >= 1000) push('listener_1000');
  if (listens >= 1500) push('listener_1500');
  if (listens >= 2500) push('listener_2500');
  if (listens >= 5000) push('listener_5000');
  if (listens >= 7500) push('listener_7500');
  if (listens >= 10000) push('listener_10000');

  if (votesGiven >= 1) push('first_vote');
  if (votesGiven >= 10) push('voter_10');
  if (votesGiven >= 50) push('voter_50');
  if (votesGiven >= 75) push('voter_75');
  if (votesGiven >= 100) push('voter_100');
  if (votesGiven >= 200) push('voter_200');
  if (votesGiven >= 250) push('voter_250');
  if (votesGiven >= 400) push('voter_400');
  if (votesGiven >= 500) push('voter_500');
  if (votesGiven >= 750) push('voter_750');
  if (votesGiven >= 1000) push('voter_1000');
  if (votesGiven >= 2500) push('voter_2500');
  if (votesGiven >= 5000) push('voter_5000');

  if (plays >= 1) push('first_dj_play');
  if (plays >= 5) push('dj_5');
  if (plays >= 10) push('dj_10');
  if (plays >= 25) push('dj_25');
  if (plays >= 50) push('dj_50');
  if (plays >= 75) push('dj_75');
  if (plays >= 100) push('dj_100');
  if (plays >= 150) push('dj_150');
  if (plays >= 250) push('dj_250');
  if (plays >= 500) push('dj_500');
  if (plays >= 750) push('dj_750');
  if (plays >= 1000) push('dj_1000');
  if (plays >= 2000) push('dj_2000');
  if (plays >= 5000) push('dj_5000');

  if (level >= 2) push('level_2');
  if (level >= 5) push('level_5');
  if (level >= 10) push('level_10');
  if (level >= 15) push('level_15');
  if (level >= 20) push('level_20');
  if (level >= 25) push('level_25');
  if (level >= 30) push('level_30');
  if (level >= 35) push('level_35');
  if (level >= 40) push('level_40');
  if (level >= 45) push('level_45');
  if (level >= 50) push('level_50');
  if (level >= 55) push('level_55');
  if (level >= 60) push('level_60');

  if (votesReceived >= 10) push('votes_received_10');
  if (votesReceived >= 50) push('votes_received_50');
  if (votesReceived >= 100) push('votes_received_100');
  if (votesReceived >= 250) push('votes_received_250');
  if (votesReceived >= 500) push('votes_received_500');
  if (votesReceived >= 1000) push('votes_received_1000');

  if (hasItems) push('first_playlist');
  if (maxTracks >= 10) push('playlist_10_tracks');
  if (maxTracks >= 25) push('playlist_25_tracks');
  if (maxTracks >= 50) push('playlist_50_tracks');
  if (maxTracks >= 75) push('playlist_75_tracks');
  if (maxTracks >= 100) push('playlist_100_tracks');
  if (playlistCount >= 2) push('two_playlists');
  if (qualified5 >= 5) push('playlist_5');
  if (qualified10 >= 10) push('playlist_10');

  if (ctx.hasQueued) push('queue_joined');

  if (avgReceived >= 70 && votesReceived >= 20) push('avg_score_70');
  if (avgReceived >= 80 && votesReceived >= 30) push('avg_score_80');
  if (avgReceived >= 85 && votesReceived >= 50) push('avg_score_85');
  if (avgReceived >= 90 && votesReceived >= 100) push('avg_score_90');
  if (avgReceived >= 95 && votesReceived >= 200) push('avg_score_95');

  if (daysSince(user.createdAt) >= 365) push('year_member');

  if ((stats.chatMessages ?? 0) >= 1) push('first_chat');
  if ((stats.chatMessages ?? 0) >= 50) push('chat_50');
  if ((stats.profilesViewed ?? 0) >= 1) push('profile_viewed');

  if ((stats.highVotesGiven ?? 0) >= 10) push('generous_voter');
  if ((stats.lowVotesGiven ?? 0) >= 10) push('critical_ear');
  if ((stats.nightListens ?? 0) >= 10) push('night_owl');

  const listenerStreak = stats.listenerStreakDays ?? 0;
  const listenerToday = stats.listenerDayCount ?? 0;
  const listenerStreakEffective =
    listenerStreak + (listenerToday >= 5 && listenerStreak === 0 ? 1 : 0);
  if (listenerStreakEffective >= 3) push('daily_listener_3');
  if (listenerStreakEffective >= 7) push('daily_listener_7');
  if (listenerStreakEffective >= 14) push('daily_listener_14');
  if (listenerStreakEffective >= 30) push('daily_listener_30');

  const djStreak = stats.djStreakDays ?? 0;
  const djToday = stats.djDayCount ?? 0;
  const djStreakEffective = djStreak + (djToday >= 1 && djStreak === 0 ? 1 : 0);
  if (djStreakEffective >= 3) push('dj_streak_3');
  if (djStreakEffective >= 7) push('dj_streak_7');
  if (djStreakEffective >= 30) push('dj_streak_30');

  if ((stats.voterStreakSessions ?? 0) >= 50) push('voter_streak_50');
  if ((stats.perfectMatchCount ?? 0) >= 5) push('perfect_match');
  if ((stats.firstVoterCount ?? 0) >= 10) push('first_in_pit');
  if ((stats.b2bDjCount ?? 0) >= 5) push('b2b_dj');

  if (stats.hasHighScoreSet) push('high_score_set');
  if (stats.hasPerfectRoom) push('perfect_room');
  if (stats.hasCrowdPleaser) push('crowd_pleaser');
  if (stats.hasWarmUpAct) push('warm_up_act');
  if (stats.hasPeakTimeDj) push('peak_time_dj');
  if (stats.hasCrateDigger) push('crate_digger');

  if (stats.mentionedAxolotl) push('axolotl_lover');
  if (stats.mentionedCoffee) push('mummy_badge');

  const agg = ctx.sessionAggregates;
  if (agg && !stats.hasHighScoreSet && agg.avgScore >= 95 && agg.voteCount >= 3) {
    push('high_score_set');
  }
  if (agg && !stats.hasPerfectRoom && agg.voteCount >= 5 && agg.lowScore >= 100) {
    push('perfect_room');
  }
  if (agg && !stats.hasCrowdPleaser && (agg.highScoreCount90 ?? 0) >= 5) {
    push('crowd_pleaser');
  }

  if (ctx.listenerCountAtStart != null) {
    if (ctx.listenerCountAtStart < 3) push('warm_up_act');
    if (ctx.listenerCountAtStart > 20) push('peak_time_dj');
  }

  return earned;
}

module.exports = { evaluateAutoBadges };
