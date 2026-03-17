import React from 'react'
import ReactDOM from 'react-dom/client'
import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'
import App from './App.tsx'
import './index.css'

const posthogKey = import.meta.env.VITE_POSTHOG_KEY
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: true,
    person_profiles: 'always',
  })
  if (import.meta.env.DEV) {
    console.log('[PostHog] init ok', posthogHost)
  }
} else if (import.meta.env.DEV) {
  console.warn('[PostHog] no VITE_POSTHOG_KEY – set it in .env and ensure env is available at build time')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </React.StrictMode>,
)
