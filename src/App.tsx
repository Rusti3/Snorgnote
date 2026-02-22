import { Brain, CalendarDays, Clock4, FolderKanban, Inbox, ScrollText, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from './components/ui/badge'
import { Card } from './components/ui/card'
import { FocusPanel } from './features/focus-panel'
import { InboxPanel } from './features/inbox-panel'
import { NotesPanel } from './features/notes-panel'
import { PlanningPanel } from './features/planning-panel'
import { ProjectsPanel } from './features/projects-panel'
import { SettingsPanel } from './features/settings-panel'
import { StatsPanel } from './features/stats-panel'
import { api } from './lib/api'

type TabId = 'inbox' | 'notes' | 'planning' | 'projects' | 'focus' | 'stats' | 'settings'

const tabs: Array<{ id: TabId; label: string; icon: typeof Inbox }> = [
  { id: 'inbox', label: 'Входящие', icon: Inbox },
  { id: 'notes', label: 'Заметки', icon: ScrollText },
  { id: 'planning', label: 'День/Неделя', icon: CalendarDays },
  { id: 'projects', label: 'Проекты', icon: FolderKanban },
  { id: 'focus', label: 'Фокус', icon: Clock4 },
  { id: 'stats', label: 'Статистика', icon: Brain },
  { id: 'settings', label: 'Настройки', icon: Settings },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('inbox')
  const title = useMemo(
    () => tabs.find((candidate) => candidate.id === tab)?.label ?? 'Snorgnote',
    [tab],
  )

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="bg-[var(--surface-gradient)] p-4">
              <h1 className="font-display text-2xl font-semibold">Snorgnote</h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                {'Собрать -> Обработать -> Организовать -> Действовать -> Измерить -> Прокачаться'}
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
              Режим
            </p>
            <Badge>{api.isTauri() ? 'Tauri (нативный)' : 'Веб (мок)'}</Badge>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card>
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              v0.1.4: русская локализация интерфейса, локальный vault, конвейер задач, навыки, планирование, фокус и метрики.
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
