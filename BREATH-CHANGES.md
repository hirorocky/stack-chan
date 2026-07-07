# breath branch — modifications to upstream stack-chan

This branch carries the firmware-side changes for the
[hirorocky/breathing](https://github.com/hirorocky/breathing) exploration
(a quiet "breathing" StackChan — no drawer UI, no AI-agent mode). It is meant
to be checked out as a submodule of that repository; `manifest_breath_deploy.json`
references modules under `../../../overlay/` there.

Per Apache License 2.0 §4(b), the following upstream files are modified on this
branch (each change is also marked with a `breath` comment in place where the
file format allows):

| File | Change |
|---|---|
| `firmware/package.json` | `build:breath` / `deploy:breath` npm scripts |
| `firmware/stackchan/manifest.json` | TypeScript `Disposable` lib |
| `firmware/stackchan/main.ts` | `breathHostMod`: skip MOD-partition override; register `renderer-breath` and make it the default when `breathHostMod` is set |
| `firmware/stackchan/default-mods/mod.ts` | import `breath/mod` as the default mod |
| `firmware/stackchan/renderers-piu/app-controller.ts` | do not open the drawer UI on face tap when `breathHostMod` |
| `firmware/stackchan/robot.ts` | gaze normalization fix: `Math.cos` → `Math.sin` (cos is even — direction sign was lost; upstream PR candidate) |
| `firmware/platforms/m5stackchan_cores3/manifest.json` | register `m5stackchan/battery` module |
| `firmware/platforms/m5stackchan_cores3/host/provider.js` | capture the AXP2101 SMBus io for battery readout |

Added (not upstream files):

- `firmware/platforms/m5stackchan_cores3/battery-registry.js` — AXP2101 battery readout + DLDO1 backlight control
- `firmware/stackchan/manifest_breath_deploy.json` — breath deploy manifest
- `firmware/scripts/mod-cores3.sh` — CoreS3 mod-flash wrapper (reset + retry)

License: Apache-2.0, unchanged from upstream (see `LICENSE`).
