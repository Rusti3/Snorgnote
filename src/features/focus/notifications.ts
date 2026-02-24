type AudioHost = {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

function resolveAudioContext(): typeof AudioContext | undefined {
  const host = globalThis as AudioHost
  return host.AudioContext ?? host.webkitAudioContext
}

export async function notifyPhaseCompleted(
  completedPhaseLabel: string,
  nextPhaseLabel: string,
): Promise<void> {
  const NotificationApi = (globalThis as { Notification?: typeof Notification }).Notification
  if (typeof NotificationApi === 'undefined') {
    return
  }

  let permission = NotificationApi.permission
  if (permission === 'default') {
    try {
      permission = await NotificationApi.requestPermission()
    } catch {
      return
    }
  }

  if (permission !== 'granted') {
    return
  }

  try {
    new NotificationApi(`Snorgnote: ${completedPhaseLabel} completed`, {
      body: `Next: ${nextPhaseLabel}`,
      tag: 'snorgnote-pomodoro-phase-complete',
    })
  } catch {
    // Ignore notification construction failures in restricted environments.
  }
}

export function playPhaseCompleteBeep(): void {
  const AudioContextCtor = resolveAudioContext()
  if (!AudioContextCtor) {
    return
  }

  try {
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = 880

    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.linearRampToValueAtTime(0.06, context.currentTime + 0.01)
    gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + 0.16)

    oscillator.connect(gain)
    gain.connect(context.destination)

    oscillator.start(context.currentTime)
    oscillator.stop(context.currentTime + 0.18)

    const maybeClose = (context as { close?: () => Promise<void> | void }).close
    if (typeof maybeClose === 'function') {
      try {
        const closeResult = maybeClose.call(context)
        if (closeResult && typeof (closeResult as PromiseLike<void>).then === 'function') {
          void (closeResult as Promise<void>).catch(() => {})
        }
      } catch {
        // Ignore close failures.
      }
    }
  } catch {
    // Ignore audio construction failures in restricted environments.
  }
}
