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
| `firmware/biome.json` | 親リポジトリの breath 用 Biome 設定との併用 |
| `firmware/package.json` | strict TypeScript / Biome 品質ゲートと debug/release の `build:breath` / `deploy:breath` npm scripts |
| `firmware/stackchan/manifest.json` | TypeScript `Disposable` lib |
| `firmware/stackchan/main.ts` | `breathHostMod`: skip MOD-partition override; register `renderer-breath` and make it the default when `breathHostMod` is set. Avoid opening a second display-touch driver because Piu owns the CoreS3 FT6x06 instance. E3: `driverKey` now prefers an explicit `driver.type` (config/preference) over the `breathHostMod` none/scservo default, so breath can opt into a real servo driver; `Driver(driverPrefs)` construction is wrapped in try/catch, falling back to `NoneDriver` on throw so a UART/servo fault can't blank the screen |
| `firmware/stackchan/microphone.ts` | release a failed AudioIn allocation immediately so breath capture retries do not retain the input buffer until GC |
| `firmware/stackchan/default-mods/mod.ts` | import `breath/mod` as the default mod |
| `firmware/stackchan/renderers-piu/app-controller.ts` | do not open the drawer UI on face tap when `breathHostMod` |
| `firmware/stackchan/renderers-piu/behaviors/face.ts` | avoid invalidating the whole face when its breath offset is unchanged |
| `firmware/stackchan/drivers/m5stackchan-servo-driver.ts` | expose a shared servo enable gate; OFF cuts the PY32 servo power and blocks every torque, position, and position-read command until re-enabled |
| `firmware/stackchan/led/py32-io-expander.ts` | add a batched LED RAM write to avoid per-pixel I2C transactions |
| `firmware/stackchan/robot.ts` | gaze normalization fix: `Math.cos` → `Math.sin` (cos is even — direction sign was lost; upstream PR candidate). E3: the head-follow gaze threshold (`updatePose`, was a fixed `Math.PI/6` = 30°) is now `config.gazeServoFollowDeg ?? 30` (breath sets 45° to keep idle saccades from moving the neck servo as often). Expose `toneSequence` for one-output-session breath sound contours and a shared audio-output volume control. When breath disables servo position polling, cache each successful `setPose` command instead of reading SCServo positions every 100 ms. Allow hardware drivers to expose an optional shared enable gate to the breath settings UI |
| `firmware/stackchan/tone.ts` | add queued multi-tone playback in one `pins/audioout` session; keep the existing single-tone API as a one-step sequence; apply one master output-volume multiplier to tones and audio resources |
| `firmware/tests/unit/breath-offline-boot.test.ts` | guard breath startup against optional hardware failures, AudioIn close-during-callback regressions, and multicast mDNS probing on isolated networks |
| `firmware/tests/unit/deploy-selection.test.ts` | verify the breathing deploy scripts prefer USB when connected and preserve explicit transport selection |
| `firmware/platforms/m5stackchan_cores3/manifest.json` | register `m5stackchan/battery`; use the polling FT6x06 driver so Piu receives continuous coordinates for swipe gestures |
| `firmware/platforms/m5stackchan_cores3/host/provider.js` | capture the AXP2101 SMBus io for battery readout; select the polling CoreS3 touch wrapper |
| `firmware/platforms/m5stackchan_cores3/setup-target.js` | preserve raw AXP2101 power-key event bits, disable the OFFLEVEL hardware cut so breath can clear PY32 LEDs before orderly software power-off, and suppress the upstream startup sound for breath deploys |

Added (not upstream files):

- `firmware/platforms/m5stackchan_cores3/battery-registry.js` — AXP2101 battery readout, DLDO1 backlight control, power-key IRQ enable, power-on source and software power-off
- `firmware/platforms/m5stackchan_cores3/M5StackChanCoreS3Touch.js` — CoreS3 virtual-button compatibility wrapper over the polling FT6x06 driver
- `firmware/stackchan/manifest_breath_deploy.json` — breath deploy manifest
- `firmware/stackchan/manifest_breath_lean.json` — breath-only host manifest without AI, speech, BLE, camera preview, or alternate renderer assets
- `firmware/stackchan/main-breath.ts` — breath-only host entry point that initializes only the required renderer, servo, microphone, audio, LED, Si12T touch panel, Wi-Fi, and MOD services
- `firmware/stackchan/breath-policy-loader.ts` — versioned loader for optional hardware-independent breath policy MODs with builtin fallback
- `firmware/tsconfig.breath.json` — strict TypeScript quality gate for breathing overlay modules
- `firmware/scripts/mod-cores3.sh` — CoreS3 mod-flash wrapper (reset + retry)

License: Apache-2.0, unchanged from upstream (see `LICENSE`).
