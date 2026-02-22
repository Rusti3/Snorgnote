import { RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { NoteDocument, NoteSummary, TrashedNoteSummary } from '../types/api'

export function NotesPanel() {
  const { t } = useLocale()
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [trashedNotes, setTrashedNotes] = useState<TrashedNoteSummary[]>([])
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [editor, setEditor] = useState('')
  const [newPath, setNewPath] = useState('Notes/new-note.md')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedSummary = useMemo(
    () => notes.find((note) => note.path === selectedPath) ?? null,
    [notes, selectedPath],
  )

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const [notesResult, trashResult] = await Promise.all([
        api.vaultListNotes(),
        api.vaultTrashList(),
      ])
      setNotes(notesResult)
      setTrashedNotes(trashResult)

      setSelectedPath((current) => {
        if (current && notesResult.some((note) => note.path === current)) {
          return current
        }
        return notesResult[0]?.path ?? ''
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось загрузить заметки', 'Failed to load notes'),
      )
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!selectedPath) return
    setStatus(null)
    void (async () => {
      try {
        const doc = await api.vaultGetNote(selectedPath)
        setEditor(doc.body_md)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t('Не удалось открыть заметку', 'Failed to open note'),
        )
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
      await loadData()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось сохранить заметку', 'Failed to save note'),
      )
    }
  }

  async function onDeleteSelected() {
    if (!selectedPath) return
    const confirmed = window.confirm(
      t(
        'Переместить выбранную заметку в корзину?',
        'Move selected note to trash?',
      ),
    )
    if (!confirmed) return

    try {
      await api.vaultDeleteNote(selectedPath)
      setStatus(t('Заметка перемещена в корзину', 'Note moved to trash'))
      setSelectedPath('')
      setEditor('')
      await loadData()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось удалить заметку', 'Failed to delete note'),
      )
    }
  }

  async function onRestore(trashId: string) {
    try {
      const restored = await api.vaultRestoreNote(trashId)
      setStatus(`${t('Восстановлено', 'Restored')}: ${restored.path}`)
      setSelectedPath(restored.path)
      setEditor(restored.body_md)
      await loadData()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось восстановить заметку', 'Failed to restore note'),
      )
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
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

        <div className="max-h-[40vh] space-y-1 overflow-auto pr-1">
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

        <div className="rounded-md border border-[var(--border)] p-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('Корзина заметок', 'Notes Trash')}
            </p>
            <Badge>{trashedNotes.length}</Badge>
          </div>
          <div className="max-h-[18vh] space-y-2 overflow-auto pr-1">
            {trashedNotes.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('Корзина пуста', 'Trash is empty')}
              </p>
            ) : (
              trashedNotes.map((note) => (
                <div key={note.id} className="rounded-md border border-[var(--border)] p-2">
                  <p className="truncate text-sm font-medium">{note.title}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {note.original_path}
                  </p>
                  <Button
                    className="mt-2 w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => void onRestore(note.id)}
                  >
                    <RotateCcw size={14} />
                    {t('Восстановить', 'Restore')}
                  </Button>
                </div>
              ))
            )}
          </div>
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
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void onDeleteSelected()} disabled={!selectedPath}>
              <Trash2 size={14} />
              {t('Удалить', 'Delete')}
            </Button>
            <Button onClick={() => void onSave()} disabled={!selectedPath && !newPath}>
              {t('Сохранить', 'Save')}
            </Button>
          </div>
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
