# CAC CRM

A CRM for managing the complete sales cycle for a sales team of 6 sales managers reporting to a Head of Sales.

## Features

- **Role-based access** — the Head of Sales sees data across the whole team; each Sales Manager sees only their own leads, deals, accounts, contacts and activities.
- **Leads** — capture, qualify, and convert leads into deals.
- **Pipeline (Deals)** — a drag-and-drop Kanban board across Qualification → Needs Analysis → Proposal → Negotiation → Won/Lost.
- **Accounts & Contacts** — track companies and the people at them.
- **Activities** — log and schedule calls, emails, meetings and tasks; a personal task list per rep.
- **Dashboard** — pipeline funnel, win rate, upcoming activities, recently updated deals, and (for the Head) a team leaderboard.
- **Team Reports** (Head only) — per-rep pipeline value, quarterly wins, win rate and activity counts, with a comparison chart.

## Tech stack

- Next.js (App Router) + TypeScript
- Prisma ORM + SQLite (swap the `DATABASE_URL` for Postgres/MySQL in production)
- Auth.js (NextAuth v5) with credentials login
- Tailwind CSS, Recharts

## Getting started

```bash
npm install
cp .env.example .env    # then set a real AUTH_SECRET
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Visit http://localhost:3000/login.

### Demo credentials

All seeded users share the password `password123`.

| Role          | Email               |
|---------------|---------------------|
| Head of Sales | head@caccrm.com     |
| Sales Manager | priya@caccrm.com    |
| Sales Manager | rohan@caccrm.com    |
| Sales Manager | ananya@caccrm.com   |
| Sales Manager | karan@caccrm.com    |
| Sales Manager | sneha@caccrm.com    |
| Sales Manager | vikram@caccrm.com   |

### Useful scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build & serve
- `npm run lint` — lint
- `npm run db:seed` — reseed demo data (run against an empty database)
- `npm run db:reset` — drop, re-migrate and reseed the local database (destructive, local dev only)

## Data model

`User` (HEAD / SALES_MANAGER, with a `managerId` self-relation) owns `Account`, `Contact`, `Lead`, `Deal`, `Activity` and `Note` records. A `Lead` converts into a `Deal` (tracked via `Lead.convertedDealId`), and a `Deal` moves through `DealStage` (Qualification → Needs Analysis → Proposal → Negotiation → Won/Lost). See `prisma/schema.prisma` for the full schema.
