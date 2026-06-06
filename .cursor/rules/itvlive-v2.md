---
description: ITVLive v2 architecture, roles, sockets, and product rules
alwaysApply: true
---

# INTO THE VOID (ITV) v2 — Project Rules

## Stack

Node 18+, Express, Socket.io, Mongoose, vanilla HTML/CSS/JS in `public/`. No React/Vue/webpack unless explicitly requested.

## Visual theme

Reuse v1 theme files: `public/css/variables.css`, `layout.css`, `components.css`, and `public/img/` branding. Layout dimensions are tuned in `public/css/layout-config.css` (load order: variables → layout-config → layout → components).

Do **not** port v1 `room.js` or `app.js` logic wholesale — v2 room/player/queue code is written fresh against these rules.

## Main Stage layout

| Area | Purpose |
|------|---------|
| Top nav | Brand, links, user slot |
| Left | Personal playlists (multiple; one **active** feeds the DJ queue) |
| Centre | YouTube player + controls + vote |
| Right | Live Chat, Online, DJ Queue tabs |
| Bottom | The Pit — ordered track filmstrip (now playing + up next) |

## Socket events — separation of concerns

| Event | Payload focus | Must NOT |
|-------|---------------|----------|
| `player:sync` | `videoId`, `startedAt`, `serverTime`, track boundary | Include chat, online list, or queue churn |
| `room:state` | Chat, online users, queue order, pit lineup, banners | Reload or seek the YouTube iframe |

Clients handle `player:sync` only in the player module. UI panels subscribe to `room:state` (or granular derivatives later). Never merge these into one fat payload on every chat message.

## Track end — server timer is PRIMARY

- The **server** owns track duration and `startedAt`; a server timer fires at track end to advance the queue.
- Client `player:ended` / YouTube ENDED state is a **secondary** signal for UX only — never the sole authority.
- Guard against double-advance (timer + client) with an idempotent `playSessionId` or equivalent.

## Guests vs registered users (no auth yet)

Until auth lands, treat everyone as a guest stub. Design for:

| Mode | Playlist | Queue | Chat | Listen |
|------|----------|-------|------|--------|
| Guest | No | No | Yes | Yes |
| User (future) | Yes (multiple) | Yes | Yes | Yes |

Guests: **chat + listen only** — no personal playlist edits, no queue join, no voting (until levels apply).

## Progression — XP, not tokens

- Use **XP** for engagement rewards. Do not introduce a "token" currency or Token Shop in v2.
- **Levels 1–60** (earned). Store `level` on the user; thresholds live in `server/config/levels.js` when implemented.
- Separate **staff** permissions (`staffRole`: `null`, `resident`, `mod`, `admin`) from level. **No Host role** in v2 — no host-only queue powers or mic toggle.

## Playlists

- Each user may have **multiple named playlists**.
- Exactly one **active playlist** per user; its head (or configured cursor) is what enters the DJ queue on join.
- Import/export text format — one track per line:

```
Track Title https://www.youtube.com/watch?v=VIDEO_ID
Another Title https://youtu.be/VIDEO_ID
```

Title and URL on the same line, separated by whitespace. Export must round-trip this format.

## Sessions — one tab per account

When auth exists, one active socket session per `userId`. A new tab/login invalidates or replaces the previous connection. Enforce on the server, not client-only.

## Server authority

Queue order, skips, votes, XP grants, permissions, and track timing are validated server-side. Never trust the client for privileged actions.

## Player sync rules

- One seek per track boundary for late joiners: `serverTime - startedAt`, clamped to duration.
- No drift-correction loop, `player:tick`, or periodic resync during playback unless explicitly requested.
- Load new video at 0 only on track change via `player:sync`.

## Development

1. Smallest correct change; match existing file patterns.
2. No secrets in git — `.env` only; document in `.env.example`.
3. Do not commit unless the user asks.
4. YouTube: validate URLs server-side; prefer official Data API when added; never download/re-host audio.

## Key paths

```
public/                 Static UI (index.html, css/, js/, img/)
public/css/layout-config.css   Layout dimension variables
server/index.js         Express + /health + static + Socket.io
server/sockets/         Real-time handlers
server/config/db.js     Mongoose connection (optional without MONGODB_URI)
```
