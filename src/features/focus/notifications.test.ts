import { describe, expect, it, vi } from 'vitest'

import { notifyPhaseCompleted, playPhaseCompleteBeep } from './notifications'

describe('focus notifications', () => {
  it('sends system notification when permission is granted', async () => {
    const notifySpy = vi.fn()

    class MockNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = vi.fn(async () => 'granted' satisfies NotificationPermission)
      title: string
      options?: NotificationOptions
      constructor(title: string, options?: NotificationOptions) {
        this.title = title
        this.options = options
        notifySpy({ title, options })
      }
    }

    ;(globalThis as { Notification?: typeof Notification }).Notification =
      MockNotification as unknown as typeof Notification

    await notifyPhaseCompleted('Focus', 'Short break')
    expect(notifySpy).toHaveBeenCalledOnce()
    expect(notifySpy.mock.calls[0][0].title).toContain('Snorgnote')
  })

  it('plays a short beep through AudioContext', () => {
    const startSpy = vi.fn()
    const stopSpy = vi.fn()
    const connectSpy = vi.fn()
    const osc = {
      type: 'sine',
      frequency: { value: 0 },
      connect: connectSpy,
      start: startSpy,
      stop: stopSpy,
    }
    const gain = {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: connectSpy,
    }
    class MockAudioContext {
      currentTime = 1
      destination = {}
      createOscillator() {
        return osc
      }
      createGain() {
        return gain
      }
    }
    ;(globalThis as { AudioContext?: typeof AudioContext }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext

    playPhaseCompleteBeep()
    expect(startSpy).toHaveBeenCalledOnce()
    expect(stopSpy).toHaveBeenCalledOnce()
  })
})
