import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './english.css'
import 'vazirmatn/Vazirmatn-Variable-font-face.css'

// a cinematic site always enters at the top — never restore a mid-page scroll
// from a previous visit (phones were jumping into old text on load)
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
