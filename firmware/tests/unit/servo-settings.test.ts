import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const driverSource = readFileSync('stackchan/drivers/m5stackchan-servo-driver.ts', 'utf8')
const settingsSource = readFileSync('../../overlay/mods/breath/settings-bar.ts', 'utf8')
const modSource = readFileSync('../../overlay/mods/breath/mod.ts', 'utf8')

describe('breath servo setting', () => {
  test('gates every M5StackChan servo command at the common hardware driver', () => {
    assert.match(driverSource, /#enabled = true/)
    assert.match(driverSource, /async setTorque\([^)]*\)[\s\S]*?if \(!this\.#enabled\) return/)
    assert.match(driverSource, /async applyRotation\([^)]*\)[\s\S]*?if \(!this\.#enabled\) return/)
    assert.match(driverSource, /async getRotation\([^)]*\)[\s\S]*?if \(!this\.#enabled\) return \{ success: false \}/)
    assert.match(driverSource, /setEnabled\(enabled: boolean\)[\s\S]*?this\.#servoPower\?\.setEnabled\(next\)/)
    assert.match(driverSource, /onDetached\(\)[\s\S]*?this\.#servoPower\?\.setEnabled\(false\)/)
  })

  test('persists the setting and exposes touch-sized ON and OFF controls', () => {
    assert.match(settingsSource, /PREF_KEY_SERVO_ENABLED = 'servoEnabled'/)
    assert.match(settingsSource, /label: 'SERVO'/)
    assert.match(settingsSource, /name: 'servoOffButton'[\s\S]*?height: 70/)
    assert.match(settingsSource, /name: 'servoOnButton'[\s\S]*?height: 70/)
    assert.match(settingsSource, /Preference\.set\(PREF_DOMAIN, PREF_KEY_SERVO_ENABLED, next \? '1' : '0'\)/)
    assert.match(modSource, /applySavedServoSetting\(robot\)/)
  })
})
