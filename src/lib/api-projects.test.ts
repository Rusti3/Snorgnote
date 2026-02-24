import { describe, expect, it, vi } from 'vitest'

async function loadApiModule() {
  vi.resetModules()
  const mod = await import('./api')
  return mod.api
}

describe('api projects mock contract', () => {
  it('assigns selected notes to a project and returns report', async () => {
    const api = await loadApiModule()

    await api.vaultSaveNote('Notes/proj-a.md', '# A\n\nbody')
    await api.vaultSaveNote('Notes/proj-b.md', '# B\n\nbody')

    const report = await api.projectsAssignNotes('project_life', [
      'Notes/proj-a.md',
      'Notes/proj-b.md',
      'Notes/missing.md',
    ])

    expect(report.updated).toBe(2)
    expect(report.skipped).toBe(1)

    const details = await api.projectsListDetails()
    const life = details.find((item) => item.project.id === 'project_life')
    expect(life).toBeTruthy()
    expect(life?.notes.some((note) => note.path === 'Notes/proj-a.md')).toBe(true)
    expect(life?.notes.some((note) => note.path === 'Notes/proj-b.md')).toBe(true)
  })

  it('supports create update delete lifecycle for project tasks', async () => {
    const api = await loadApiModule()

    const created = await api.projectsTaskCreate({
      projectId: 'project_general',
      title: 'Ship project panel',
      status: 'todo',
      energy: 'high',
      dueAt: '2030-01-01T10:00:00Z',
    })

    expect(created.id).toBeTruthy()
    expect(created.status).toBe('todo')
    expect(created.energy).toBe('high')

    const updated = await api.projectsTaskUpdate(created.id, {
      title: 'Ship project panel v2',
      status: 'done',
      energy: 'low',
      dueAt: null,
    })

    expect(updated.title).toContain('v2')
    expect(updated.status).toBe('done')
    expect(updated.energy).toBe('low')
    expect(updated.due_at).toBeUndefined()

    await api.projectsTaskDelete(created.id)

    const details = await api.projectsListDetails()
    const general = details.find((item) => item.project.id === 'project_general')
    expect(general).toBeTruthy()
    expect(general?.tasks.some((task) => task.id === created.id)).toBe(false)
  })

  it('supports paginated project details for notes and tasks', async () => {
    const api = await loadApiModule()

    await api.vaultSaveNote('Notes/pag-1.md', '# P1\n\nA')
    await api.vaultSaveNote('Notes/pag-2.md', '# P2\n\nB')
    await api.vaultSaveNote('Notes/pag-3.md', '# P3\n\nC')
    await api.projectsAssignNotes('project_life', [
      'Notes/pag-1.md',
      'Notes/pag-2.md',
      'Notes/pag-3.md',
    ])
    await api.projectsTaskCreate({
      projectId: 'project_life',
      title: 'T1',
      status: 'todo',
      energy: 'medium',
    })
    await api.projectsTaskCreate({
      projectId: 'project_life',
      title: 'T2',
      status: 'todo',
      energy: 'medium',
    })
    await api.projectsTaskCreate({
      projectId: 'project_life',
      title: 'T3',
      status: 'done',
      energy: 'low',
    })

    const page = await api.projectsListDetails({
      projectId: 'project_life',
      notesLimit: 1,
      notesOffset: 1,
      tasksLimit: 1,
      tasksOffset: 1,
    })
    expect(page.length).toBe(1)
    expect(page[0].project.id).toBe('project_life')
    expect(page[0].notes_total).toBe(3)
    expect(page[0].tasks_total).toBe(3)
    expect(page[0].notes.length).toBe(1)
    expect(page[0].tasks.length).toBe(1)

    const notesOnlyPage = await api.projectsListDetails({
      projectId: 'project_life',
      notesLimit: 1,
      notesOffset: 0,
      tasksLimit: 0,
      tasksOffset: 0,
    })
    expect(notesOnlyPage[0].notes.length).toBe(1)
    expect(notesOnlyPage[0].tasks.length).toBe(0)
  })
})
