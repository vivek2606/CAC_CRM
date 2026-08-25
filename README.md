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
- Prisma ORM + Postgres
- Auth.js (NextAuth v5) with credentials login
- Tailwind CSS, Recharts

## Getting started (local development)

You need a Postgres database. The fastest free option is [neon.tech](https://neon.tech) — sign up, create a project, and copy its connection string.

```bash
npm install
cp .env.example .env    # paste your Postgres connection string, and set a real AUTH_SECRET
npm run db:migrate      # creates the tables (first run will prompt for a migration name, e.g. "init")
npm run db:seed
npm run dev
```

Visit http://localhost:3000/login.

## Deploying to Vercel (so you can use it from an iPad/phone)

1. **Database**: create a free Postgres database at [neon.tech](https://neon.tech) (or use Vercel's own Postgres/Neon integration from the Storage tab of your project). Copy the connection string.
2. Point your local `.env` at that same connection string, then run `npm run db:migrate` and `npm run db:seed` once, locally, to create and populate the tables. Commit the generated `prisma/migrations/` folder.
3. Push your changes to GitHub.
4. On [vercel.com](https://vercel.com), **Add New → Project**, import this repo, and select the branch.
5. In the project's **Environment Variables**, add:
   - `DATABASE_URL` — the same Postgres connection string
   - `AUTH_SECRET` — generate one with `openssl rand -base64 32`
6. Deploy. Every future deploy re-runs `prisma migrate deploy` automatically as part of the build, so schema changes roll out with the code.
7. Open the `*.vercel.app` URL Vercel gives you in Safari on your iPad — it works like any responsive web app, and you can **Share → Add to Home Screen** for an app-like icon.

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
- `npm run build` / `npm run start` — production build & serve (build also applies pending migrations)
- `npm run lint` — lint
- `npm run db:migrate` — create/apply a Prisma migration against your database
- `npm run db:seed` — reseed demo data (run against an empty database)
- `npm run db:reset` — drop, re-migrate and reseed the local database (destructive, local dev only)

## Data model

`User` (HEAD / SALES_MANAGER, with a `managerId` self-relation) owns `Account`, `Contact`, `Lead`, `Deal`, `Activity` and `Note` records. A `Lead` converts into a `Deal` (tracked via `Lead.convertedDealId`), and a `Deal` moves through `DealStage` (Qualification → Needs Analysis → Proposal → Negotiation → Won/Lost). See `prisma/schema.prisma` for the full schema.
