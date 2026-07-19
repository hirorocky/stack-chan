import loadPreferences from 'loadPreference'
import { markDevHealthy, startDevTools } from 'breath/dev/dev-tools'
import breathMod from 'breath/mod'
import { loadBreathPolicy } from 'breath-policy-loader'
import { M5StackChanServoDriver } from 'm5stackchan-servo-driver'
import Microphone from 'microphone'
import { NetworkService } from 'network-service'
import { NoneDriver } from 'none-driver'
import PY32Led from 'py32-led'
import { Renderer as BreathRenderer } from 'renderer-breath'
import { Robot } from 'robot'
import { asyncWait } from 'stackchan-util'
import Tone from 'tone'

async function connectWiFi() {
  const preferences = loadPreferences('wifi')
  if (preferences.ssid == null || preferences.password == null) return
  return new Promise<void>((resolve, reject) => {
    globalThis.network = new NetworkService({ ssid: preferences.ssid, password: preferences.password })
    globalThis.network.connect(resolve, reject)
  })
}

async function main() {
  trace('[main-breath] boot start\n')
  await asyncWait(100)
  await connectWiFi().catch((error) => trace(`[main-breath] Wi-Fi connection failed: ${error}\n`))
  startDevTools()
  loadBreathPolicy()

  const driverPreferences = loadPreferences('driver')
  let driver: M5StackChanServoDriver | NoneDriver
  try {
    driver = new M5StackChanServoDriver(driverPreferences)
  } catch (error) {
    trace(`[main-breath] servo construction failed, using none driver: ${error}\n`)
    driver = new NoneDriver()
  }

  const ledPreferences = loadPreferences('led')
  const leds = Object.fromEntries(
    Object.entries(ledPreferences).flatMap(([key, value]) => {
      const candidate = value as Record<string, unknown>
      if (
        typeof value !== 'object' ||
        value === null ||
        candidate.type !== 'py32' ||
        typeof candidate.ledPin !== 'number'
      )
        return []
      return [[key, new PY32Led(candidate)]]
    }),
  )
  const tts = { async stream() {} }
  const robot = new Robot({
    driver,
    renderer: new BreathRenderer(loadPreferences('renderer')),
    tts,
    button: globalThis.button,
    microphone: new Microphone(),
    tone: new Tone({ volume: loadPreferences('tts').volume }),
    led: leds as unknown as ConstructorParameters<typeof Robot>[0]['led'],
  })
  await breathMod.onRobotCreated?.(robot)
  markDevHealthy()
  ;(globalThis as typeof globalThis & { breathDevHealthy?: boolean }).breathDevHealthy = true
  trace('[main-breath] initialization complete\n')
}

main().catch((error) => {
  globalThis.breathBootError = String(error)
  trace(`[main-breath] staged boot failed: ${error}\n`)
})
