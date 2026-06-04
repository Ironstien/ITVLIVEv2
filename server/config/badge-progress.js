/**
 * Incremental stats for streaks, vote habits, and session trophies.
 */

function utcDateKey(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function yesterdayKey(ms = Date.now()) {
  return utcDateKey(ms - 86400000);
}

function isNightListenUtc(ms = Date.now()) {
  const h = new Date(ms).getUTCHours();
  return h >= 0 && h < 4;
}

/**
 * @param {object} stats plain stats subdoc (mutated)
 */
function bumpListenerDay(stats, now = Date.now()) {
  const today = utcDateKey(now);
  const yesterday = yesterdayKey(now);

  if (stats.listenerDayKey !== today) {
    if (stats.listenerDayKey === yesterday && (stats.listenerDayCount ?? 0) >= 5) {
      stats.listenerStreakDays = (stats.listenerStreakDays ?? 0) + 1;
    } else if (stats.listenerDayKey && stats.listenerDayKey !== yesterday) {
      stats.listenerStreakDays = 0;
    }
    stats.listenerDayKey = today;
    stats.listenerDayCount = 0;
  }

  stats.listenerDayCount = (stats.listenerDayCount ?? 0) + 1;
  if (stats.listenerDayCount >= 5 && (stats.listenerStreakDays ?? 0) === 0) {
    stats.listenerStreakDays = 1;
  }
}

function bumpDjDay(stats, now = Date.now()) {
  const today = utcDateKey(now);
  const yesterday = yesterdayKey(now);

  if (stats.djDayKey !== today) {
    if (stats.djDayKey === yesterday && (stats.djDayCount ?? 0) >= 1) {
      stats.djStreakDays = (stats.djStreakDays ?? 0) + 1;
    } else if (stats.djDayKey && stats.djDayKey !== yesterday) {
      stats.djStreakDays = 0;
    }
    stats.djDayKey = today;
    stats.djDayCount = 0;
  }

  stats.djDayCount = (stats.djDayCount ?? 0) + 1;
  if (stats.djDayCount >= 1 && (stats.djStreakDays ?? 0) === 0) {
    stats.djStreakDays = 1;
  }
}

function recordNightListen(stats, now = Date.now()) {
  if (!isNightListenUtc(now)) return;
  stats.nightListens = (stats.nightListens ?? 0) + 1;
}

function recordVoteScoreHabits(stats, score) {
  const n = Math.floor(Number(score));
  if (!Number.isFinite(n)) return;
  if (n >= 90) stats.highVotesGiven = (stats.highVotesGiven ?? 0) + 1;
  if (n <= 50) stats.lowVotesGiven = (stats.lowVotesGiven ?? 0) + 1;
}

function recordVoterStreakOnVote(stats) {
  stats.voterStreakSessions = (stats.voterStreakSessions ?? 0) + 1;
}

function resetVoterStreak(stats) {
  stats.voterStreakSessions = 0;
}

function recordPerfectMatch(stats, userScore, sessionAvg) {
  const score = Math.floor(Number(userScore));
  const avg = Number(sessionAvg);
  if (!Number.isFinite(score) || !Number.isFinite(avg) || avg <= 0) return;
  if (Math.abs(score - avg) <= 1) {
    stats.perfectMatchCount = (stats.perfectMatchCount ?? 0) + 1;
  }
}

function recordFirstVoter(stats) {
  stats.firstVoterCount = (stats.firstVoterCount ?? 0) + 1;
}

function recordB2bFollow(stats) {
  stats.b2bDjCount = (stats.b2bDjCount ?? 0) + 1;
}

function resetB2bFollow(stats) {
  stats.b2bDjCount = 0;
}

module.exports = {
  utcDateKey,
  yesterdayKey,
  isNightListenUtc,
  bumpListenerDay,
  bumpDjDay,
  recordNightListen,
  recordVoteScoreHabits,
  recordVoterStreakOnVote,
  resetVoterStreak,
  recordPerfectMatch,
  recordFirstVoter,
  recordB2bFollow,
  resetB2bFollow,
};
