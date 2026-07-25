import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const toneSource = readFileSync('stackchan/tone.ts', 'utf8')
const robotSource = readFileSync('stackchan/robot.ts', 'utf8')
const settingsSource = readFileSync('../../overlay/mods/breath/settings-bar.ts', 'utf8')
const modSource = readFileSync('../../overlay/mods/breath/mod.ts', 'utf8')

describe('breath volume setting', () => {
  test('applies one master output volume to tones and audio resources', () => {
    assert.match(toneSource, /#effectiveVolume\(volume\?: number\)/)
    assert.equal(
      toneSource.match(/AudioOut\.Volume, Math\.round\(this\.#effectiveVolume\(volume\) \* 256\)/g)?.length,
      2,
    )
    assert.match(robotSource, /setAudioOutputVolume\(volume: number\)[\s\S]*?this\.#tone\?\.setOutputVolume\(volume\)/)
    assert.match(settingsSource, /this\.robot\.setAudioOutputVolume\(next \/ VOLUME_MAX_LEVEL\)/)
    assert.match(modSource, /applySavedSettings\(robot\)/)
  })

  test('deactivates hidden level buttons so they cannot intercept touches', () => {
    assert.match(
      settingsSource,
      /this\.zeroButton\.visible = setting !== 'screen'\s+this\.zeroButton\.active = setting !== 'screen'/,
    )
    assert.match(
      settingsSource,
      /this\.halfButton\.visible = setting === 'led'\s+this\.halfButton\.active = setting === 'led'/,
    )
    assert.match(settingsSource, /name: 'halfButton'[\s\S]*?visible: false,\s+active: false,/)
  })
})
