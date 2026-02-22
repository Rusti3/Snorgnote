import { useCallback, useEffect, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import { useTheme } from '../lib/theme'
import type {
  TelegramPollReport,
  TelegramStatus,
  TelegramVerificationCode,
} from '../types/api'

export function SettingsPanel() {
  const { locale, setLocale, t } = useLocale()
  const { themeMode, setThemeMode } = useTheme()
  const [botToken, setBotToken] = useState('')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [verification, setVerification] = useState<TelegramVerificationCode | null>(null)
  const [pollReport, setPollReport] = useState<TelegramPollReport | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setError(null)
    try {
      const result = await api.telegramStatus()
      setStatus(result)
      if (result.username && !username) {
        setUsername(result.username)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить статус Telegram', 'Failed to load Telegram status'))
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
          'Конфиг Telegram сохранен. Теперь сгенерируйте одноразовый код и отправьте его боту в личные сообщения.',
          'Telegram config saved. Generate a one-time code and send it to your bot in private chat.',
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось сохранить конфиг Telegram', 'Failed to save Telegram config'))
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
          'Отправьте этот код боту в личные сообщения Telegram, затем нажмите «Проверить сейчас».',
          'Send this code to your Telegram bot in private chat, then click "Poll Now".',
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось сгенерировать код верификации', 'Failed to generate verification code'),
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
            'Верификация подтверждена. Теперь можно запускать прием сообщений Telegram.',
            'Verification confirmed. You can start Telegram listener now.',
          ),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось опросить обновления Telegram', 'Failed to poll Telegram updates'))
    }
  }

  async function startListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStart()
      setStatus(result)
      setInfo(t('Прием сообщений Telegram запущен.', 'Telegram listener started.'))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось запустить прием сообщений Telegram', 'Failed to start Telegram listener'),
      )
    }
  }

  async function stopListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStop()
      setStatus(result)
      setInfo(t('Прием сообщений Telegram остановлен.', 'Telegram listener stopped.'))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось остановить прием сообщений Telegram', 'Failed to stop Telegram listener'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 text-lg font-semibold">{t('Тема оформления', 'Theme')}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t(
            'Режим применяется мгновенно и сохраняется локально.',
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
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-semibold">{t('Язык интерфейса', 'Interface language')}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t(
            'Смена языка применяется сразу и сохраняется локально.',
            'Language change applies instantly and is stored locally.',
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={locale === 'ru' ? 'default' : 'outline'} onClick={() => setLocale('ru')}>
            Русский
          </Button>
          <Button variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>
            English
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-lg font-semibold">{t('Настройки Telegram', 'Telegram Settings')}</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted-foreground)]">
              {t('Токен бота', 'Bot token')}
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
              {t('Имя пользователя Telegram', 'Telegram username')}
            </label>
            <input
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('@ваш_username', '@your_username')}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void saveConfig()}>{t('Сохранить конфиг', 'Save config')}</Button>
          <Button variant="outline" onClick={() => void beginVerification()}>
            {t('Сгенерировать код верификации', 'Generate verification code')}
          </Button>
          <Button variant="outline" onClick={() => void pollOnce()}>
            {t('Проверить сейчас', 'Poll now')}
          </Button>
          <Button onClick={() => void startListener()}>{t('Запустить прием', 'Start listener')}</Button>
          <Button variant="danger" onClick={() => void stopListener()}>
            {t('Остановить прием', 'Stop listener')}
          </Button>
        </div>

        {info ? <p className="mt-2 text-sm text-[var(--success)]">{info}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {t('Текущий статус Telegram', 'Telegram runtime status')}
        </h4>

        {status ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>
                {t('Настроено', 'Configured')}: {status.configured ? t('да', 'yes') : t('нет', 'no')}
              </Badge>
              <Badge>
                {t('Верифицировано', 'Verified')}: {status.verified ? t('да', 'yes') : t('нет', 'no')}
              </Badge>
              <Badge>
                {t('Запущено', 'Running')}: {status.running ? t('да', 'yes') : t('нет', 'no')}
              </Badge>
            </div>
            <p>
              {t('Имя пользователя', 'Username')}: {status.username ?? '-'}
            </p>
            <p>Chat ID: {status.chat_id ?? '-'}</p>
            <p>
              {t('Последний опрос', 'Last poll')}:{' '}
              {status.last_poll_at ? new Date(status.last_poll_at).toLocaleString() : '-'}
            </p>
            <p>
              {t('Последняя ошибка', 'Last error')}: {status.last_error ?? '-'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            {t('Статус пока не получен.', 'No status yet.')}
          </p>
        )}
      </Card>

      {verification ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('Одноразовый код верификации', 'One-time verification code')}
          </h4>
          <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 font-mono text-sm">
            {verification.code}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            {t('Действует до', 'Expires at')}: {new Date(verification.expires_at).toLocaleString()}
          </p>
        </Card>
      ) : null}

      {pollReport ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('Отчет последнего опроса', 'Last poll report')}
          </h4>
          <div className="space-y-1 text-sm">
            <p>
              {t('Получено обновлений', 'Fetched updates')}: {pollReport.fetched}
            </p>
            <p>
              {t('Принято', 'Accepted')}: {pollReport.accepted}
            </p>
            <p>
              {t('Отклонено', 'Rejected')}: {pollReport.rejected}
            </p>
            <p>
              {t('Подтверждено сейчас', 'Verified now')}:{' '}
              {pollReport.verified_now ? t('да', 'yes') : t('нет', 'no')}
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
