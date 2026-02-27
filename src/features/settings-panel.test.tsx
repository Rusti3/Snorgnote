// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocaleProvider } from '../lib/locale'
import { ThemeProvider } from '../lib/theme'
import { SettingsPanel } from './settings-panel'

const apiMock = vi.hoisted(() => ({
  isTauri: vi.fn(),
  themeSaveBackgroundImage: vi.fn(),
  themeClearBackgroundImage: vi.fn(),
  telegramStatus: vi.fn(),
  telegramSetConfig: vi.fn(),
  telegramBeginVerification: vi.fn(),
  telegramPollOnce: vi.fn(),
  telegramListenerStart: vi.fn(),
  telegramListenerStop: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

describe('SettingsPanel theme custom', () => {
  beforeEach(() => {
    window.localStorage.setItem('snorgnote.locale', 'en')
    apiMock.telegramStatus.mockReset()
    apiMock.telegramSetConfig.mockReset()
    apiMock.telegramBeginVerification.mockReset()
    apiMock.telegramPollOnce.mockReset()
    apiMock.telegramListenerStart.mockReset()
    apiMock.telegramListenerStop.mockReset()
    apiMock.isTauri.mockReset()
    apiMock.themeSaveBackgroundImage.mockReset()
    apiMock.themeClearBackgroundImage.mockReset()
    apiMock.isTauri.mockReturnValue(false)

    apiMock.telegramStatus.mockResolvedValue({
      configured: false,
      verified: false,
      running: false,
      username: null,
      chat_id: null,
      last_poll_at: null,
      last_error: null,
    })

    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows upload controls in custom theme mode and accepts image selection', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <LocaleProvider>
          <SettingsPanel />
        </LocaleProvider>
      </ThemeProvider>,
    )

    await screen.findByText('Theme')
    await user.click(screen.getByRole('button', { name: 'Custom' }))

    await screen.findByRole('button', { name: 'Upload image' })
    const fileInput = screen.getByLabelText('Theme background image') as HTMLInputElement
    const file = new File(['fake-image'], 'wallpaper.png', { type: 'image/png' })
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(fileInput.files?.[0]?.name).toBe('wallpaper.png')
    })
  })
})
