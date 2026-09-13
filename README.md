# DULMS Notify — Delta Smart Hub

**Developed by Eng. HASSAN MOHAMED**
Copyright (c) 2026 Eng. HASSAN MOHAMED. All rights reserved.

Live app: https://dulms-notify.lovable.app

DULMS Notify is a student companion for Delta University's DULMS portal. It
gives students a single, readable dashboard for their academic life and alerts
them about new activity instead of leaving notices buried inside the portal.

## What it does

- **Academic dashboard** — quizzes, assignments, courses, announcements,
  calendar events and profile data in one organised view.
- **Telegram alerts** — students link a Telegram account during setup and get
  notified when new items or changes appear.
- **AI assistance** — an account-aware assistant that answers questions about
  the student's own academic data.
- **GPA tools** — history, simulations, target planning, retake impact and
  graduation progress.
- **Schedule advisor** — suggests compact, conflict-free weekly schedules.
- **Course-group monitoring** — follows registration groups and reports changes;
  registration actions only happen when the student enables or confirms them.
- **Installable app (PWA)** with browser notifications, plus in-app support
  tickets.

## Privacy and security

- Student credentials are encrypted at rest and are used only to read the
  student's own DULMS data.
- All operational secrets (bot tokens, API keys, admin credentials) live in
  deployment secrets or in an encrypted vault — never in this repository.
- Usage and privacy policies are published in the app at `/policies`, and users
  must accept them before signing in.

## Legal

This repository is published for reference only. It is **not** open source:
see [LICENSE](./LICENSE). Reusing the code, architecture or automation logic —
in whole or in part — requires written permission from the author.

This is an independent student project, not affiliated with or endorsed by
Delta University.

## Contact

- Instagram: https://www.instagram.com/hq7o_
- LinkedIn: https://www.linkedin.com/in/hassan-m-1547a1391
- WhatsApp: +20 102 171 4351 · +966 50 051 0367

## Development

Requires Node.js 20+ (or Bun).

```sh
bun install
bun run dev
```

Runtime configuration comes from environment variables — see
[`.env.example`](./.env.example). Never commit a real `.env`.
