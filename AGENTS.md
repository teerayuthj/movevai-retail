# AGENTS.md — MoveVai Retail

This repo is a React/Vite frontend with Capacitor iOS/Android shells. Follow `CLAUDE.md` for project structure and conventions.

## Required Handoff Process

The user tests native changes from Xcode Simulator or Android Emulator. After an AI agent edits anything that can affect the native app, the agent must prepare the native project before handing off.

Native-impacting changes include:

- Messenger mobile flow, close-job flow, camera/photo upload, GPS, push, API base URLs, auth/session behavior
- Any Capacitor-related code or config
- Any file under `ios/` or `android/`
- Any UI/logic the user says they will test in Xcode, iOS Simulator, Android Studio, or an emulator

Before final response:

- iOS/Xcode target: run `npm run agent:ready:ios`
- Android target: run `npm run agent:ready:android`
- Both platforms or uncertain target: run `npm run agent:ready:native`
- Web-only target: run at least `npm run typecheck` and `npm run build`

Do not hand work back by telling the user to run `npm run build` or `npx cap sync ...` themselves. The expected handoff is: the native assets are already synced, and the user only needs to press rebuild/run in the simulator.

In the final response, state exactly which verification/sync commands passed.
