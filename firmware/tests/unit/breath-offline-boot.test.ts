import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const mainBreathSource = readFileSync('stackchan/main-breath.ts', 'utf8')
const breathModSource = readFileSync('../../overlay/mods/breath/mod.ts', 'utf8')

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

  test('always starts breath power control independently of the upstream power-button flag', () => {
    assert.match(breathModSource, /showDeployNotice\(robot\)\s+try \{[\s\S]*?startPowerControl\(robot\)/)
    assert.doesNotMatch(breathModSource, /if\s*\([^)]*enablePowerButton[^)]*\)\s*startPowerControl\(robot\)/)
  })
})
