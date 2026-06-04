# Badge unlock rules (review)

Generated from **Badges.xlsx**. Edit this file to correct rules; implementation in `server/config/badges.js` follows these definitions.

**Implementation defaults for ambiguous badges:**
- Streaks and night window: **UTC** calendar dates; night owl = listens when hour is 0–3 UTC.
- `first_in_pit`: first voter on a track **10** separate times (lifetime counter).
- `perfect_match`: vote within **1 point** of session final average, **5** times.
- `warm_up_act` / `peak_time_dj`: online listener count at **track start**.
- `b2b_dj`: **5** consecutive Main Stage plays by the same DJ.

| Review? | ID | Name | Tier | Unlock rule | Impl. type |
|---------|-----|------|------|-------------|------------|
|  | `account_created` | Crossed the Threshold | 1 | User document exists (grant on register) | stats-only |
|  | `first_listen` | In the Pit | 1 | stats.totalListens >= 1 | stats-only |
|  | `first_vote` | Voice in the Void | 1 | stats.totalVotesGiven >= 1 (implies level >= 2) | stats-only |
|  | `first_dj_play` | On the Decks | 1 | stats.totalPlays >= 1 | stats-only |
|  | `first_playlist` | Crate Started | 1 | Own >=1 playlist with >=1 item | stats-only |
|  | `queue_joined` | Queued Up | 1 | First time user appears in DJ queue | stats-only |
|  | `level_2` | First Steps | 1 | level >= 2 | stats-only |
|  | `votes_received_10` | Acknowledged | 1 | totalVotesReceived >= 10 | stats-only |
|  | `first_chat` | Icebreaker | 1 | Send first chat message in the main room | chat-hook |
|  | `profile_viewed` | Stepping Out | 1 | Click a username to view another user's profile | profile-hook |
|  | `listener_10` | Pit Regular | 2 | totalListens >= 10 | stats-only |
|  | `listener_50` | Void Drifter | 2 | totalListens >= 50 | stats-only |
|  | `listener_100` | Familiar Face | 2 | totalListens >= 100 | stats-only |
|  | `voter_10` | Scorekeeper | 2 | totalVotesGiven >= 10 | stats-only |
|  | `voter_50` | Jury of One | 2 | totalVotesGiven >= 50 | stats-only |
|  | `voter_75` | Active Participant | 2 | totalVotesGiven >= 75 | stats-only |
|  | `dj_5` | Rotation Rookie | 2 | totalPlays >= 5 | stats-only |
|  | `dj_10` | Set Builder | 2 | totalPlays >= 10 | stats-only |
|  | `dj_25` | Booth Hand | 2 | totalPlays >= 25 | stats-only |
|  | `level_5` | Novice Complete | 2 | level >= 5 | stats-only |
|  | `level_10` | Regular | 2 | level >= 10 | stats-only |
|  | `level_15` | Established | 2 | level >= 15 | stats-only |
|  | `playlist_10_tracks` | Curious Crate | 2 | Max tracks in any owned playlist >= 10 | stats-only |
|  | `playlist_25_tracks` | Deep Crate | 2 | Max tracks in any owned playlist >= 25 | stats-only |
|  | `two_playlists` | Dual Crates | 2 | Playlist.count >= 2 for user | stats-only |
| **YES** | `daily_listener_3` | Vibe Check Streak | 2 | totalListens >= 5 for 3 consecutive days | streak |
| **YES** | `night_owl` | Night Owl | 2 | Listen to 10 tracks between midnight and 4AM | streak |
|  | `generous_voter` | Uplifter | 2 | Give out 10 scores of 90+ | vote-habit |
|  | `critical_ear` | Critical Ear | 2 | Give out 10 scores under 50 | vote-habit |
| **YES** | `first_in_pit` | Early Adopter | 2 | Be the first person to vote on a track 10 times | session-hook |
|  | `dj_streak_3` | Weekend Resident | 2 | DJ at least 1 track for 3 consecutive days | streak |
| **YES** | `warm_up_act` | Warm Up Act | 2 | Play a track when the room has less than 3 people | session-hook |
|  | `votes_received_50` | Getting Noticed | 2 | totalVotesReceived >= 50 | stats-only |
|  | `crate_digger` | Crate Digger | 2 | Add a track to a playlist directly from Main Stage history | event-hook |
|  | `chat_50` | Social Butterfly | 2 | Send 50 chat messages | chat-hook |
|  | `listener_200` | Pit Dweller | 3 | totalListens >= 200 | stats-only |
|  | `listener_250` | Dedicated Ear | 3 | totalListens >= 250 | stats-only |
|  | `listener_500` | Void Resident | 3 | totalListens >= 500 | stats-only |
|  | `listener_750` | Fixture | 3 | totalListens >= 750 | stats-only |
|  | `voter_100` | Opinionated | 3 | totalVotesGiven >= 100 | stats-only |
|  | `voter_200` | Crowd Voice | 3 | totalVotesGiven >= 200 | stats-only |
|  | `voter_250` | The Critic | 3 | totalVotesGiven >= 250 | stats-only |
|  | `voter_400` | Tastemaker Draft | 3 | totalVotesGiven >= 400 | stats-only |
|  | `dj_50` | Turntable Veteran | 3 | totalPlays >= 50 | stats-only |
|  | `dj_75` | Rhythm Rider | 3 | totalPlays >= 75 | stats-only |
|  | `dj_100` | Main Stage Regular | 3 | totalPlays >= 100 | stats-only |
|  | `dj_150` | Crowd Controller | 3 | totalPlays >= 150 | stats-only |
|  | `level_20` | Member | 3 | level >= 20 | stats-only |
|  | `level_25` | Proven Member | 3 | level >= 25 | stats-only |
|  | `level_30` | Veteran | 3 | level >= 30 | stats-only |
|  | `avg_score_70` | Warm Reception | 3 | avgScoreReceived >= 70 and totalVotesReceived >= 20 | stats-only |
|  | `avg_score_80` | Rising Star | 3 | avgScoreReceived >= 80 and totalVotesReceived >= 30 | stats-only |
|  | `avg_score_85` | Crowd Favourite | 3 | avgScoreReceived >= 85 and totalVotesReceived >= 50 | stats-only |
|  | `high_score_set` | Peak Moment | 3 | One play session with aggregate avg >= 95 and voteCount >= 3 | session-hook |
| **YES** | `daily_listener_7` | Weekly Devotion | 3 | totalListens >= 5 for 7 consecutive days | streak |
| **YES** | `daily_listener_14` | Fortnight Fixture | 3 | totalListens >= 5 for 14 consecutive days | streak |
|  | `voter_streak_50` | Attentive | 3 | Voted on 50 consecutive tracks without missing a vote | streak |
| **YES** | `perfect_match` | Syncopated Mind | 3 | Give a vote that exactly matches final average score 5 times | vote-habit |
|  | `dj_streak_7` | Daily Spinner | 3 | DJ at least 1 track for 7 consecutive days | streak |
|  | `crowd_pleaser` | Fire Starter | 3 | Receive 5 votes of 90+ on a single track play | session-hook |
| **YES** | `b2b_dj` | Back to Back | 3 | Play a track immediately following the same DJ 5 times in a session | session-hook |
|  | `votes_received_100` | Appreciated | 3 | totalVotesReceived >= 100 | stats-only |
|  | `votes_received_250` | Well Known | 3 | totalVotesReceived >= 250 | stats-only |
|  | `playlist_5` | Curator | 3 | Own 5 playlists with at least 5 tracks each | stats-only |
|  | `playlist_50_tracks` | Heavy Rotation | 3 | Max tracks in any owned playlist >= 50 | stats-only |
|  | `listener_1000` | Void Echo | 4 | totalListens >= 1000 | stats-only |
|  | `listener_1500` | Enduring Frequency | 4 | totalListens >= 1500 | stats-only |
|  | `listener_2500` | Eternal Listener | 4 | totalListens >= 2500 | stats-only |
|  | `voter_500` | Score Sage | 4 | totalVotesGiven >= 500 | stats-only |
|  | `voter_750` | Arbiter | 4 | totalVotesGiven >= 750 | stats-only |
|  | `dj_250` | Deck Master | 4 | totalPlays >= 250 | stats-only |
|  | `dj_500` | Rotation Legend | 4 | totalPlays >= 500 | stats-only |
|  | `dj_750` | Sound Architect | 4 | totalPlays >= 750 | stats-only |
|  | `level_35` | Decorated Veteran | 4 | level >= 35 | stats-only |
|  | `level_40` | Elite | 4 | level >= 40 | stats-only |
|  | `level_45` | Vanguard | 4 | level >= 45 | stats-only |
|  | `avg_score_90` | Stage Magnet | 4 | avgScoreReceived >= 90 and totalVotesReceived >= 100 | stats-only |
|  | `avg_score_95` | Near Perfect | 4 | avgScoreReceived >= 95 and totalVotesReceived >= 200 | stats-only |
|  | `votes_received_500` | Heard | 4 | totalVotesReceived >= 500 | stats-only |
|  | `votes_received_1000` | Respected | 4 | totalVotesReceived >= 1000 | stats-only |
| **YES** | `daily_listener_30` | Monthly Resident | 4 | totalListens >= 5 for 30 consecutive days | streak |
| **YES** | `peak_time_dj` | Prime Time | 4 | Play a track when the room has >20 people listening | session-hook |
|  | `dj_streak_30` | Monthly Spinner | 4 | DJ at least 1 track for 30 consecutive days | streak |
|  | `playlist_10` | Archivist | 4 | Own 10 playlists with at least 5 tracks each | stats-only |
|  | `playlist_75_tracks` | Massive Crate | 4 | Max tracks in any owned playlist >= 75 | stats-only |
|  | `level_50` | Champion | 5 | level >= 50 | stats-only |
|  | `level_55` | Grand Champion | 5 | level >= 55 | stats-only |
|  | `level_60` | Legend | 5 | level >= 60 (163,809 XP) | stats-only |
|  | `listener_5000` | Voidbound | 5 | totalListens >= 5000 | stats-only |
|  | `listener_7500` | One With The Music | 5 | totalListens >= 7500 | stats-only |
|  | `listener_10000` | The Overseer | 5 | totalListens >= 10000 | stats-only |
|  | `dj_1000` | Archivist DJ | 5 | totalPlays >= 1000 | stats-only |
|  | `dj_2000` | Maestro | 5 | totalPlays >= 2000 | stats-only |
|  | `dj_5000` | Void Sonic Deity | 5 | totalPlays >= 5000 | stats-only |
|  | `voter_1000` | Final Judge | 5 | totalVotesGiven >= 1000 | stats-only |
|  | `voter_2500` | The Oracle | 5 | totalVotesGiven >= 2500 | stats-only |
|  | `voter_5000` | Voice of the Void | 5 | totalVotesGiven >= 5000 | stats-only |
|  | `perfect_room` | Unanimous | 5 | One play session: voteCount >= 5 and every vote score === 100 | session-hook |
|  | `playlist_100_tracks` | Infinite Crate | 5 | Any playlist >= 100 items | stats-only |
|  | `year_member` | Anniversary | 5 | createdAt >= 365 days ago | stats-only |
| **YES** | `ally_approved` | Ally Approved | 6 | ?? | manual |
| **YES** | `freddy_approved` | Freddy Approved | 6 | ?? | manual |
|  | `axolotl_lover` | Axolotl Lover | 6 | Mention Axolotl in the chat | chat-hook |
|  | `mummy_badge` | Mummy Badge | 6 | Mention Coffee in the chat | chat-hook |
| **YES** | `axolotl_drummer` | Axolotl Drummer | 6 | ?? | manual |

Total badges: **105**
