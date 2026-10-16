# +1 Double Jump Escape — game client

A browser remake of the Roblox game *+1 Double Jump Escape*: walk, jump or
bounce on a jump pad to level up, then run and double jump your way over 20
stages of lava. Earn Wins, buy boots (each pair opens two new stages), jump
pads, pets and permanent upgrades, reach level 15 and rebirth for another
jump. Up to 8 players per lobby.

React 19 + @react-three/fiber, custom box physics (`src/game/physics.js`),
Colyseus for multiplayer (server: `../1-double-jump-escape-server`) and the
Boxity SDK (`window.Legion.SDK`) for accounts, avatars and the platform's
features.

## Run it

```bash
npm install
cp .env.example .env     # check the slug / game id
npm run dev
```

Start the server too (`npm run dev` in the server repo, port 2567). Locally the
client connects to `ws://<this host>:2567`; when hosted it goes through the
Boxity matchmaker (`VITE_GAME_ID`).

Dev-only URL switches:

| | |
| --- | --- |
| `?autoplay&name=Bob&uid=bob` | join as a throwaway `test:bob` profile (never saved) |
| `?tp=7` | start on Stage 7's checkpoint |
| `?blocky` | use the blocky fallback avatar |

`window.__game` (dev only) exposes the player, camera, input, store and layout.

**Dev tools** (only in `npm run dev`, never in the published build): press
**F2** for the panel.

| | |
| --- | --- |
| `[` / `]` | previous / next stage, at its doorway before the long jump in |
| `\` | the end of the stage you're on (by the Wins pads) |
| Jump in / Start / End | per stage: the doorway, the landing past the long jump, the pads |
| God mode | lava and hazards don't kill (you walk on the lava) |
| Open rebirth doors | walk through every rebirth door |
| Move with | your real build, each stage's recommended build (for the jump ahead), or a custom level / boots / rebirths |

The panel also shows the next long jump's length and whether the build you're
moving with makes it. Dev changes only affect your screen: the server keeps
your real stats and doesn't pay pads after a dev teleport.

## How the game plays

- **Every step and every jump is XP** (times your boots, rebirths, pets and
  perks; 1 in 25 is a lucky x5), and each one pops up as a star and a number.
  The jump pads in the lobby bounce you and pay at their rate — training
  even while you're away from the keys. The first pad is free (2 jumps a
  second), the Super and Turbo Pads are bought with Wins (20 and 150; kept
  for good), and the Hyper, Mega and Rainbow Pads open with 3, 4 and 5
  rebirths.
- **Levels give jumps** (in the air): 1 at level 0, 2 at level 4, 3 at 8, 4 at
  12, 5 at 15. MAX is level 15 for everyone; every rebirth adds one more jump
  for good (so 2-6 jumps after the first), x2 XP and +50% Wins.
- **Boots give speed** (faster = longer jumps; levels don't) and multiply XP,
  and every pair opens two stages: Fluffy Slippers 1-2, Sneakers 3-4, Bouncy
  5-6, Rocket 7-8, Lava 9-10, Frost 11-12, Thunder 13-14, Galaxy 15-16,
  Rainbow 17-18, Diamond 19-20. They're bought in order with Wins; Sneakers
  cost exactly Stage 1's 3 Wins. The limited Abyssal Hydra Boots (500 for
  everyone) are the flex at the top: no stage needs them.
- **Every stage needs exactly its jumps and its boots** (and rebirths in
  World 2). It starts with a short corridor with "Stage N" and what it needs
  over the mouth — a door across it until you own the boots — then a long jump
  in, then a few big, wide platforms. Every gap in a stage is sized for that
  stage's jumps: one jump fewer (or the boots before) can't make it.
  `npm run check:course` proves every gate and hop.
- **Falling** sends you back to the lobby (so does collecting Wins); the
  Teleport button (or the checkpoint door) takes you to any stage you've
  reached, never further.
- **New players** get a guide: arrows on the ground and a banner lead them to
  the jump pad (a few seconds of training), through Stage 1 for its 3 Wins and
  back to buy the Sneakers (`src/game/tutorial.js`).
- **Rebirth** at level 15: +1 jump, x2 XP and +50% Wins for good, new eggs,
  better jump pads and (at 1 rebirth) World 2. It resets your level and XP;
  you keep Wins, boots, pads, pets, perks, stages and titles. The rebirth
  count sits on the left of the HUD.
- **Two worlds.** World 1 is stages 1-10, out of the lobby. World 2 is stages
  11-20, out of its own purple lobby through the portal at the back of the
  lobby (1 rebirth). Worlds live in `WORLDS` (`src/shared/gameData.js`).
- **The lobby** is an open park: the boots gallery down the left (slippers at
  the back, the best pair by the gate), the jump pads right of the spawn, the
  pet eggs, the World 2 portal and the leaderboards at the back, and the
  castle gate to Stage 1 in front. Walk up to a stand and press **E**.
- **The HUD**: on the left only Rebirth (R), Shop (B: Boots, Pets, Trails and
  Upgrades tabs), Teleport (T) and Gifts (G), with the rebirth count below
  them. One next goal at the top, and at most one red "!" on the most useful
  thing to do. (P is left alone: on Boxity and CrazyGames it opens the
  platform's pause menu.)
- **Keep playing**: playtime gifts, a free chest every 15 min, a 7-day daily
  streak, offline earnings (30% of your best jump pad, up to 8 hours), an AFK
  bonus (10 min on a jump pad = 5 min of 2x XP), stage stars, titles, pets that
  follow you, leaderboards and popups when other players level up or rebirth.
- **Everyone sees everyone**: runs (a Naruto run at speed, a bouncy idle),
  jumps and flips, falls, jump pad bounces, emotes, boots, trails, pets and
  bursts over players who level up or rebirth.

## Boxity

All of it is in `src/bloxity/` (`boxity.js` holds every SDK call besides login
and avatars) and `src/net/boxityGame.js` (what the game does with them):

- login (`onUserChanged`), avatars and body proportions, the loading screen;
- the token goes with every join, and the server checks it with Boxity; a
  first-time account keeps the progress it made as a guest;
- joining through the Boxity matchmaker (a fresh endpoint and client every
  time, with a backoff for cold starts); `?roomId=` (friend invites, Boxity's
  Join buttons) joins that room, and signing in mid-game rejoins the same room;
- `updateRoom`, `gameplayStart` / `gameplayEnd`, friend-join notices
  (`playerInRoom` / `playerJoined`);
- the portal menu's settings: master and music volume, graphics, show FPS,
  camera sensitivity and chat bubbles;
- emotes (`registerFeature('emotes')`): played on the standard rig and shown to
  everyone in the room; walking ends them;
- chat: each message in a bubble over its sender (above their name tag);
- the menu's Reset Character (back to the lobby, like a fall).

Gems aren't used: everything is bought with Wins.

## Performance

The world is a few merged meshes per material and zone; the lobby's stands
and pads put their static parts in the same batch; static objects don't
update their matrices every frame; only walls, platforms, boards and players
cast shadows. The resolution drops on its own when the frame rate does, and if
that isn't enough the graphics step down (High → Medium → Low) until the
player picks a setting themselves.

## Balance

All the numbers live in `CONFIG` and the tables in
`src/shared/progression.js`. `npm run simulate` plays an average player (55%
walking and jumping by hand, 35% on their best jump pad, buying what's worth
it) and prints when each stage, pair of boots and rebirth happens, against the
targets (9, 13, 18, 23, 32, 43 minutes per rebirth), and whether any pair of
boots holds a player up. `--levels` prints every level; `--fit` fits the XP
curve to the targets; `--balance` fits the XP curve and the boot prices
together. Saves carry `saveVersion` and old ones are brought up to date by
`migrateProfile` when the player joins.

## Code map

| | |
| --- | --- |
| `src/shared/` | rules shared with the server: `progression.js` (levels, jumps, boots, jump pads, stages' needs, pets, perks, rewards, save migration), `gameData.js` (stage looks, worlds, trails) and `layout.js` (the lobby and the course) — run `npm run sync-shared` in the server after editing |
| `src/store/` | `gameStore.js` (server state, panels, toasts, settings) and `progression.js` (everything the HUD shows about progress, derived from the server's numbers) |
| `src/game/` | scene, physics, local player, remote players, the new-player guide, emotes, pets, bridges, camera, speed blur |
| `src/game/character/` | avatar wrapper, boots, chevron trail, blocky fallback |
| `src/game/world/` | world builder, textures, materials, signs, models, decor, sky |
| `src/net/` | `connection.js` (Colyseus; turns server codes into effects) and `boxityGame.js` |
| `src/ui/` | HUD, windows, touch controls, effects |
| `src/bloxity/` | Boxity SDK wrapper and avatar assembly |

## Deploy

`.github/workflows/deploy.yml` builds the site and uploads it to Boxity
hosting on every push (`main` → prod, `dev` → dev). It needs the repository
secret `LEGION_DEPLOY_TOKEN` and, if your slug differs from the game id, the
repository variable `GAME_SLUG`. The game server deploys from its own repo.
