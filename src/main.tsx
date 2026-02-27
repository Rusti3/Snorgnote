import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FlashcardsReviewWindow } from './features/flashcards-review-window.tsx'
import { resolveAppView } from './lib/app-view.ts'
import { LocaleProvider } from './lib/locale.tsx'
import { ThemeProvider } from './lib/theme.tsx'

const appView = resolveAppView(window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        {appView === 'flashcards-review' ? <FlashcardsReviewWindow /> : <App />}
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
)
