import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/luckiest-guy/400.css'

import App from './App.jsx'
import BloxityProvider from './bloxity/BloxityProvider.jsx'
import './index.css'

// Inside Boxity (an iframe), its toolbar sits over the top-left corner: the HUD
// leaves room for it (html.is-framed in index.css).
try {
  if (window.self !== window.top) document.documentElement.classList.add('is-framed')
} catch {
  document.documentElement.classList.add('is-framed')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Slug comes from VITE_GAME_SLUG in client/.env — see .env.example. */}
    <BloxityProvider gameSlug={import.meta.env.VITE_GAME_SLUG}>
      <App />
    </BloxityProvider>
  </StrictMode>,
)
