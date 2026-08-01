import loadPreferences from 'loadPreference'
import { markDevHealthy, startDevTools } from 'breath/dev/dev-tools'
import breathMod from 'breath/mod'
import { loadBreathPolicy } from 'breath-policy-loader'
import { M5StackChanServoDriver } from 'm5stackchan-servo-driver'
import Microphone from 'microphone'
import { NetworkService } from 'network-service'
import { NoneDriver } from 'none-driver'
import { resetSharedPY32IOExpander } from 'py32-io-expander'
import PY32Led from 'py32-led'
import { Renderer as BreathRenderer } from 'renderer-breath'
import { Robot } from 'robot'
import { asyncWait } from 'stackchan-util'
import Tone from 'tone'
import TouchPanel from 'touch-panel'

const PY32_LED_INIT_RETRY_COUNT = 24
const PY32_LED_INIT_RETRY_DELAY_MS = 50

type GlobalEnvironment = {
  device?: {
    sensor?: {
      TouchPanel?: new (options: unknown) => unknown
    }
  }
}

const globalEnv = globalThis as typeof globalThis & GlobalEnvironment

async function createPY32Led(key: string, candidate: Record<string, unknown>) {
  let lastError: unknown
  for (let attempt = 0; attempt <= PY32_LED_INIT_RETRY_COUNT; attempt++) {
    try {
      return new PY32Led(candidate as { length?: number; ledPin?: number; address?: number })
    } catch (error) {
      lastError = error
      resetSharedPY32IOExpander()
      if (attempt < PY32_LED_INIT_RETRY_COUNT) await asyncWait(PY32_LED_INIT_RETRY_DELAY_MS)
    }
  }
  trace(`[main-breath] LED ${key} construction failed after retries: ${lastError}\n`)
  throw lastError
}

function startWiFiInBackground(): void {
  const preferences = loadPreferences('wifi')
  if (preferences.ssid == null || preferences.password == null) {
    trace('[main-breath] Wi-Fi credentials are not configured; continuing offline\n')
    return
  }
  try {
    globalThis.network = new NetworkService({ ssid: preferences.ssid, password: preferences.password })
    globalThis.network.connect(
      () => {
        trace('[main-breath] Wi-Fi connected\n')
        startDevTools()
      },
      (error) => trace(`[main-breath] Wi-Fi connection failed; continuing offline: ${error}\n`),
    )
  } catch (error) {
    trace(`[main-breath] Wi-Fi start failed; continuing offline: ${error}\n`)
  }
}

async function main() {
  const boot = globalThis as typeof globalThis & { breathBootStage?: string; breathLedInitError?: string }
  boot.breathBootStage = 'startup-delay'
  trace('[main-breath] boot start\n')
  await asyncWait(100)
  boot.breathBootStage = 'network-start'
  startWiFiInBackground()
  boot.breathBootStage = 'policy'
  loadBreathPolicy()

  boot.breathBootStage = 'servo-driver'
  const driverPreferences = loadPreferences('driver')
  let driver: M5StackChanServoDriver | NoneDriver
  try {
    driver = new M5StackChanServoDriver(driverPreferences)
  } catch (error) {
    trace(`[main-breath] servo construction failed, using none driver: ${error}\n`)
    driver = new NoneDriver()
  }

  boot.breathBootStage = 'led-driver'
  const ledPreferences = loadPreferences('led')
  const leds: Record<string, PY32Led> = {}
  for (const [key, value] of Object.entries(ledPreferences)) {
    const candidate = value as Record<string, unknown>
    if (
      typeof value !== 'object' ||
      value === null ||
      candidate.type !== 'py32' ||
      typeof candidate.ledPin !== 'number'
    )
      continue
    try {
      leds[key] = await createPY32Led(key, candidate)
    } catch (error) {
      boot.breathLedInitError = String(error)
      trace(`[main-breath] continuing without LED ${key}\n`)
    }
  }
  const tts = { async stream() {} }
  boot.breathBootStage = 'renderer'
  const renderer = new BreathRenderer(loadPreferences('renderer'))
  const touchPanel = globalEnv.device?.sensor?.TouchPanel
    ? new TouchPanel(globalEnv.device.sensor.TouchPanel as ConstructorParameters<typeof TouchPanel>[0])
    : undefined
  boot.breathBootStage = 'robot'
  const robot = new Robot({
    driver,
    renderer,
    tts,
    button: globalThis.button,
    microphone: new Microphone(),
    tone: new Tone({ volume: loadPreferences('tts').volume }),
    touchPanel,
    led: leds as unknown as ConstructorParameters<typeof Robot>[0]['led'],
  })
  boot.breathBootStage = 'breath-mod'
  await breathMod.onRobotCreated?.(robot)
  markDevHealthy()
  ;(globalThis as typeof globalThis & { breathDevHealthy?: boolean }).breathDevHealthy = true
  boot.breathBootStage = 'complete'
  trace('[main-breath] initialization complete\n')
}

main().catch((error) => {
  globalThis.breathBootError = String(error)
  trace(`[main-breath] staged boot failed: ${error}\n`)
})
