import { useCallback, useEffect, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { ProjectState, SkillRecord } from '../types/api'

export function ProjectsPanel() {
  const { t } = useLocale()
  const [projects, setProjects] = useState<ProjectState[]>([])
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [skillToRun, setSkillToRun] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [projectsResult, skillsResult] = await Promise.all([
        api.projectsGetState(),
        api.skillsList(),
      ])
      setProjects(projectsResult)
      setSkills(skillsResult)
      setSkillToRun((current) => {
        if (current || skillsResult.length === 0) return current
        return skillsResult[0].slug
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить проекты', 'Failed to load projects'))
    }
  }, [t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function runSkill() {
    if (!skillToRun) return
    setError(null)
    setStatus(null)
    try {
      const result = await api.skillsRun(skillToRun)
      setStatus(
        t(
          `Навык ${skillToRun} выполнен. Задач: ${result.report.processed}, успешно: ${result.report.succeeded}`,
          `Skill ${skillToRun} executed. Jobs: ${result.report.processed}, success: ${result.report.succeeded}`,
        ),
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось запустить навык', 'Skill run failed'))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">{t('Проекты / Подмиры', 'Projects / Sub-worlds')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={skillToRun}
            onChange={(event) => setSkillToRun(event.target.value)}
          >
            {skills.map((skill) => (
              <option key={skill.id} value={skill.slug}>
                {skill.slug}
              </option>
            ))}
          </select>
          <Button onClick={() => void runSkill()} disabled={!skillToRun}>
            {t('Запустить навык', 'Run Skill')}
          </Button>
          <Button variant="outline" onClick={() => void loadAll()}>
            {t('Обновить', 'Refresh')}
          </Button>
        </div>
        {status ? <p className="mt-2 text-sm text-[var(--success)]">{status}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-semibold">{project.name}</h4>
              <Badge>{project.biome_type}</Badge>
            </div>
            <div className="space-y-1 text-sm">
              <p>{t('Уровень', 'Level')}: {project.level}</p>
              <p>XP: {project.xp}</p>
              <p>{t('Здоровье', 'Health')}: {project.health.toFixed(1)}</p>
              <p>{t('Открытые задачи', 'Open tasks')}: {project.open_tasks}</p>
              <p>{t('Сделано сегодня', 'Done today')}: {project.done_today}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
