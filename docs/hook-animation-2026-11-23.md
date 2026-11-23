# Hook Rush animation handoff — Codex, 2026-11-23

Base: Claude 19e3ca7, pulled with `--ff-only` before editing. This update changes drawing and artwork only. The complete engine prefix before the Drawing section (constants, rules, snapshots and network) was compared byte-for-byte after newline normalization with 19e3ca7. player.js, host.js, hook.css, audio.js, permanent URLs, QR and version-refresh logic are unchanged.

## Connected now

All new live pictures load through the existing art.js preload/decode/timeout mechanism. Each drawing branch independently keeps its previous procedural fallback if its picture is unavailable. No per-frame blur, filter or offscreen canvas allocation was added.

| Art key | Compressed size in pixels | Drawing / animation |
| --- | --- | --- |
| fx-ice-arrow | 128×64 | drawShot: rotates along s.a, moving tail and streaks; aimDots: advancing chevrons and arrow at existing range |
| fx-ice-burst | 128×128 | drawFx ice: eased expansion, gentle rotation, outward snow crystals, fade |
| fx-slime-ball | 64×64 | drawShot slime: original flight timing/path, stretch and spin |
| fx-slime-splash | 128×128 | drawFx slime: expanding splash and arcing droplets |
| fx-slime-puddle | 192×192 | drawZone: wobbling jelly, rising bubbles, solid owner-team rim exactly at radius 110; goo: small flattened jelly under feet; aimDots slime: transparent landing disk, range ring and moving dotted arc |
| fx-shield-bubble | 128×128 | bubble: breathing transparent rim and orbiting sparkle; drawSpot: float/pulse with existing shield icon, recharge ring with a faint empty shield |
| fx-ice-block | 128×128 | ice: clear center, breathing icy frame and small drifting flakes |
| fx-dizzy-star | 48×48 | dizzy: three rotating/orbiting stars at different sizes |
| card-slow | 64×64 PNG | Existing player.js card icon lookup picks it up automatically; ICON.slow stays as fallback |

The eight effect files are alpha WebP. The new live files total **46,418 bytes**; the full runtime art pack is **31 images / 258,956 bytes**. The original 4-second timeout and fallback behavior is unchanged. There are no new runtime dependencies or CSS changes.

## Future hook-player artwork — not connected

Files are retained in `design-samples/hook-animation-2026-11-23/`, outside deployed dist and outside the art.js manifest. These three images total 21,964 bytes; all new live and future pictures together total **68,382 bytes**, below the requested 200 KB:

- `hook-caught-sample.webp`: visual concept showing a gentle hook/loop next to a tilted kitten. This includes the kitten; it is a pose/composition reference, not a replacement sprite for all ten animals.
- `hook-dust-sample.webp`: cream dust and lavender speed-line effect, rightward; can be flipped later.
- `hook-hit-sample.webp`: coral/lavender celebratory hook burst. No baked words; Claude can overlay the game's font for 「勾到了！」 after implementing the mechanic.

No player hooking, dragging state, collisions, hook target types or new snapshot fields have been implemented here. Claude should begin those changes only after Codex reports completion.

## Verification and limits

- `npm test`: **120/120 passed**, including a new animation/fallback test. Art tests also verify alpha, dimensions and budgets. The rendering test checks unchanged snapshot data, owner colour, exact 110 radius, expiry, partial image failure and absence of per-frame blur/filter.
- `node --check` on changed runtime scripts and `git diff --check` pass. No CSS changed, so dark.css regeneration was not needed.
- Native Canvas renders checked at **1280×720** and **844×390**, including both aim hints, frost, shield, stars, all three team rims, several animation phases and missing-image fallback. Screenshots and local scripts are in the sample directory above.
- 20 bots run and rendered in the native Canvas harness; local frame-drawing time around 1.5–2.3 ms with warm caches in these short samples. These measurements are not a phone benchmark and do not include browser UI/network costs.
- **No browser-control tool is available in this Codex session. Real host.html?demo&local plus student ?local dual-tab and physical phone/touch acceptance were not performed.** Do not describe the Canvas snapshots as browser screenshots.

## Provenance

Original art generated with the built-in imagegen tool, then cropped to alpha bounds, resized and compressed with the installed Sharp tool runtime. Exact prompt set and source basenames are in `design-samples/hook-animation-2026-11-23/prompts.json`. The local `build-sources.json` holds absolute source paths and is intentionally not committed. Compression and QA scripts are local tools, not production dependencies.
