# +1 Double Jump Escape — game client

A browser remake of the Roblox game *+1 Double Jump Escape*: jump to level up
(or bounce on a jump pad), then run and double jump your way over 20 stages
of lava. Earn Wins, buy boots (each pair opens two new stages), pets and
permanent upgrades, reach MAX and rebirth. Up to 8 players per lobby.

React 19 + @react-three/fiber, custom box physics (`src/game/physics.js`),
Colyseus for multiplayer (server: `../1-double-jump-escape-server`) and the
Bloxity SDK for accounts and avatars.

## Run it

```bash
npm install
cp .env.example .env     # check the slug / game id
npm run dev
```

Start the server too (`npm run dev` in the server repo, port 2567). Locally the
client connects to `ws://<this host>:2567`; when hosted it goes through the
Bloxity Legion matchmaker (`VITE_GAME_ID`).

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

- **Every jump is XP.** The jump pads in the lobby bounce you for free and
  pay at their rate (2 jumps a second for the first, up to 12 for the
  Rainbow Pad) — training even while you're away from the keys. 1 jump in 25
  is a lucky x5.
- **Levels give jumps** (in the air): 1 at level 0, 2 at level 4, 3 at 8, 4 at
  12, 5 at 15, and on. The first levels come in seconds (2 jumps in about 20
  seconds), later ones take a minute or two. Every rebirth raises the MAX
  level (15, 20, 26, 33, 41, 50, 60, ...).
- **Boots give speed** (faster = longer jumps) and multiply XP, and every pair
  opens two stages: Fluffy Slippers 1-2, Sneakers 3-4, Bouncy 5-6, Rocket 7-8,
  Lava 9-10, Frost 11-12, Thunder 13-14, Galaxy 15-16, Rainbow 17-18, Diamond
  19-20. They're bought in order with Wins. The limited Abyssal Hydra Boots
  (500 for everyone) are the flex at the top: no stage needs them.
- **Every stage needs exactly two things** (three in World 2): a number of
  jumps and a pair of boots (and rebirths). It starts with a short corridor
  with "Stage N" and what it needs over the mouth — a door across it until you
  own the boots — then one long jump that one jump fewer, or the boots
  before, can't make. After that come a few big, wide platforms with easy
  hops, then the Wins pads. Stages alternate: one needs new boots, the next
  one more jump. `npm run check:course` proves every gate and hop.
- **Rebirth** at MAX: x2 XP for good, a higher MAX level, a better jump pad,
  new eggs and (at 1 rebirth) World 2. It resets your level and XP; you keep
  Wins, boots, pets, Wins Shop perks, stages and titles.
- **Two worlds.** World 1 is stages 1-10, out of the lobby. World 2 is stages
  11-20, out of its own purple lobby through the portal at the back of the
  lobby (1 rebirth). Worlds live in `WORLDS` (`src/shared/gameData.js`).
- **The lobby** is an open park: the boots gallery down the left (slippers at
  the back, the best pair by the gate), the jump pads right of the spawn, the
  pet eggs, the World 2 portal, the Wins Shop and the leaderboards at the
  back, and the castle gate to Stage 1 in front.
- **Wins** buy boots, pet eggs, Wins Shop perks (Jump Power, Winner, Swift
  Feet, Egg Luck, Pet Slots), trails, passes and XP packs: walk up to it in
  the lobby and press **E**.
- **The HUD** shows one next goal at the top (a stage, the boots it needs,
  levels, rebirth) and at most one red "!" on the most useful thing to do.
- **Keep playing**: playtime gifts, a free chest every 15 min, a 7-day daily
  streak, offline earnings (30% of your best jump pad, up to 8 hours), an AFK
  bonus (10 min on a jump pad = 5 min of 2x XP), stage checkpoints, titles,
  pets that follow you, leaderboards and popups when other players rebirth.

## Balance

All the numbers live in `CONFIG` and the tables in
`src/shared/progression.js`. `npm run simulate` plays an average player (55%
jumping by hand, 35% on their best jump pad) and prints when each stage,
pair of boots and rebirth happens, against the targets (9, 13, 18, 23, 32, 43
minutes per rebirth), and whether any pair of boots holds a player up.
`--levels` prints every level; `--fit` fits the XP curve to the targets;
`--balance` fits the XP curve and the boot prices together. Saves carry
`saveVersion` and old ones are brought up to date by `migrateProfile` when
the player joins (version 2's step boost, Fast Learner and Spring Boots are
paid back in Wins).

## Code map

| | |
| --- | --- |
| `src/shared/` | rules shared with the server: `progression.js` (levels, jumps, boots, jump pads, stages' needs, pets, perks, rewards, save migration), `gameData.js` (stage looks, worlds, trails) and `layout.js` (the lobby and the course) — run `npm run sync-shared` in the server after editing |
| `src/store/` | `gameStore.js` (server state, panels, toasts) and `progression.js` (everything the HUD shows about progress, derived from the server's numbers) |
| `src/game/` | scene, physics, local player, remote players, pets, breaking bridges, camera, speed blur |
| `src/game/character/` | avatar wrapper, boots, chevron trail, blocky fallback |
| `src/game/world/` | world builder, textures, materials, signs, models, decor, sky |
| `src/net/connection.js` | Colyseus connection; turns server codes into effects |
| `src/ui/` | HUD, windows, touch controls, effects |
| `src/bloxity/` | Bloxity SDK wrapper and avatar assembly |

## Deploy

`.github/workflows/deploy.yml` builds the site and uploads it to Bloxity
hosting on every push (`main` → prod, `dev` → dev). It needs the repository
secret `LEGION_DEPLOY_TOKEN` and, if your slug differs from the game id, the
repository variable `GAME_SLUG`.
