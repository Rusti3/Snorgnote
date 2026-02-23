import { Brain, CalendarDays, Clock4, FolderKanban, Inbox, ScrollText, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from './components/ui/badge'
import { Card } from './components/ui/card'
import { WindowTitlebar } from './components/window-titlebar'
import { FocusPanel } from './features/focus-panel'
import { InboxPanel } from './features/inbox-panel'
import { NotesPanel } from './features/notes-panel'
import { PlanningPanel } from './features/planning-panel'
import { ProjectsPanel } from './features/projects-panel'
import { SettingsPanel } from './features/settings-panel'
import { StatsPanel } from './features/stats-panel'
import { api } from './lib/api'
import { useLocale } from './lib/locale'

type TabId = 'inbox' | 'notes' | 'planning' | 'projects' | 'focus' | 'stats' | 'settings'

export default function App() {
  const { t } = useLocale()
  const [tab, setTab] = useState<TabId>('inbox')

  const tabs = useMemo<Array<{ id: TabId; label: string; icon: typeof Inbox }>>(
    () => [
      { id: 'inbox', label: t('Входящие', 'Inbox'), icon: Inbox },
      { id: 'notes', label: t('Заметки', 'Notes'), icon: ScrollText },
      { id: 'planning', label: t('День/Неделя', 'Daily/Weekly'), icon: CalendarDays },
      { id: 'projects', label: t('Проекты', 'Projects'), icon: FolderKanban },
      { id: 'focus', label: t('Фокус', 'Focus'), icon: Clock4 },
      { id: 'stats', label: t('Статистика', 'Stats'), icon: Brain },
      { id: 'settings', label: t('Настройки', 'Settings'), icon: Settings },
    ],
    [t],
  )

  const title = useMemo(
    () => tabs.find((candidate) => candidate.id === tab)?.label ?? 'Snorgnote',
    [tab, tabs],
  )

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <WindowTitlebar />
      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="bg-[var(--surface-gradient)] p-4">
              <h1 className="font-display text-2xl font-semibold">Snorgnote</h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                {t(
                  'Собрать -> Обработать -> Организовать -> Действовать -> Измерить -> Прокачаться',
                  'Capture -> Process -> Organize -> Act -> Measure -> Level up',
                )}
              </p>
            </div>
            <div className="space-y-1 p-2">
              {tabs.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      tab === item.id
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'hover:bg-[var(--muted)]'
                    }`}
                    onClick={() => setTab(item.id)}
                    type="button"
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card>
            <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('Режим', 'Mode')}
            </p>
            <Badge>
              {api.isTauri() ? t('Tauri (нативный)', 'Tauri (native)') : t('Веб (мок)', 'Web (mock)')}
            </Badge>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card>
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              {t(
                'v0.1.13: добавлен live-preview кастомной темы и разделение ролей цветов (основной: фон/titlebar, дополнительный: кнопки/акценты).',
                'v0.1.13: added custom theme live preview and split color roles (primary: background/titlebar, secondary: buttons/accents).',
              )}
            </p>
          </Card>

          {tab === 'inbox' ? <InboxPanel /> : null}
          {tab === 'notes' ? <NotesPanel /> : null}
          {tab === 'planning' ? <PlanningPanel /> : null}
          {tab === 'projects' ? <ProjectsPanel /> : null}
          {tab === 'focus' ? <FocusPanel /> : null}
          {tab === 'stats' ? <StatsPanel /> : null}
          {tab === 'settings' ? <SettingsPanel /> : null}
        </main>
      </div>
    </div>
  )
}
