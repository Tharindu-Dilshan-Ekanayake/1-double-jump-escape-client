# +1 Double Jump Escape — game client

A browser remake of the Roblox game *+1 Double Jump Escape*: run and double
jump your way over 20 stages of lava, earn Wins, buy Boots and Trampolines,
level up to MAX and rebirth. Up to 8 players per lobby.

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

## How the game plays

- **Jump** is the XP. Boots pay Jump every second you play (more on a
  trampoline you own), and every jump pays the same again. Jump fills the
  level bar; there are 15 levels (MAX).
- **Every level** gives +1 jump in the air (up to 5), more run speed and a
  higher jump. Boots add speed and jump height too. Hold SPACE to keep jumping.
- **20 stages**: stepping platforms with spikes, lasers and sweepers, then a
  long gap or a tall wall sized for the stage's recommended level / boots /
  rebirths (`npm run check:course` proves each one is clearable). The Return
  pad at the end pays Wins and sends you home; the pink pad pays 2x with the
  2x Wins pass. Stages 11+ sit behind rebirth doors.
- **Wins** buy everything (Boots, Trampolines, Trails, passes, Jump packs):
  walk up to a pedestal or trampoline in the lobby and press **E**.
- **Rebirth** at MAX: back to level 1 with +50% Jump, +10% Wins and more speed
  and jump height per rebirth.
- **Keep playing**: goals banner, playtime gifts, a free chest every 15 min, a
  7-day daily streak, revive (pay Wins to carry on), stage checkpoints,
  leaderboards and the limited Abyssal Hydra Boots (500 for everyone).

## Code map

| | |
| --- | --- |
| `src/shared/` | rules shared with the server: `gameData.js` (economy) and `layout.js` (the map) — run `npm run sync-shared` in the server after editing |
| `src/game/` | scene, physics, local player, remote players, camera, speed blur |
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
