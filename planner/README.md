# Chiefs Planner

A shared task and content planner for the Chiefs team (Vlad and Igor), with real-time sync. It works in any browser and can be installed on a phone or computer as an app.

**Live:** `https://vladshaf2.github.io/estimate-calculator/planner/`. Add `?demo` to try it with sample data that stays in your browser.

## Features

- **Sign-in** with a 6-digit code from email. Only emails listed in `public.members` see any data; anyone else gets a "No access" screen and an empty database.
- **Workspaces:** "Clients" and "Chiefs Content", with color-coded projects.
- **Tasks:**
  - status, work types, assignee and priority;
  - due date with optional time, and a reminder time;
  - for posts: platform, publish time, hook and caption;
  - links (Higgsfield, Google Drive…) and a checklist.
- **Time zones:**
  - Due dates, reminders and the calendar use **Prague** time.
  - Post publish times are shown in **Prague and Almaty** side by side. You can enter them in either zone.
  - Daylight saving time is handled through IANA time zones, not fixed offsets.
- **Start screen: New task.** The app opens on a form to add a task and choose where it goes: workspace and project (a new project can be created right there), date, assignee and work types. The choice is remembered for the next task, and the tasks just added are listed below the form. Lists, board and calendar are in the menu. `N` opens this screen from anywhere.
- **Quick add** in one line, for example `Teaser #reel #ig @igor fri 18:00 +ala !!`:
  - `#` picks a work type, status, project or workspace (English or Russian name, prefix is enough);
  - `@` assigns someone (`@me`/`@я`); `!`, `!!`, `!!!` or `!high`/`!низкий` set the priority;
  - dates: `today`/`сегодня`, `tomorrow`/`завтра`, `послезавтра`, weekdays (`fri`, `пт`, `в пятницу`), `next mon`/`след пн`, `20.10`, `20 oct`/`20 окт`, `2026-11-03`;
  - times: `18:00`, `6pm`, `в 18`, `at 9`, in Prague time; add `+ala`/`+алм` to type Almaty time;
  - with `#ig`/`#tiktok`/`#yt` the date becomes the publish time, otherwise it is the due date.

  Chips under the field show what will be set. Words that aren't recognised stay in the title.
- **Push notifications** (Settings → Notifications), on phones and computers:
  - reminders at the reminder time;
  - due dates at the due time (all-day tasks at 09:00 Prague);
  - posts 30 minutes before publishing, with Prague and Almaty times;
  - a task assigned to you by someone else;
  - a revision on the production board (to the block's assignee, or to everyone else when there is none), including the client's;
  - a client accepting an estimate.

  Turn them on per device. Each kind can be switched off, quiet hours can be set in Prague time, and texts follow your interface language. On iPhone, add the app to the Home Screen first (iOS 16.4+).
- **Production** (🎬 in the menu): a board per project for AI production.
  - **Structure:** scenes → blocks (script lines/shots) → versions V1, V2… with generations: photos and videos up to 50 MB uploaded, longer videos as Google Drive / Higgsfield / YouTube links with an embedded player.
  - **Per block:** a status (Not started → In progress → Revisions → Done; click to advance), an assignee, an AI-specialist note, and revisions per version. Revisions take a text and an optional screenshot; they can be ticked off or turned into a planner task in one click.
  - **Automatic statuses:** a new generation moves a block to "In progress", a new revision to "Revisions".
  - **Overview:** progress cards, filters by status, search across script, notes and revisions, scene navigation, a trash with restore, and CSV export.
  - **Paste script** (or open a file: Word .docx, PDF, Final Draft .fdx, .txt, .md, .fountain) splits a screenplay into scenes and blocks. A scene starts at "Сцена 3", "INT. …", "3. Title" or any Word/markdown heading; paragraphs become blocks. Files are read in the browser.
  - **Selection:** tick blocks (or a whole scene) for bulk actions: merge, set status or assignee, move to trash.
  - **Merging:** blocks generated with one prompt (e.g. 1.1 + 1.2) become one row with shared status, versions, generations and revisions, and count as one block in the progress. **Split** undoes it; generations stay with the first block.
  - **Trash:** checkboxes, select all, restore or delete the selected items, empty the trash.
  - **Client link** (🔗 Client): the client opens `…/planner/#/share/<token>` without signing in and sees scenes, statuses, versions and generations (files through 6-hour signed URLs). They can leave revisions with their name: the block moves to "Revisions", the revision shows on the board as "Client · Name", and the team gets a push. AI notes, assignees and team revisions are never sent. A link can be revoked, or have revisions turned off. The page is served by the Edge Function `prod-share` (`supabase/functions/prod-share`), which checks the token.
  - **Adding files:** drag and drop, paste with Ctrl+V, or the Upload / Link buttons.
- **Accepted estimates** from the calculator's client link become a project with tasks automatically (see the main README).
- **Views:**
  - **List**, like Apple Reminders: quick add, tick to complete, edit the title in place.
  - **Board**, by status, with drag and drop (mouse or touch).
  - **Calendar**, by month or week.
- **Smart lists:** Today, Overdue, Needs fix, Waiting for client, Posts this week, Assigned to me, All.
- **Filters** by status, type, assignee, workspace and project, plus **search** across titles, notes, hooks and captions.
- **Settings:** statuses, work types, workspaces and projects can be added, renamed in both languages, recolored, reordered and deleted.
- **Themes:** Auto (follows the phone or computer setting), Light and Dark. Switch in the sidebar or Settings; the choice is saved per device.
- **Languages:** Russian and English. The choice is saved per device, and all strings live in `src/i18n/ru.json` and `src/i18n/en.json`.
- **Real-time sync** between users (Supabase Realtime). Changes appear instantly on your own screen and are sent to the server in the background.
- **Offline:** the app opens without a connection and shows the last loaded data.
- **Keyboard shortcuts:**
  - `N`: new task (start screen)
  - `/`: search
  - `1`–`4`: List / Board / Calendar / Settings
  - `Esc`: close

## Stack

- Vite + React + TypeScript, with plain CSS in the same visual style as the estimate calculator.
- `@supabase/supabase-js` for auth, database and realtime.
- `@dnd-kit/core` for the board.
- A small hand-written service worker for offline use.

## Database (Supabase)

- **Project:** `chiefs-planner` (ref `wvyvyodquijdxqdidcft`, region eu-central-1).
- **Migrations:** `supabase/migrations/`.
- **Tables:** `members`, `workspaces`, `projects`, `statuses`, `work_types`, `tasks`.
  - Notifications: `push_subscriptions` (one row per device).
  - Calculator link: `estimates`, `calc_settings`, `estimate_shares`.
  - Production: `prod_scenes`, `prod_blocks` (`group_id` = lead block of a merged row), `prod_shares` (client links), `prod_versions`, `prod_media`, `prod_revisions` (plus `projects.production`); files are in the private Storage bucket `prod` (50 MB per file, shown through signed URLs that last 6 hours).
  - Private schema (not reachable through the API): `private.notification_outbox` and `private.push_config` (VAPID keys, dispatcher secret).
- **Notifications pipeline:**
  - `pg_cron` runs every minute: `private.enqueue_due()` puts due reminders, deadlines and posts into the outbox, respecting each member's switches and quiet hours.
  - `private.kick_push()` calls the Edge Function `push-dispatch` (`supabase/functions/push-dispatch`) with a secret header.
  - The function sends Web Push messages and removes devices the browser has dropped.
  - VAPID keys are generated by the function on first run and stay in the database.
  - Nothing to register or configure.
- **Access rules:**
  - Every table has Row Level Security. The rule is `private.is_member()`: the signed-in user's email must be in `members`.
  - The `anon` role has no access at all.
  - The `authenticated` role can only select, insert, update and delete, filtered by RLS. `members` is read-only except for your own name, color and language.
- **Grants are always explicit.** From 30 Oct 2026 Supabase no longer grants API access to new `public` tables automatically, so every migration that creates a table must also `grant` what `authenticated` (and, only where intended, `anon`) may do.
- **Triggers:** a trigger keeps `updated_at` current, and sets `completed_at` when a task moves to a status marked "counts as done".
- **To add a team member**, run in the Supabase SQL editor:

  ```sql
  insert into public.members (email, name_en, name_ru, color) values ('new@example.com', 'Name', 'Имя', '#a78bfa');
  ```

## Environment variables

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://wvyvyodquijdxqdidcft.supabase.co` |
| `VITE_SUPABASE_KEY` | the project's **publishable** key (`sb_publishable_…`) |

Both are committed in `.env.production` and `.env.development` on purpose. The publishable key is designed to be public, because RLS protects the data. **Never** put the secret or `service_role` key in this app.

## Development

```bash
cd planner
npm ci
npm run dev        # http://localhost:5173/?demo
npm test           # unit tests: time zones, smart lists, quick add, script parser, production stats, i18n
npm run typecheck
npm run build      # → dist/
```

## Deploy

`.github/workflows/site.yml` runs on every push and pull request: it tests the calculator and the planner, then builds the planner. On `main` it also publishes:
- the calculator at the site root;
- the planner at `/planner/`.

**One-time setup:**
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. Supabase dashboard → **Authentication → Emails** → add `{{ .Token }}` to both the "Magic Link" and "Confirm signup" templates, so the login emails contain the code.

The built-in Supabase email service sends only a few emails per hour. That's enough for two people; add a custom SMTP server (for example Resend) if codes stop arriving.

## Not built yet

- Desktop and iPhone widgets.
