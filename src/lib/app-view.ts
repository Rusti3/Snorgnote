export type AppView = 'main' | 'flashcards-review'

export function resolveAppView(search: string): AppView {
  const params = new URLSearchParams(search)
  const view = params.get('view')
  if (view === 'flashcards-review') {
    return 'flashcards-review'
  }
  return 'main'
}
