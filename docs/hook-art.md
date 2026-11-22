# Hook Rush artwork handoff — 2026-11-22, Codex

Integrated over Claude's current code, including 318c434 (students tap a room themselves). No rules, constants, network, snapshots, storage IDs, QR or version-refresh logic changed. host.js is unchanged.

## Runtime

- `dist/hook/art.js`: independently loads and decodes 21 optional images; 4-second timeout per image, missing/failed/late images retain procedural fallback. URLs inherit the deployed version.
- `boot.js`: starts the existing host.js/player.js after preload settles, including failure. Both HTML pages load art.js, engine.js, then boot.js.
- `engine.js`: small visual branches in drawAnimal, animalIcon, scenery, drawFish, drawDrop and rushGlow only. Animal index order is unchanged. Team scarves, mats, text, ice, rods, hooks and gameplay effects remain procedural. Fish '?' and '×2' remain upright when mirrored.
- Static scenery stays in the existing offscreen canvas cache; artwork revision invalidates that cache and avatar cache once. No per-frame shadowBlur. Gold light is clipped to the unchanged C.SEA.
- `player.js`: only the card icon markup changes; original SVG/text icons remain fallback. `hook.css`: one image sizing rule.
- `dist/hook/img/`: all runtime images total 167,794 bytes, below the 400,000-byte budget. 10 animals (128×128 PNG), 3 fish (96×64 PNG), 6 item/pickup PNGs, 1200×675 background and 512×256 transparent light texture. Original artwork generated with built-in imagegen, then downscaled/palette-compressed with Sharp. No source originals or new runtime dependencies included.

## Validation

- `npm run dark`, `npm test`: 109/109 passed; five new art tests cover budget/alpha/dimensions, decode/versioning, failures/timeouts, entry boot and rendering/cache fallback.
- All changed runtime JS passes `node --check`; `git diff --check` passes.
- Local native Canvas game simulation with 20 bots, 1280×720 and 844×390, regular/rush/fallback snapshots visually inspected. Approximate mean drawing time 3.3 ms desktop-size and 2.3 ms landscape-size on this computer; this is NOT a phone benchmark.
- Browser control pipe unavailable. Actual host.html?demo&local + student ?local dual-tab/touch/end-screen QA has NOT been run by Codex. Still needs browser/phone verification; do not describe Canvas snapshots as browser screenshots.

## Local design artifacts (outside deployed dist)

`design-samples/hook-v1/`: prompt sets, original production handoff, new-item-prompts.json, rush-glow-prompt.txt, compression helper, render-qa.cjs, avatars.png, game/rush/fallback snapshots and canvas-performance.json. These are local working artifacts, not all committed. `integration-draft/*.txt` are historical drafts, superseded by the runtime files.

Cover update: the user requested the student entrance cover too. `cover-v1.webp` is now copied to `dist/hook/img/cover.webp` (44,744 bytes) and preloaded. The room-selection page has an illustration above its title and room buttons in portrait, and a two-column layout in short landscape windows. Only this entrance uses `.room-cover`; the game, animal picker, audio and room joining logic stay unchanged. Total artwork is now 22 images / 212,538 bytes. Browser preview pipe is still unavailable for Codex; 113 automated tests pass. Claude's concurrent player-disconnect changes are excluded from the cover commit.

The discarded first glow generation looked like a cat; runtime rush-glow.webp uses the corrected texture source exec-070a431f-6cd8-4572-91e7-24b83bfcec35.png.

Prompt direction: original cute matte 2.5D gouache, soft warm lighting, plump simple silhouettes, transparent sprites, consistent scale, no franchise likeness. New assets: pearl-gold star-accented fish; lavender/rose '?' pickup; apricot rising arrow/cloud; pale blue snowflake; mint check shield; gold ×2 coin; lavender three-hook fan; subtle transparent golden lake light. Exact prompts remain in the local files above.
