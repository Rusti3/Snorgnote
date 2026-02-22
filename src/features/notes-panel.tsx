import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { NoteDocument, NoteSummary } from '../types/api'

export function NotesPanel() {
  const { t } = useLocale()
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [editor, setEditor] = useState('')
  const [newPath, setNewPath] = useState('Notes/new-note.md')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedSummary = useMemo(
    () => notes.find((note) => note.path === selectedPath) ?? null,
    [notes, selectedPath],
  )

  const loadNotes = useCallback(async () => {
    setError(null)
    try {
      const result = await api.vaultListNotes()
      setNotes(result)
      setSelectedPath((current) => {
        if (current || result.length === 0) return current
        return result[0].path
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить заметки', 'Failed to load notes'))
    }
  }, [t])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (!selectedPath) return
    setStatus(null)
    void (async () => {
      try {
        const doc = await api.vaultGetNote(selectedPath)
        setEditor(doc.body_md)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('Не удалось открыть заметку', 'Failed to open note'))
      }
    })()
  }, [selectedPath, t])

  async function onSave(pathOverride?: string) {
    const path = (pathOverride ?? selectedPath) || newPath
    if (!path.trim()) return
    try {
      const saved: NoteDocument = await api.vaultSaveNote(path.trim(), editor)
      setSelectedPath(saved.path)
      setStatus(`${t('Сохранено', 'Saved')}: ${saved.path}`)
      await loadNotes()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось сохранить заметку', 'Failed to save note'))
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('Заметки Vault', 'Vault Notes')}</h3>
          <Badge>{notes.length}</Badge>
        </div>
        <div className="rounded-md border border-[var(--border)] p-2">
          <label className="mb-1 block text-xs text-[var(--muted-foreground)]">
            {t('Путь для создания / Сохранить как', 'Create / Save As Path')}
          </label>
          <input
            className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={newPath}
            onChange={(event) => setNewPath(event.target.value)}
          />
          <Button
            className="mt-2 w-full"
            variant="outline"
            onClick={() => void onSave(newPath)}
          >
            {t('Сохранить как новую', 'Save As New Note')}
          </Button>
        </div>

        <div className="max-h-[58vh] space-y-1 overflow-auto pr-1">
          {notes.map((note) => (
            <button
              key={note.id}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                note.path === selectedPath
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                  : 'border-[var(--border)] hover:bg-[var(--muted)]'
              }`}
              onClick={() => setSelectedPath(note.path)}
            >
              <div className="font-medium">{note.title}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{note.path}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {selectedSummary?.title ?? t('Markdown-редактор', 'Markdown Editor')}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {selectedPath || t('Выберите заметку или создайте новую', 'Select a note or create one')}
            </p>
          </div>
          <Button onClick={() => void onSave()} disabled={!selectedPath && !newPath}>
            {t('Сохранить', 'Save')}
          </Button>
        </div>
        <textarea
          className="min-h-[65vh] w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm"
          placeholder={t('# Заголовок заметки', '# Note title')}
          value={editor}
          onChange={(event) => setEditor(event.target.value)}
        />
        {status ? <p className="text-sm text-[var(--success)]">{status}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>
    </div>
  )
}
