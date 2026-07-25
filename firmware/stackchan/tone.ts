import Resource from 'Resource'
import AudioOut from 'pins/audioout'

export type ToneProperty = {
  volume?: number
}

export type ToneStep = Readonly<{ hz: number; durationMs: number }>

// AudioOut.Callback is raised after the mixer has filled I2S DMA, not after the
// last sample has reached the amplifier. Keep the output alive with zeros long
// enough to drain the CoreS3 DMA before closing it.
const RESOURCE_DRAIN_SILENCE_MS = 250

export default class Tone {
  volume: number
  #outputVolume = 1

  constructor(props: ToneProperty) {
    this.volume = props.volume ?? 0.5
  }

  setOutputVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Output volume must be between 0 and 1')
    this.#outputVolume = volume
  }

  getOutputVolume(): number {
    return this.#outputVolume
  }

  #effectiveVolume(volume?: number): number {
    return Math.min(1, Math.max(0, (volume ?? this.volume) * this.#outputVolume))
  }

  async tone(hz: number, duration: number, volume?: number): Promise<void> {
    return this.toneSequence([{ hz, durationMs: duration }], volume)
  }

  async toneSequence(tones: readonly ToneStep[], volume?: number): Promise<void> {
    const audio = new AudioOut({
      streams: 1,
      sampleRate: 24000,
      bitsPerSample: 16,
    })
    return new Promise((resolve, reject) => {
      let closed = false

      const close = (stop: boolean): void => {
        if (closed) return
        closed = true
        if (stop) {
          try {
            audio.stop()
          } catch {}
        }
        try {
          audio.close()
        } catch {}
      }

      try {
        audio.enqueue(0, AudioOut.Flush)
        const available = audio.length(0)
        const reserved = 2 // volume and completion callback
        if (tones.length === 0) throw new Error('tone sequence is empty')
        if (tones.length > available - reserved)
          throw new Error(`tone sequence exceeds audio queue capacity: ${tones.length} > ${available - reserved}`)

        audio.enqueue(0, AudioOut.Volume, Math.round(this.#effectiveVolume(volume) * 256))
        for (const tone of tones)
          audio.enqueue(0, AudioOut.Tone, tone.hz, Math.max(1, Math.round((audio.sampleRate * tone.durationMs) / 1000)))
        audio.enqueue(0, AudioOut.Callback, 1)
        audio.callback = (_id) => {
          close(false)
          resolve()
        }
        audio.start()
      } catch (error) {
        close(true)
        reject(error)
      }
    })
  }

  async playAudioResource(resourceName: string, volume?: number, sampleRate = 24000): Promise<void> {
    const audio = new AudioOut({
      streams: 1,
      sampleRate,
      bitsPerSample: 16,
    })
    return new Promise((resolve, reject) => {
      let closed = false

      const close = (stop: boolean): void => {
        if (closed) return
        closed = true
        if (stop) {
          try {
            audio.stop()
          } catch {}
        }
        try {
          audio.close()
        } catch {}
      }

      try {
        audio.enqueue(0, AudioOut.Flush)
        if (audio.length(0) < 4) throw new Error('audio queue capacity is too small for resource playback')
        audio.enqueue(0, AudioOut.Volume, Math.round(this.#effectiveVolume(volume) * 256))
        audio.enqueue(0, AudioOut.Samples, new Resource(resourceName))
        audio.enqueue(0, AudioOut.Silence, Math.round((sampleRate * RESOURCE_DRAIN_SILENCE_MS) / 1000))
        audio.enqueue(0, AudioOut.Callback, 1)
        audio.callback = (_id) => {
          close(false)
          resolve()
        }
        audio.start()
      } catch (error) {
        close(true)
        reject(error)
      }
    })
  }
}
