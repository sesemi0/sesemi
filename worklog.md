# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Recover SESEMI website project from user's ZIP upload, run it in the workspace, and continue development.

Work Log:
- Extracted user-uploaded ZIP «طراحی حرفه ای وبسایت.zip» (1.5MB) → identified as SESEMI studio site (Figma Make export)
- Stack: React 19 + Vite 8 + Tailwind CSS 4 + Three.js 0.186 + Lenis + Supabase edge functions
- Reviewed all source files: App.tsx (SPA routing: /, /services/:slug, /admin, /privacy, /start), Assistant.tsx (Sesi chat, guide-mode without backend), CinematicHero.tsx (3D scene), vite.config.ts (Figma plugins)
- Installed dependencies with bun (56 packages)
- Moved project from /home/z/my-project/sesemi → /home/z/my-project root so platform runner can manage it
- Changed vite.config.ts default port 8443 → 3000 (server + preview) to match platform preview gateway
- Verified live site https://sesemi.pages.dev is intact on Cloudflare
- Verified in agent-browser: home page renders (no console errors), service page /services/ai-advertising-videos loads, /admin (Owner Workspace) loads, Sesi chat opens with input + send button
- Screenshots saved: download/sesemi-home.png, sesemi-service.png, sesemi-admin.png, sesemi-chat.png

Stage Summary:
- SESEMI project fully restored and runnable in workspace on port 3000
- Sandbox kills background processes between tool calls; platform auto-runner / Complete tool is expected to keep dev server alive
- Backend (Sesi chat AI + contact form) is in guide/preview mode: VITE_AGENT_ENDPOINT and VITE_CONTACT_ENDPOINT are empty in .env.example; Supabase edge functions exist in supabase/functions/server
- Awaiting user's list of desired changes
