import { useCallback, useEffect, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import type { ProjectState, SkillRecord } from '../types/api'

export function ProjectsPanel() {
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
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    }
  }, [])

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
        `Skill ${skillToRun} executed. Jobs: ${result.report.processed}, success: ${result.report.succeeded}`,
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skill run failed')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">Projects / Sub-worlds</h3>
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
            Run Skill
          </Button>
          <Button variant="outline" onClick={() => void loadAll()}>
            Refresh
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
              <p>Level: {project.level}</p>
              <p>XP: {project.xp}</p>
              <p>Health: {project.health.toFixed(1)}</p>
              <p>Open tasks: {project.open_tasks}</p>
              <p>Done today: {project.done_today}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
