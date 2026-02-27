import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import { useTheme } from '../lib/theme'
import {
  DARK_PRIMARY_COLOR_PALETTE,
  LIGHT_PRIMARY_COLOR_PALETTE,
  SECONDARY_COLOR_PALETTE,
} from '../lib/theme-utils'
import type {
  TelegramPollReport,
  TelegramStatus,
  TelegramVerificationCode,
} from '../types/api'

export function SettingsPanel() {
  const { locale, setLocale, t } = useLocale()
  const {
    themeMode,
    setThemeMode,
    lightPrimary,
    lightSecondary,
    darkPrimary,
    darkSecondary,
    customAccent,
    customBackgroundUrl,
    setLightPrimary,
    setLightSecondary,
    setDarkPrimary,
    setDarkSecondary,
    setCustomAccent,
    setCustomBackgroundFromFile,
    clearCustomBackground,
  } = useTheme()

  const [botToken, setBotToken] = useState('')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [verification, setVerification] = useState<TelegramVerificationCode | null>(null)
  const [pollReport, setPollReport] = useState<TelegramPollReport | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [themeInfo, setThemeInfo] = useState<string | null>(null)
  const [themeError, setThemeError] = useState<string | null>(null)
  const [themeBackgroundFileName, setThemeBackgroundFileName] = useState<string | null>(null)
  const themeFileInputRef = useRef<HTMLInputElement | null>(null)
  const paletteEditable = themeMode === 'light' || themeMode === 'dark' || themeMode === 'custom'
  const palettePrimary =
    themeMode === 'dark' || themeMode === 'custom' ? darkPrimary : lightPrimary
  const paletteSecondary =
    themeMode === 'dark'
      ? darkSecondary
      : themeMode === 'custom'
        ? customAccent
        : lightSecondary
  const primaryPalette =
    themeMode === 'dark' || themeMode === 'custom'
      ? DARK_PRIMARY_COLOR_PALETTE
      : LIGHT_PRIMARY_COLOR_PALETTE

  async function onThemeBackgroundSelected(file: File | undefined) {
    if (!file) {
      return
    }
    setThemeInfo(null)
    setThemeError(null)
    try {
      await setCustomBackgroundFromFile(file)
      setThemeBackgroundFileName(file.name)
      setThemeInfo(
        t(
          'Р¤РѕРЅРѕРІРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ С‚РµРјС‹ РѕР±РЅРѕРІР»РµРЅРѕ.',
          'Theme background image updated.',
        ),
      )
    } catch (err) {
      setThemeError(
        err instanceof Error
          ? err.message
          : t(
            'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ С‚РµРјС‹.',
            'Failed to upload theme image.',
          ),
      )
    }
  }

  async function onThemeBackgroundClear() {
    setThemeInfo(null)
    setThemeError(null)
    try {
      await clearCustomBackground()
      setThemeBackgroundFileName(null)
      if (themeFileInputRef.current) {
        themeFileInputRef.current.value = ''
      }
      setThemeInfo(
        t('Р¤РѕРЅРѕРІРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ СѓРґР°Р»РµРЅРѕ.', 'Theme background image removed.'),
      )
    } catch (err) {
      setThemeError(
        err instanceof Error
          ? err.message
          : t(
            'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ С‚РµРјС‹.',
            'Failed to remove theme image.',
          ),
      )
    }
  }

  const loadStatus = useCallback(async () => {
    setError(null)
    try {
      const result = await api.telegramStatus()
      setStatus(result)
      if (result.username && !username) {
        setUsername(result.username)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃС‚Р°С‚СѓСЃ Telegram', 'Failed to load Telegram status'),
      )
    }
  }, [t, username])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function saveConfig() {
    setError(null)
    setInfo(null)
    setPollReport(null)
    try {
      const result = await api.telegramSetConfig(botToken, username)
      setStatus(result)
      setInfo(
        t(
          'РљРѕРЅС„РёРі Telegram СЃРѕС…СЂР°РЅРµРЅ. РўРµРїРµСЂСЊ СЃРіРµРЅРµСЂРёСЂСѓР№С‚Рµ РѕРґРЅРѕСЂР°Р·РѕРІС‹Р№ РєРѕРґ Рё РѕС‚РїСЂР°РІСЊС‚Рµ РµРіРѕ Р±РѕС‚Сѓ РІ Р»РёС‡РЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ.',
          'Telegram config saved. Generate a one-time code and send it to your bot in private chat.',
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РєРѕРЅС„РёРі Telegram', 'Failed to save Telegram config'),
      )
    }
  }

  async function beginVerification() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramBeginVerification()
      setVerification(result)
      setInfo(
        t(
          'РћС‚РїСЂР°РІСЊС‚Рµ СЌС‚РѕС‚ РєРѕРґ Р±РѕС‚Сѓ РІ Р»РёС‡РЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ Telegram, Р·Р°С‚РµРј РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊ СЃРµР№С‡Р°СЃВ».',
          'Send this code to your Telegram bot in private chat, then click "Poll now".',
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РєРѕРґ РІРµСЂРёС„РёРєР°С†РёРё', 'Failed to generate verification code'),
      )
    }
  }

  async function pollOnce() {
    setError(null)
    setInfo(null)
    try {
      const report = await api.telegramPollOnce()
      setPollReport(report)
      await loadStatus()
      if (report.verified_now) {
        setInfo(
          t(
            'Р’РµСЂРёС„РёРєР°С†РёСЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅР°. РўРµРїРµСЂСЊ РјРѕР¶РЅРѕ Р·Р°РїСѓСЃРєР°С‚СЊ РїСЂРёРµРј СЃРѕРѕР±С‰РµРЅРёР№ Telegram.',
            'Verification confirmed. You can start Telegram listener now.',
          ),
        )
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРѕСЃРёС‚СЊ РѕР±РЅРѕРІР»РµРЅРёСЏ Telegram', 'Failed to poll Telegram updates'),
      )
    }
  }

  async function startListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStart()
      setStatus(result)
      setInfo(t('РџСЂРёРµРј СЃРѕРѕР±С‰РµРЅРёР№ Telegram Р·Р°РїСѓС‰РµРЅ.', 'Telegram listener started.'))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ РїСЂРёРµРј СЃРѕРѕР±С‰РµРЅРёР№ Telegram', 'Failed to start Telegram listener'),
      )
    }
  }

  async function stopListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStop()
      setStatus(result)
      setInfo(t('РџСЂРёРµРј СЃРѕРѕР±С‰РµРЅРёР№ Telegram РѕСЃС‚Р°РЅРѕРІР»РµРЅ.', 'Telegram listener stopped.'))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('РќРµ СѓРґР°Р»РѕСЃСЊ РѕСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂРёРµРј СЃРѕРѕР±С‰РµРЅРёР№ Telegram', 'Failed to stop Telegram listener'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 text-lg font-semibold">{t('Тема оформления', 'Theme')}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t(
            'Режим темы применяется мгновенно и сохраняется локально.',
            'Theme mode applies instantly and is stored locally.',
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={themeMode === 'system' ? 'default' : 'outline'}
            onClick={() => setThemeMode('system')}
          >
            {t('Системная', 'System')}
          </Button>
          <Button
            variant={themeMode === 'light' ? 'default' : 'outline'}
            onClick={() => setThemeMode('light')}
          >
            {t('Светлая', 'Light')}
          </Button>
          <Button
            variant={themeMode === 'dark' ? 'default' : 'outline'}
            onClick={() => setThemeMode('dark')}
          >
            {t('Тёмная', 'Dark')}
          </Button>
          <Button
            variant={themeMode === 'custom' ? 'default' : 'outline'}
            onClick={() => setThemeMode('custom')}
          >
            {t('Кастомная', 'Custom')}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('Основной цвет (фон и titlebar)', 'Primary color (background + titlebar)')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {primaryPalette.map((color) => {
                const selected = color === palettePrimary
                return (
                  <button
                    key={color}
                    aria-label={`${t('Основной цвет', 'Primary color')}: ${color}`}
                    className={`h-8 w-8 rounded-full border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                      selected
                        ? 'border-[var(--foreground)] ring-2 ring-[var(--foreground)]/20'
                        : 'border-[var(--border)]'
                    } ${!paletteEditable ? 'cursor-not-allowed opacity-50 hover:scale-100' : ''}`}
                    disabled={!paletteEditable}
                    onClick={() =>
                      themeMode === 'dark' || themeMode === 'custom'
                        ? setDarkPrimary(color)
                        : setLightPrimary(color)
                    }
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('Дополнительный цвет (кнопки и акценты)', 'Secondary color (buttons + accents)')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SECONDARY_COLOR_PALETTE.map((color) => {
                const selected = color === paletteSecondary
                return (
                  <button
                    key={color}
                    aria-label={`${t('Дополнительный цвет', 'Secondary color')}: ${color}`}
                    className={`h-8 w-8 rounded-full border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                      selected
                        ? 'border-[var(--foreground)] ring-2 ring-[var(--foreground)]/20'
                        : 'border-[var(--border)]'
                    } ${!paletteEditable ? 'cursor-not-allowed opacity-50 hover:scale-100' : ''}`}
                    disabled={!paletteEditable}
                    onClick={() =>
                      themeMode === 'dark'
                        ? setDarkSecondary(color)
                        : themeMode === 'custom'
                          ? setCustomAccent(color)
                          : setLightSecondary(color)
                    }
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                )
              })}
            </div>
          </div>

          {!paletteEditable ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {t(
                'В режиме «Системная» настраивайте цвета отдельно в «Светлая» и «Тёмная».',
                'In System mode, customize colors separately in Light and Dark modes.',
              )}
            </p>
          ) : null}

          {themeMode === 'custom' ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3">
              <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('Фон кастомной темы', 'Custom theme background')}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {t(
                  'Поддерживаются PNG, JPG, JPEG и WEBP до 10MB.',
                  'Supported formats: PNG, JPG, JPEG, WEBP up to 10MB.',
                )}
              </p>
              <input
                ref={themeFileInputRef}
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                aria-label="Theme background image"
                className="sr-only"
                onChange={(event) => {
                  void onThemeBackgroundSelected(event.target.files?.[0])
                }}
                type="file"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => themeFileInputRef.current?.click()}
                >
                  {t('Загрузить изображение', 'Upload image')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!customBackgroundUrl}
                  onClick={() => void onThemeBackgroundClear()}
                >
                  {t('Удалить изображение', 'Remove image')}
                </Button>
              </div>

              {themeBackgroundFileName ? (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {t('Выбрано', 'Selected')}: {themeBackgroundFileName}
                </p>
              ) : null}
              {customBackgroundUrl && !themeBackgroundFileName ? (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {t(
                    'Фон сохранён и будет использоваться после перезапуска.',
                    'Background is saved and will be reused after restart.',
                  )}
                </p>
              ) : null}
              {themeInfo ? (
                <p className="mt-2 text-xs text-[var(--success)]">{themeInfo}</p>
              ) : null}
              {themeError ? (
                <p className="mt-2 text-xs text-[var(--danger)]">{themeError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-semibold">{t('РЇР·С‹Рє РёРЅС‚РµСЂС„РµР№СЃР°', 'Interface language')}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t(
            'РЎРјРµРЅР° СЏР·С‹РєР° РїСЂРёРјРµРЅСЏРµС‚СЃСЏ СЃСЂР°Р·Сѓ Рё СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ.',
            'Language change applies instantly and is stored locally.',
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={locale === 'ru' ? 'default' : 'outline'} onClick={() => setLocale('ru')}>
            Р СѓСЃСЃРєРёР№
          </Button>
          <Button variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>
            English
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-lg font-semibold">{t('РќР°СЃС‚СЂРѕР№РєРё Telegram', 'Telegram Settings')}</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted-foreground)]">
              {t('РўРѕРєРµРЅ Р±РѕС‚Р°', 'Bot token')}
            </label>
            <input
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder="123456789:AA..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--muted-foreground)]">
              {t('РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Telegram', 'Telegram username')}
            </label>
            <input
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('@РІР°С€_username', '@your_username')}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void saveConfig()}>{t('РЎРѕС…СЂР°РЅРёС‚СЊ РєРѕРЅС„РёРі', 'Save config')}</Button>
          <Button variant="outline" onClick={() => void beginVerification()}>
            {t('РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РєРѕРґ РІРµСЂРёС„РёРєР°С†РёРё', 'Generate verification code')}
          </Button>
          <Button variant="outline" onClick={() => void pollOnce()}>
            {t('РџСЂРѕРІРµСЂРёС‚СЊ СЃРµР№С‡Р°СЃ', 'Poll now')}
          </Button>
          <Button onClick={() => void startListener()}>{t('Р—Р°РїСѓСЃС‚РёС‚СЊ РїСЂРёРµРј', 'Start listener')}</Button>
          <Button variant="danger" onClick={() => void stopListener()}>
            {t('РћСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂРёРµРј', 'Stop listener')}
          </Button>
        </div>

        {info ? <p className="mt-2 text-sm text-[var(--success)]">{info}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {t('РўРµРєСѓС‰РёР№ СЃС‚Р°С‚СѓСЃ Telegram', 'Telegram runtime status')}
        </h4>

        {status ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>
                {t('РќР°СЃС‚СЂРѕРµРЅРѕ', 'Configured')}: {status.configured ? t('РґР°', 'yes') : t('РЅРµС‚', 'no')}
              </Badge>
              <Badge>
                {t('Р’РµСЂРёС„РёС†РёСЂРѕРІР°РЅРѕ', 'Verified')}: {status.verified ? t('РґР°', 'yes') : t('РЅРµС‚', 'no')}
              </Badge>
              <Badge>
                {t('Р—Р°РїСѓС‰РµРЅРѕ', 'Running')}: {status.running ? t('РґР°', 'yes') : t('РЅРµС‚', 'no')}
              </Badge>
            </div>
            <p>
              {t('РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ', 'Username')}: {status.username ?? '-'}
            </p>
            <p>Chat ID: {status.chat_id ?? '-'}</p>
            <p>
              {t('РџРѕСЃР»РµРґРЅРёР№ РѕРїСЂРѕСЃ', 'Last poll')}:{' '}
              {status.last_poll_at ? new Date(status.last_poll_at).toLocaleString() : '-'}
            </p>
            <p>
              {t('РџРѕСЃР»РµРґРЅСЏСЏ РѕС€РёР±РєР°', 'Last error')}: {status.last_error ?? '-'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            {t('РЎС‚Р°С‚СѓСЃ РїРѕРєР° РЅРµ РїРѕР»СѓС‡РµРЅ.', 'No status yet.')}
          </p>
        )}
      </Card>

      {verification ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('РћРґРЅРѕСЂР°Р·РѕРІС‹Р№ РєРѕРґ РІРµСЂРёС„РёРєР°С†РёРё', 'One-time verification code')}
          </h4>
          <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 font-mono text-sm">
            {verification.code}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            {t('Р”РµР№СЃС‚РІСѓРµС‚ РґРѕ', 'Expires at')}: {new Date(verification.expires_at).toLocaleString()}
          </p>
        </Card>
      ) : null}

      {pollReport ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('РћС‚С‡РµС‚ РїРѕСЃР»РµРґРЅРµРіРѕ РѕРїСЂРѕСЃР°', 'Last poll report')}
          </h4>
          <div className="space-y-1 text-sm">
            <p>
              {t('РџРѕР»СѓС‡РµРЅРѕ РѕР±РЅРѕРІР»РµРЅРёР№', 'Fetched updates')}: {pollReport.fetched}
            </p>
            <p>
              {t('РџСЂРёРЅСЏС‚Рѕ', 'Accepted')}: {pollReport.accepted}
            </p>
            <p>
              {t('РћС‚РєР»РѕРЅРµРЅРѕ', 'Rejected')}: {pollReport.rejected}
            </p>
            <p>
              {t('РџРѕРґС‚РІРµСЂР¶РґРµРЅРѕ СЃРµР№С‡Р°СЃ', 'Verified now')}:{' '}
              {pollReport.verified_now ? t('РґР°', 'yes') : t('РЅРµС‚', 'no')}
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}



