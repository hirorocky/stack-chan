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

test('native USB deployment uses the shared detector and verifies arousal helper modules', () => {
  const source = readFileSync(join(repoRoot, 'overlay/scripts/native-deploy.sh'), 'utf8')
  assert.match(source, /stackchan-usb-port\.sh/)
  assert.match(source, /modules\/breath\/led-arousal-gate\.xsb/)
  assert.match(source, /modules\/breath\/state\/ambient-arousal\.xsb/)
  assert.match(source, /manifest_flat\.json/)
})
