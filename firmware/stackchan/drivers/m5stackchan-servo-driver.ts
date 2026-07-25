import {
  angleToRawPosition,
  createM5StackChanServoConfig,
  type M5StackChanServoConfig,
  RAD_TO_01_DEGREE,
  rawPositionToAngle,
  rotationToM5StackChanServoAngles,
} from 'm5stackchan-servo'
import { getSharedPY32IOExpander, resetSharedPY32IOExpander } from 'py32-io-expander'
import SCServo from 'scservo'
import type { Maybe, Rotation } from 'stackchan-util'

type M5StackChanServoDriverProps = Partial<{
  panId: number
  tiltId: number
  yawZeroPosition: number
  pitchZeroPosition: number
  config: Partial<{
    serial: Partial<M5StackChanServoConfig['serial']>
    yaw: Partial<M5StackChanServoConfig['yaw']>
    pitch: Partial<M5StackChanServoConfig['pitch']>
  }>
  serial: Partial<M5StackChanServoConfig['serial']>
  servoPower: {
    type?: 'py32' | 'none'
    pin?: number
    address?: number
  }
}>

export class M5StackChanServoDriver {
  #pan: SCServo
  #tilt: SCServo
  #config: M5StackChanServoConfig
  #servoPower?: {
    setEnabled: (enabled: boolean) => void
  }
  #enabled = true

  constructor(param: M5StackChanServoDriverProps = {}) {
    this.#config = createM5StackChanServoConfig({
      serial: {
        ...param.config?.serial,
        ...param.serial,
      },
      yaw: {
        ...param.config?.yaw,
        ...(param.panId !== undefined ? { id: param.panId } : {}),
        ...(param.yawZeroPosition !== undefined ? { zeroPosition: param.yawZeroPosition } : {}),
      },
      pitch: {
        ...param.config?.pitch,
        ...(param.tiltId !== undefined ? { id: param.tiltId } : {}),
        ...(param.pitchZeroPosition !== undefined ? { zeroPosition: param.pitchZeroPosition } : {}),
      },
    })
    this.#pan = new SCServo({ id: this.#config.yaw.id, serial: this.#config.serial, awaitWriteResponse: false })
    this.#tilt = new SCServo({ id: this.#config.pitch.id, serial: this.#config.serial, awaitWriteResponse: false })
    if (param.servoPower?.type !== 'none') {
      try {
        this.#servoPower = new PY32ServoPower(param.servoPower?.pin ?? 0, param.servoPower?.address)
      } catch (error) {
        resetSharedPY32IOExpander()
        trace(`[m5stackchan-servo] PY32 servo power init failed: ${error}\n`)
      }
    }
  }

  onAttached() {
    try {
      this.#servoPower?.setEnabled(this.#enabled)
    } catch (error) {
      // サーボ電源I2Cの一時的な失敗でRobot全体（顔・操作UI）を起動不能にしない。
      trace(`[m5stackchan-servo] servo power-on failed: ${error}\n`)
    }
  }

  onDetached() {
    try {
      this.#servoPower?.setEnabled(false)
    } catch (error) {
      trace(`[m5stackchan-servo] servo power-off failed: ${error}\n`)
    }
  }

  async setTorque(torque: boolean): Promise<void> {
    if (!this.#enabled) return
    await this.#pan.setTorque(torque)
    await this.#tilt.setTorque(torque)
  }

  async applyRotation(ori: Rotation, time = 0.5): Promise<void> {
    if (!this.#enabled) return
    const angles = rotationToM5StackChanServoAngles(ori)
    const panRawPosition = angleToRawPosition(angles.yaw, this.#config.yaw)
    const tiltRawPosition = angleToRawPosition(angles.pitch, this.#config.pitch)
    if (time === 0) {
      await this.#pan.setRawPosition(panRawPosition)
      await this.#tilt.setRawPosition(tiltRawPosition)
    } else {
      const goalTime = time * 1000
      await this.#pan.setRawPositionInTime(panRawPosition, goalTime)
      await this.#tilt.setRawPositionInTime(tiltRawPosition, goalTime)
    }
  }

  async getRotation(): Promise<Maybe<Rotation>> {
    if (!this.#enabled) return { success: false }
    const panStatus = await this.#pan.readRawPosition()
    if (!panStatus.success) {
      return {
        success: false,
      }
    }
    const tiltStatus = await this.#tilt.readRawPosition()
    if (!tiltStatus.success) {
      return {
        success: false,
      }
    }
    const yawAngle = rawPositionToAngle(panStatus.value.position, this.#config.yaw)
    const pitchAngle = rawPositionToAngle(tiltStatus.value.position, this.#config.pitch)
    return {
      success: true,
      value: {
        y: yawAngle / RAD_TO_01_DEGREE,
        p: -(pitchAngle / RAD_TO_01_DEGREE),
        r: 0.0,
      },
    }
  }

  /** breath設定から全サーボ操作を一括で許可・遮断する。 */
  setEnabled(enabled: boolean): void {
    const next = enabled === true
    if (next === this.#enabled) return
    // OFFはUARTのトルク命令を送らず、共通電源ゲートで即時に止める。
    // 先に論理ゲートを閉じ、同時刻の姿勢指令が電源断を追い越さないようにする。
    this.#enabled = next
    try {
      this.#servoPower?.setEnabled(next)
      trace(`[m5stackchan-servo] control ${next ? 'enabled' : 'disabled'}\n`)
    } catch (error) {
      trace(`[m5stackchan-servo] control ${next ? 'enable' : 'disable'} failed: ${error}\n`)
      throw error
    }
  }

  isEnabled(): boolean {
    return this.#enabled
  }
}

class PY32ServoPower {
  #pin: number
  #address?: number

  constructor(pin: number, address?: number) {
    this.#pin = pin
    this.#address = address
    const expander = this.#getExpander()
    expander.setDirection(this.#pin, true)
    expander.setPullMode(this.#pin, true)
    trace(`[m5stackchan-servo] configured PY32 servo power pin ${this.#pin}\n`)
  }

  setEnabled(enabled: boolean) {
    // LED初期化のリトライが共有I2Cインスタンスを作り直すことがある。
    // 破棄済みインスタンスを保持せず、操作のたびに現在の共有接続を取得する。
    const expander = this.#getExpander()
    expander.digitalWrite(this.#pin, enabled)
    trace(`[m5stackchan-servo] servo power ${enabled ? 'on' : 'off'} (${expander.getWriteValue(this.#pin)})\n`)
  }

  #getExpander() {
    return getSharedPY32IOExpander(this.#address === undefined ? undefined : { address: this.#address })
  }
}
