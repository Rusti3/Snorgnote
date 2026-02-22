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
      setError(err instanceof Error ? err.message : 'Failed to load Telegram status')
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
      setInfo('Telegram config saved. Now generate a one-time code and send it to your bot in private chat.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Telegram config')
    }
  }

  async function beginVerification() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramBeginVerification()
      setVerification(result)
      setInfo('Send this code to your bot in Telegram private chat, then click Poll Now.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate verification code')
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
        setInfo('Verification confirmed. You can start Telegram listener now.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to poll Telegram updates')
    }
  }

  async function startListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStart()
      setStatus(result)
      setInfo('Telegram listener started.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Telegram listener')
    }
  }

  async function stopListener() {
    setError(null)
    setInfo(null)
    try {
      const result = await api.telegramListenerStop()
      setStatus(result)
      setInfo('Telegram listener stopped.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop Telegram listener')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">Telegram Settings</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Bot Token</label>
            <input
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder="123456789:AA..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Telegram Username</label>
            <input
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@your_username"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void saveConfig()}>Save Config</Button>
          <Button variant="outline" onClick={() => void beginVerification()}>
            Generate Verification Code
          </Button>
          <Button variant="outline" onClick={() => void pollOnce()}>
            Poll Now
          </Button>
          <Button onClick={() => void startListener()}>Start Listener</Button>
          <Button variant="danger" onClick={() => void stopListener()}>
            Stop Listener
          </Button>
        </div>

        {info ? <p className="mt-2 text-sm text-[var(--success)]">{info}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Telegram Runtime Status
        </h4>

        {status ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>Configured: {status.configured ? 'yes' : 'no'}</Badge>
              <Badge>Verified: {status.verified ? 'yes' : 'no'}</Badge>
              <Badge>Running: {status.running ? 'yes' : 'no'}</Badge>
            </div>
            <p>Username: {status.username ?? '-'}</p>
            <p>Chat ID: {status.chat_id ?? '-'}</p>
            <p>Last Poll: {status.last_poll_at ? new Date(status.last_poll_at).toLocaleString() : '-'}</p>
            <p>Last Error: {status.last_error ?? '-'}</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No status yet.</p>
        )}
      </Card>

      {verification ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            One-Time Verification Code
          </h4>
          <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 font-mono text-sm">
            {verification.code}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Expires at: {new Date(verification.expires_at).toLocaleString()}
          </p>
        </Card>
      ) : null}

      {pollReport ? (
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Last Poll Report
          </h4>
          <div className="space-y-1 text-sm">
            <p>Fetched updates: {pollReport.fetched}</p>
            <p>Accepted: {pollReport.accepted}</p>
            <p>Rejected: {pollReport.rejected}</p>
            <p>Verified now: {pollReport.verified_now ? 'yes' : 'no'}</p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
