import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const mainBreathSource = readFileSync('stackchan/main-breath.ts', 'utf8')
const microphoneSource = readFileSync('stackchan/microphone.ts', 'utf8')
const breathModSource = readFileSync('../../overlay/mods/breath/mod.ts', 'utf8')
const devServerSource = readFileSync('../../overlay/mods/breath/dev/dev-server.ts', 'utf8')
const breathLeanManifestSource = readFileSync('stackchan/manifest_breath_lean.json', 'utf8')
const nativeAudioInSource = readFileSync('../../vendor/moddable/modules/io/audioin/esp32/audioin.c', 'utf8')

describe('breath offline boot', () => {
  test('starts Wi-Fi in the background before continuing host initialization', () => {
    assert.match(mainBreathSource, /function startWiFiInBackground\(\): void/)
    assert.match(
      mainBreathSource,
      /boot\.breathBootStage = 'network-start'\s+startWiFiInBackground\(\)\s+boot\.breathBootStage = 'policy'/,
    )
    assert.doesNotMatch(mainBreathSource, /await\s+(?:connectWiFi|startWiFiInBackground)/)
  })

  test('treats missing credentials and connection failures as offline operation', () => {
    assert.match(mainBreathSource, /Wi-Fi credentials are not configured; continuing offline/)
    assert.match(mainBreathSource, /Wi-Fi connection failed; continuing offline/)
    assert.match(mainBreathSource, /Wi-Fi start failed; continuing offline/)
    assert.match(mainBreathSource, /globalThis\.network\.connect\(/)
  })

  test('starts development networking only after Wi-Fi gets an address', () => {
    assert.match(mainBreathSource, /Wi-Fi connected\\n'\)\s+startDevTools\(\)/)
  })

  test('uses the UDP beacon without starting mDNS probing on multicast-blocked networks', () => {
    assert.doesNotMatch(devServerSource, /from ['"]mdns['"]|new MDNS|startMdns/)
    assert.doesNotMatch(breathLeanManifestSource, /modules\/network\/mdns/)
  })

  test('always starts breath power control independently of the upstream power-button flag', () => {
    assert.match(breathModSource, /showDeployNotice\(robot\)\s+try \{[\s\S]*?startPowerControl\(robot\)/)
    assert.doesNotMatch(breathModSource, /if\s*\([^)]*enablePowerButton[^)]*\)\s*startPowerControl\(robot\)/)
  })

  test('injects the CoreS3 Si12T touch panel into the breath Robot when available', () => {
    assert.match(mainBreathSource, /import TouchPanel from 'touch-panel'/)
    assert.match(
      mainBreathSource,
      /const touchPanel = globalEnv\.device\?\.sensor\?\.TouchPanel\s+\? new TouchPanel\(globalEnv\.device\.sensor\.TouchPanel as ConstructorParameters<typeof TouchPanel>\[0\]\)\s+: undefined/,
    )
    assert.match(mainBreathSource, /new Robot\(\{[\s\S]*?touchPanel,/)
  })

  test('releases a failed AudioIn before breath retries capture', () => {
    assert.match(
      microphoneSource,
      /this\.#audioIn = audioIn\s+try \{\s+audioIn\.start\(\)[\s\S]*?catch \(error\) \{[\s\S]*?audioIn\.close\(\)[\s\S]*?this\.#audioIn = null\s+throw error/,
    )
    assert.match(breathModSource, /startMic\(robot\)[\s\S]*?\}, 1000\)/)
  })

  test('releases AudioIn closed synchronously inside onReadable', () => {
    assert.match(
      nativeAudioInSource,
      /input->pendingCallback = 0;[\s\S]*?xsEndHost\(input->the\);[\s\S]*?if \(kStateTerminated == input->state\)\s+c_free\(input\);/,
    )
  })
})
