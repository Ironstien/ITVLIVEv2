# INTO THE VOID v2 — Working Plan

> **How to use this document**
>
> - Work through phases **in order** unless a step says it can run in parallel.
> - Check boxes as you complete tasks. Edit thresholds, permissions, and scope anytime.
> - Each phase has **Exit criteria** — do not start the next phase until those pass.
> - Copy the **Cursor prompt** into a new chat when you start a phase.
> - Keep `.env` secrets out of git. Use `.env.example` as the template.
> - Rules in `.cursor/rules/itvlive-v2.md` are always-on; this doc is the roadmap.

**Project:** ITVLive v2 (INTO THE VOID)  
**Stack:** Node 18+, Express, Socket.io, Mongoose, vanilla HTML/CSS/JS  
**Repo:** `ITVLIVEv2/`  
**Current baseline:** Phase 0 complete (bootstrap shell — no live room yet)

---

## Progress at a glance

| Phase | Name | Status |
|-------|------|--------|
| 0 | Bootstrap | ✅ Done |
| 1 | Data foundation | ⬜ Not started |
| 2 | Guest live room | ⬜ Not started |
| 3 | Auth & one-tab sessions | ⬜ Not started |
| 4 | Playlists (multi + active) | ⬜ Not started |
| 5 | DJ queue & rotation | ⬜ Not started |
| 6 | Voting, XP & levels | ⬜ Not started |
| 7 | Staff & moderation | ⬜ Not started |
| 8 | Deploy & polish | ⬜ Not started |

---

## Your decisions (edit before you build)

| Decision | v2 choice |
|----------|-----------|
| Currency | **XP only** — no tokens, no token shop |
| Level range | **1–60** (earned); thresholds in `server/config/levels.js` |
| Staff roles | `null`, `resident`, `mod`, `admin` — **no Host role** |
| Guest access after login | Guests stay on Main Stage: **chat + listen only** |
| Guest queue / playlist | **No** — queue and playlists require an account |
| Socket events | `player:sync` **separate from** `room:state` |
| Track end authority | **Server timer primary**; client `player:ended` is backup only |
| One account, one tab | New login/tab **replaces** prior socket for same `userId` |
| Playlist import/export | One line per track: `Title https://youtube.com/...` |
| Avatar storage | URL only |
| Vote UX | Slider movable during song; **final value recorded at track end** |
| XP: listener | +1 XP if present when song ends (server-timed) |
| XP: DJ | +3 XP when their song finishes |
| Deploy target | *(fill in — e.g. Render + MongoDB Atlas)* |

---

## Architecture reference

### Two fields — never one combined “role”

| Field | Values | Purpose |
|-------|--------|---------|
| `level` | `1` … `60` | Earned progression (XP thresholds) |
| `staffRole` | `null`, `resident`, `mod`, `admin` | Assigned permissions |

### MongoDB collections (target)

| Collection | Purpose |
|------------|---------|
| `User` | Account, level, XP, staff role, stats, cosmetics |
| `Playlist` | Named playlist per user (`name`, `userId`, `isActive`) |
| `PlaylistItem` | Tracks in a playlist (`playlistId`, `title`, `youtubeId`, `order`) |
| `Song` | YouTube catalog + lifetime stats |
| `PlaySession` | One room play (DJ, timestamps, session scores) |
| `Vote` | One score per user per play session |
| `XpTransaction` | Audit log for XP changes |

### Memory vs database

| In memory (`server/services/room.js`) | In MongoDB |
|---------------------------------------|------------|
| Live queue, chat buffer, online users | Users, playlists, playlist items |
| `nowPlaying`, track-end timer | Play history, votes, XP log |
| Socket ↔ session mapping | Song catalog aggregates |

### Socket contract (do not merge)

| Event | Carries | Must NOT carry |
|-------|---------|----------------|
| `player:sync` | `videoId`, `startedAt`, `serverTime`, `playSessionId`, duration | Chat, queue, online list |
| `room:state` | Chat, online, queue, vinyl pit, banners, DJ name | YouTube reload/seek commands |

---

# Phase 0 — Bootstrap

**Goal:** Empty repo with theme, layout config, server shell, and project rules — no room logic.

**Status:** ✅ Complete

### Tasks

- [x] `package.json` — Node 18+, Express, Socket.io, Mongoose, CORS, dotenv
- [x] `server/index.js` — `/health`, static `public/`, Socket.io stub
- [x] `server/config/db.js` — optional MongoDB connect
- [x] Theme CSS copied: `variables.css`, `layout.css`, `components.css`
- [x] `public/css/layout-config.css` — commented layout dimension variables
- [x] Branding: `public/img/favicon.png`, `itv-logo.png`
- [x] `public/index.html` — Main Stage shell (no v1 `room.js` / `app.js` logic)
- [x] `public/js/app.js` — tabs + socket bootstrap only
- [x] `.env.example`
- [x] `.cursor/rules/itvlive-v2.md`

### Exit criteria

- [x] `npm install && npm run dev` starts without error
- [x] `GET /health` returns `{ ok: true, ... }`
- [x] Main Stage loads with void theme at `http://localhost:3000`
- [x] App runs with **empty** `MONGODB_URI`

### Notes

```
Bootstrap completed 2026-05-31. Room/player/queue not implemented yet.
```

---

# Phase 1 — Data foundation

**Goal:** Mongoose schemas, XP/level config, permissions helper — app still runs without MongoDB for guest-only dev.

**Depends on:** Phase 0  
**Estimated time:** 1–2 days

### Tasks

#### Folders & config

- [ ] `server/models/` — register all schemas in `server/models/index.js`
- [ ] `server/config/permissions.js` — `can(user, action)` (no Host actions)
- [ ] `server/config/levels.js` — level **1–60** threshold table (editable constants)
- [ ] `server/middleware/` — placeholder for later auth middleware

#### Models

- [ ] `User` — `email`, `passwordHash`, `username`, `level`, `xp`, `staffRole`, `avatarUrl`, `customSaying`, `badges[]`, stats fields, `activePlaylistId`, `createdAt`
- [ ] `Playlist` — `userId`, `name`, `isActive` (one active per user — enforce in service layer)
- [ ] `PlaylistItem` — `playlistId`, `title`, `youtubeId`, `order`, `addedAt`
- [ ] `Song` — `youtubeId`, `title`, lifetime stats (plays, avg score, etc.)
- [ ] `PlaySession` — `youtubeId`, `playedByUserId`, `startedAt`, `endedAt`, session aggregates
- [ ] `Vote` — `playSessionId`, `userId`, `score` (1–100), unique index per user per session
- [ ] `XpTransaction` — `userId`, `amount`, `reason`, `createdAt`

#### Server wiring

- [ ] Require models on boot when `MONGODB_URI` is set
- [ ] Update `/health` to report `{ db: true/false, phase: 1 }`
- [ ] No breaking changes to Phase 0 static UI or socket stub

### Exit criteria

- [ ] App starts with **or without** `MONGODB_URI`
- [ ] With URI set: schemas load, no duplicate-index errors
- [ ] `can(null, 'chat')` and `can(guestStub, 'joinQueue')` behave per rules (guest cannot queue)
- [ ] `levels.js` exports thresholds for levels 1–60 (values can be placeholders initially)

### Cursor prompt — Phase 1

```
Implement Phase 1 (Data foundation) for ITVLive v2 per docs/WORKING-PLAN.md.

Requirements:
1. Create Mongoose models: User, Playlist, PlaylistItem, Song, PlaySession, Vote, XpTransaction.
   - User uses xp + level (1-60), staffRole (null|resident|mod|admin). No tokenBalance. No Host role.
   - Playlist: multiple per user; exactly one isActive per user (enforce in service helper, not only schema).
   - Never store plain passwords — passwordHash only (field ready for Phase 3).
2. Create server/config/permissions.js with can(user, action). No host-only actions.
3. Create server/config/levels.js with editable XP thresholds for levels 1-60.
4. Wire models/index.js; connect when MONGODB_URI is set. App must still run without DB.
5. Update /health to report phase and db status.

Do not port v1 room.js. Do not add auth UI yet. Minimal scope. After changes, tell me how to test.
```

### Notes

```
(your notes here)
```

---

# Phase 2 — Guest live room

**Goal:** Fresh `room.js` + sockets — chat, online list, vinyl pit (listeners), separated `player:sync` / `room:state`, **server track-end timer as primary**.

**Depends on:** Phase 0 (Phase 1 optional but recommended for `Song` catalog writes)  
**Estimated time:** 3–5 days

### Tasks

#### Server

- [ ] `server/services/room.js` — in-memory room state (chat, online, optional dev queue slot)
- [ ] `server/services/youtube.js` — parse URL, fetch metadata/duration (no v1 port wholesale)
- [ ] `server/sockets/index.js` — handlers for join, chat, disconnect
- [ ] Emit `room:state` on chat/online/pit changes — **never** embed player reload in this payload
- [ ] Emit `player:sync` only on track start/change/end boundary
- [ ] Server track-end: schedule from `duration + startedAt`; idempotent `playSessionId`; prevent double-advance
- [ ] Client `player:ended` logged but **not** sole authority
- [ ] Guest model: display name (localStorage or prompt), `userId: null`, chat + listen only
- [ ] Dev-only: optional `POST /api/dev/queue-track` or env flag to inject a test track (remove before prod)

#### Client

- [ ] `public/js/player.js` — YouTube iframe; subscribes **only** to `player:sync`
- [ ] `public/js/room.js` — subscribes to `room:state`; updates chat, online, vinyl pit
- [ ] Refactor `app.js` — wire modules; remove placeholder-only chat loop
- [ ] Late join: one seek to `serverTime - startedAt` per track boundary
- [ ] No drift loop / `player:tick` / periodic resync

### Exit criteria

- [ ] Two browser tabs: chat and online list stay in sync
- [ ] `player:sync` fires independently of chat messages (verify in Network/socket log)
- [ ] When a track is playing, late-joining tab seeks to correct position once
- [ ] Track advances via **server timer** if client disconnects before ENDED
- [ ] Guest cannot join DJ queue or edit playlist (UI disabled + server rejects if attempted)
- [ ] Vinyl pit shows listening users

### Cursor prompt — Phase 2

```
Implement Phase 2 (Guest live room) for ITVLive v2 per docs/WORKING-PLAN.md and .cursor/rules/itvlive-v2.md.

Write fresh server/services/room.js and socket handlers — do NOT copy v1 room.js/app.js logic.

Requirements:
1. Separate player:sync (videoId, startedAt, serverTime, playSessionId) from room:state (chat, online, pit, banners).
2. Server track-end timer is PRIMARY; client player:ended is backup only; prevent double-advance.
3. Guests: chat + listen only. Display name for guests. No queue join, no playlist edits.
4. public/js/player.js handles player:sync only; public/js/room.js handles room:state UI.
5. One seek per track boundary for late joiners. No drift correction loop.
6. Optional dev endpoint to inject a test track for manual QA.

After changes, tell me how to test with two tabs.
```

### Notes

```
(your notes here)
```

---

# Phase 3 — Auth & one-tab sessions

**Goal:** Register, login, JWT on REST + Socket.io; enforce **one active socket per userId**; guest flow preserved.

**Depends on:** Phase 1  
**Estimated time:** ~1 week

### Tasks

#### Backend

- [ ] `bcryptjs`, `jsonwebtoken` in `package.json`
- [ ] `POST /api/auth/register` — level 1, xp 0
- [ ] `POST /api/auth/login` — returns JWT
- [ ] `GET /api/auth/me`, `PATCH /api/auth/profile` (avatarUrl, customSaying)
- [ ] Unique indexes: `email`, `username`
- [ ] `server/middleware/auth.js` — JWT for REST
- [ ] Socket.io: `handshake.auth.token`; attach user to session
- [ ] **One tab per account:** new connection invalidates prior socket for same `userId`
- [ ] Update `.env.example`: `JWT_SECRET`

#### Frontend

- [ ] `login.html`, minimal auth JS
- [ ] Nav shows logged-in user vs guest
- [ ] Socket reconnects with token after login

### Exit criteria

- [ ] Register → login → `/api/auth/me` returns profile
- [ ] Logged-in user on Tab B disconnects Tab A (or shows “session replaced” message)
- [ ] Guest can still chat/listen without account
- [ ] Invalid/expired JWT rejected on REST and socket

### Cursor prompt — Phase 3

```
Implement Phase 3 (Auth & one-tab sessions) for ITVLive v2 per docs/WORKING-PLAN.md.

Requirements:
1. Register/login with bcrypt + JWT. User starts at level 1, xp 0.
2. Socket.io auth via handshake.auth.token.
3. Enforce one active socket per userId — new tab replaces old server-side.
4. Keep guest flow: no account needed for chat + listen.
5. login.html + nav user state. Update .env.example with JWT_SECRET.

Follow existing code style. Tell me how to test one-tab enforcement with two browsers.
```

### Notes

```
(your notes here)
```

---

# Phase 4 — Playlists (multiple + active)

**Goal:** Logged-in users manage multiple playlists; one **active** playlist selected for future queue use; import/export.

**Depends on:** Phase 1, Phase 3  
**Estimated time:** 3–4 days

### Tasks

- [ ] REST: CRUD playlists, CRUD items, set active playlist
- [ ] Server enforces one `isActive` playlist per user
- [ ] UI: playlist selector, add/remove/reorder tracks
- [ ] YouTube URL validation server-side on add
- [ ] Import `.txt`: `Title https://...` one per line
- [ ] Export active (or selected) playlist in same format — round-trip test
- [ ] Guests: playlist panel remains disabled (existing CSS `panel-playlist--guest`)

### Exit criteria

- [ ] User creates 2+ playlists, sets active, adds tracks
- [ ] Import 10-line file → export → re-import produces same titles/URLs
- [ ] Active playlist persists across logout/login
- [ ] Guest cannot hit playlist API (403)

### Cursor prompt — Phase 4

```
Implement Phase 4 (Playlists) for ITVLive v2 per docs/WORKING-PLAN.md.

Requirements:
1. Multiple playlists per user; one active playlist (server-enforced).
2. REST CRUD for playlists and items. YouTube URL validated server-side.
3. Import/export format: "Title https://youtube.com/..." one line per track.
4. Wire left panel UI for logged-in users only; guests stay disabled.

Tell me how to test import/export round-trip.
```

### Notes

```
(your notes here)
```

---

# Phase 5 — DJ queue & rotation

**Goal:** Join queue uses **active playlist** head; global rotation; rip/skip; vinyl pit queue row.

**Depends on:** Phase 2, Phase 4  
**Estimated time:** 4–5 days

### Tasks

- [ ] `queue:join` / `queue:leave` — requires authenticated user with active playlist
- [ ] Empty queue: first join starts their playlist head immediately
- [ ] Track end: current DJ moves to **bottom** of queue; next DJ starts
- [ ] Rip: copy now-playing metadata into user's active playlist
- [ ] Skip now-playing: current DJ only (plus mod/admin in Phase 7)
- [ ] Skip waiting slot: own queue entry only
- [ ] Vinyl pit: separate queue row + listening row
- [ ] `room:state` includes queue; `player:sync` on track boundaries only

### Exit criteria

- [ ] Two users with playlists rotate correctly across 3+ tracks
- [ ] Server timer advances queue even if DJ tab closes
- [ ] Rip adds track to active playlist
- [ ] Guest join queue attempt rejected server-side

### Cursor prompt — Phase 5

```
Implement Phase 5 (DJ queue & rotation) for ITVLive v2 per docs/WORKING-PLAN.md.

Requirements:
1. queue:join uses the user's active playlist; head plays on their turn.
2. Rotation on track end (server timer primary). DJ moves to bottom after song.
3. Rip, skip own now-playing, skip own waiting slot — server-authoritative.
4. Vinyl pit queue row + listening row in room:state.
5. Guests cannot join queue.

Tell me how to test rotation with two test accounts.
```

### Notes

```
(your notes here)
```

---

# Phase 6 — Voting, XP & levels

**Goal:** Vote slider (level-gated), XP grants, level 1–60 progression, post-song score reveal.

**Depends on:** Phase 1, Phase 5  
**Estimated time:** ~1 week

### Tasks

- [ ] Vote: level ≥ 2 (configurable in `levels.js`); one vote per user per `playSessionId`
- [ ] Slider moves during song; **persist score at track end**
- [ ] Show aggregate avg/high/low **after** song ends — not live per-user scores
- [ ] XP: +1 listener (present at end), +3 DJ — via `XpTransaction`
- [ ] Level-up check against `levels.js` thresholds after XP change
- [ ] Update user stats aggregates (`totalPlays`, `totalListens`, etc.)

### Exit criteria

- [ ] Level 1 user cannot vote; level 2+ can
- [ ] Double-vote same session rejected
- [ ] XP and level increase after sessions; audit in `XpTransaction`
- [ ] No token fields or token shop anywhere in codebase

### Cursor prompt — Phase 6

```
Implement Phase 6 (Voting, XP & levels) for ITVLive v2 per docs/WORKING-PLAN.md.

Requirements:
1. Vote 1-100, level-gated, one per playSessionId. Record at track end.
2. Show aggregates after song ends only.
3. XP (+1 listen, +3 DJ) with XpTransaction audit. Level 1-60 from levels.js.
4. No tokens. Server-authoritative only.

Tell me how to test vote + XP flow.
```

### Notes

```
(your notes here)
```

---

# Phase 7 — Staff & moderation

**Goal:** `resident`, `mod`, `admin` permissions; mod tools; admin panel — **no Host role**.

**Depends on:** Phase 3, Phase 6  
**Estimated time:** 3–5 days

### Tasks

- [ ] Enforce `can(user, action)` on all privileged sockets/routes
- [ ] Mod: mute/unmute chat, clear chat, skip any song
- [ ] Admin: assign staff roles, platform settings, admin panel
- [ ] Resident: cosmetic badges only (unless extended)
- [ ] Audit log for mod/admin actions
- [ ] Confirm no `host` in `staffRole` enum or permission matrix

### Exit criteria

- [ ] Mod can clear chat and skip song; regular user cannot
- [ ] Admin can promote mod; mod cannot promote admin
- [ ] All privileged actions logged
- [ ] Grep for `host` role in permissions — none functional

### Cursor prompt — Phase 7

```
Implement Phase 7 (Staff & moderation) for ITVLive v2 per docs/WORKING-PLAN.md.

Use server/config/permissions.js for every privileged action. staffRole: resident, mod, admin only — no Host.
Add mod tools (clear chat, skip song) and admin panel for role assignment.
Tell me how to test mod vs admin capabilities.
```

### Notes

```
(your notes here)
```

---

# Phase 8 — Deploy & polish

**Goal:** Production deploy, env hardening, mobile pass, performance caps on vinyl pit.

**Depends on:** Phase 6 minimum (Phase 7 recommended)  
**Estimated time:** 2–3 days

### Tasks

- [ ] Remove dev-only queue inject endpoint (or guard with `NODE_ENV`)
- [ ] `render.yaml` or deploy config
- [ ] Production `CLIENT_ORIGIN`, `MONGODB_URI`, `JWT_SECRET`
- [ ] `/health` used by deploy health check
- [ ] Mobile layout pass (`layout-config.css` tweaks)
- [ ] Vinyl pit: cap animated discs / throttle on mobile
- [ ] Smoke test checklist below

### Exit criteria

- [ ] Deploy URL loads Main Stage over HTTPS
- [ ] Two remote clients sync chat + player
- [ ] MongoDB Atlas connected in production
- [ ] No secrets in repo

### Smoke test checklist

- [ ] Guest: chat + listen only
- [ ] Register, login, one-tab enforcement
- [ ] Create playlist, import/export round-trip
- [ ] Join queue, 2-user rotation, server timer advance
- [ ] Vote + XP + level display
- [ ] Mod skip / clear chat

### Cursor prompt — Phase 8

```
Implement Phase 8 (Deploy & polish) for ITVLive v2 per docs/WORKING-PLAN.md.

Remove dev-only endpoints from production, add deploy config, verify env vars in .env.example,
and run through the smoke test checklist. Tell me deploy steps for Render + Atlas.
```

### Notes

```
(your notes here)
```

---

## Quick reference — npm scripts

```bash
npm install
cp .env.example .env   # edit as needed
npm run dev            # node --watch server/index.js
npm start              # production start
```

**Health:** `GET http://localhost:3000/health`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial v2 working plan; Phase 0 marked complete |
