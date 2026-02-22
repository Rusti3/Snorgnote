import { useCallback, useEffect, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import type {
  TelegramPollReport,
  TelegramStatus,
  TelegramVerificationCode,
} from '../types/api'

export function SettingsPanel() {
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
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статус Telegram')
    }
  }, [username])

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
      setInfo('Конфиг Telegram сохранен. Теперь сгенерируйте одноразовый код и отправьте его боту в личные сообщения.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить конфиг Telegram')
    }
  }

  async function beginVerification() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramBeginVerification()
      setVerification(result)
      setInfo('Отправьте этот код боту в личные сообщения Telegram, затем нажмите «Проверить сейчас».')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать код верификации')
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
        setInfo('Верификация подтверждена. Теперь можно запускать прием сообщений Telegram.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось опросить обновления Telegram')
    }
  }

  async function startListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStart()
      setStatus(result)
      setInfo('Прием сообщений Telegram запущен.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить прием сообщений Telegram')
    }
  }

  async function stopListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStop()
      setStatus(result)
      setInfo('Прием сообщений Telegram остановлен.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось остановить прием сообщений Telegram')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">Настройки Telegram</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Токен бота</label>
            <input
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder="123456789:AA..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Имя пользователя Telegram</label>
            <input
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@ваш_username"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void saveConfig()}>Сохранить конфиг</Button>
          <Button variant="outline" onClick={() => void beginVerification()}>
            Сгенерировать код верификации
          </Button>
          <Button variant="outline" onClick={() => void pollOnce()}>
            Проверить сейчас
          </Button>
          <Button onClick={() => void startListener()}>Запустить прием</Button>
          <Button variant="danger" onClick={() => void stopListener()}>
            Остановить прием
          </Button>
        </div>

        {info ? <p className="mt-2 text-sm text-[var(--success)]">{info}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Текущий статус Telegram
        </h4>

        {status ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>Настроено: {status.configured ? 'да' : 'нет'}</Badge>
              <Badge>Верифицировано: {status.verified ? 'да' : 'нет'}</Badge>
              <Badge>Запущено: {status.running ? 'да' : 'нет'}</Badge>
            </div>
            <p>Имя пользователя: {status.username ?? '-'}</p>
            <p>Chat ID: {status.chat_id ?? '-'}</p>
            <p>Последний опрос: {status.last_poll_at ? new Date(status.last_poll_at).toLocaleString() : '-'}</p>
            <p>Последняя ошибка: {status.last_error ?? '-'}</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">Статус пока не получен.</p>
        )}
      </Card>

      {verification ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Одноразовый код верификации
          </h4>
          <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 font-mono text-sm">
            {verification.code}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Действует до: {new Date(verification.expires_at).toLocaleString()}
          </p>
        </Card>
      ) : null}

      {pollReport ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Отчет последнего опроса
          </h4>
          <div className="space-y-1 text-sm">
            <p>Получено обновлений: {pollReport.fetched}</p>
            <p>Принято: {pollReport.accepted}</p>
            <p>Отклонено: {pollReport.rejected}</p>
            <p>Подтверждено сейчас: {pollReport.verified_now ? 'да' : 'нет'}</p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
