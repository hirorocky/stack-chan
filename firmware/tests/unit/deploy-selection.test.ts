import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, test } from 'node:test'

const repoRoot = resolve(process.cwd(), '../..')
const deployScript = join(repoRoot, 'overlay/scripts/deploy.sh')
const usbPortScript = join(repoRoot, 'overlay/scripts/stackchan-usb-port.sh')
const temporaryDirectories: string[] = []

function temporaryDeviceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'breath-usb-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function createDevice(directory: string, name: string): string {
  const path = join(directory, name)
  closeSync(openSync(path, 'w'))
  chmodSync(path, 0o600)
  return path
}

function run(script: string, args: string[], deviceDirectory: string) {
  return spawnSync('bash', [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, BREATH_USB_DEV_DIR: deviceDirectory, BREATH_DEPLOY_PRINT_TRANSPORT: '1' },
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop() as string, { recursive: true })
})

describe('breath deploy transport selection', () => {
  test('prefers the only connected USB device', () => {
    const directory = temporaryDeviceDirectory()
    const device = createDevice(directory, 'cu.usbmodem101')
    const result = run(deployScript, [], directory)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), `transport=usb port=${device}`)
  })

  test('falls back to OTA and preserves an explicit host when USB is absent', () => {
    const directory = temporaryDeviceDirectory()
    const result = run(deployScript, ['192.0.2.1'], directory)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), 'transport=ota host=192.0.2.1')
  })

  test('requires an explicit port when multiple USB devices exist', () => {
    const directory = temporaryDeviceDirectory()
    createDevice(directory, 'cu.usbmodem101')
    createDevice(directory, 'cu.usbserial-01')
    const result = run(usbPortScript, [], directory)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Multiple USB devices found/)
  })

  test('allows OTA to be forced while USB is connected', () => {
    const directory = temporaryDeviceDirectory()
    createDevice(directory, 'cu.usbmodem101')
    const result = run(deployScript, ['--ota', '192.0.2.1'], directory)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), 'transport=ota host=192.0.2.1')
  })
})

test('native USB deployment uses the shared detector and verifies breath helper modules', () => {
  const source = readFileSync(join(repoRoot, 'overlay/scripts/native-deploy.sh'), 'utf8')
  assert.match(source, /stackchan-usb-port\.sh/)
  assert.match(source, /modules\/breath\/led-arousal-gate\.xsb/)
  assert.match(source, /modules\/breath\/state\/ambient-arousal\.xsb/)
  assert.match(source, /modules\/breath\/state\/petting\.xsb/)
  assert.match(source, /modules\/breath\/touch-interactions\.xsb/)
  assert.match(source, /modules\/breath\/state\/touch-valence\.xsb/)
  assert.match(source, /modules\/breath\/motion\/pet-reaction-plan\.xsb/)
  assert.match(source, /modules\/breath\/pet-reaction\.xsb/)
  assert.match(source, /"breath\/touch-interactions"/)
  assert.match(source, /"breath\/state\/touch-valence"/)
  assert.match(source, /"breath\/state\/petting"/)
  assert.match(source, /"breath\/motion\/pet-reaction-plan"/)
  assert.match(source, /"breath\/pet-reaction"/)
  assert.match(source, /manifest_flat\.json/)
})

test('touch valence modules are registered in both breath host manifests and started by the breath MOD', () => {
  const manifests = ['manifest_breath_deploy.json', 'manifest_breath_lean.json']
  for (const filename of manifests) {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'stack-chan/firmware/stackchan', filename), 'utf8')) as {
      modules: Record<string, string>
    }
    assert.equal(manifest.modules['breath/touch-interactions'], '../../../overlay/mods/breath/touch-interactions')
    assert.equal(manifest.modules['breath/state/touch-valence'], '../../../overlay/mods/breath/state/touch-valence')
    assert.equal(manifest.modules['breath/state/petting'], '../../../overlay/mods/breath/state/petting')
    assert.equal(
      manifest.modules['breath/motion/pet-reaction-plan'],
      '../../../overlay/mods/breath/motion/pet-reaction-plan',
    )
    assert.equal(manifest.modules['breath/pet-reaction'], '../../../overlay/mods/breath/pet-reaction')
  }

  const modSource = readFileSync(join(repoRoot, 'overlay/mods/breath/mod.ts'), 'utf8')
  assert.match(modSource, /import \{ startTouchInteractions \} from 'breath\/touch-interactions'/)
  assert.match(modSource, /startTouchInteractions\(robot\)/)
})
