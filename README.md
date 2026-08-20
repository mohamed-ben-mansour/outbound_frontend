# Nudge Console — frontend

A **new, purpose-built frontend** for the Addvocate / Nudge outbound platform.
Fresh dark-premium design (no UI kit) — deliberately different from the older
`frontend_outbound_folder` mock dashboard.

It talks **only** to the **Nudge Global Orchestrator** (`nudge_ai_outbound_orchestrator/nudge-global-orchestrator`, FastAPI on `:8100`), which persists everything to the database (`campaigns`, `user_campaign_inputs`, `blacklist_entries`, `campaign_weights`, `artifacts`, `final_packages`, `outreach_threads`, `outreach_sequence_steps`, `outreach_audit_events`, …).

## Stack

- React 18 + Vite 5 + TypeScript (strict)
- Tailwind CSS 3 (custom dark design tokens in `tailwind.config.js`)
- React Query (data fetching + live polling), React Router, Lucide icons, Sonner toasts

## Quick start

```bash
cd frontend_new
npm install
npm run dev        # http://localhost:5174
```

Configure the backend URL if needed (defaults to `http://localhost:8100`):

```bash
# frontend_new/.env
VITE_API_URL=http://localhost:8100
```

Start the backend first (see `nudge_ai_outbound_orchestrator/nudge-global-orchestrator/README.md`).

## The flow this console drives

| Page | What it does | Backend endpoints |
|---|---|---|
| **Overview** (`/`) | Workspace (user_id) switcher, health, campaign stats, recent campaigns | `GET /health`, `GET /campaigns?user_id=` |
| **Configure** (`/setup`) | Every campaign input: ICP brief + structured attrs, offering, blacklist, scoring weights, sourcing limit, outreach settings (auto-start Phase B, approval mode, sender info), AI sequence options, personality/voice. Save draft or **Save & Launch**. | `POST /campaigns/params`, `GET/PATCH /campaigns/params/{user_id}`, `POST /campaigns/start` |
| **Campaigns** (`/campaigns`) | List + launch / retry / **duplicate-and-start** / **stop** campaigns, true per-campaign status | `GET /campaigns?user_id=`, `POST /campaigns/start`, `POST /campaigns/{id}/start`, `POST /campaigns/{id}/stop`, `POST /campaigns/{id}/duplicate` |
| **Campaign detail** (`/campaigns/:id`) | | |
| · Pipeline | Live Phase A stepper (`icp_extract → fetch_companies → rank_companies → fetch_intent → rescore_intent → fetch_personas → rank_personas → enrich_contacts → package_ready`) + artifact activity feed + extracted ICP features + **"ICP understood by the engine"** card (verify the parse before approving) + currency-aware revenue display | `GET /campaigns/{id}` (polled) |
| · Refresh | Manual **Refresh now** + auto-refresh (off/daily/weekly) — Track A re-fetches intent + re-scores existing companies, Track B discovers new companies under the campaign's frozen rules (ICP snapshot, blacklist, weights) — + "Last refreshed" timestamp + approve Track B candidates | `POST /campaigns/{id}/refresh`, `POST /campaigns/{id}/refresh/approve` |
| · Usage & credits | Apollo credits (lead / direct-dial / AI) + LLM tokens by module — cumulative across Phase A, every refresh pass, and outreach | `GET /campaigns/{id}/usage` |
| · Companies | Scored companies with **two honest numbers — Fit (firmographic) + Intent (buying signals)** + ⓘ why-tooltip, decline (greys out + stops refresh), already-contacted / below-fit / pending labels | `GET /campaigns/{id}/companies`, `POST /campaigns/{id}/companies/decline` |
| · Personas | Scored personas with **Fit + Intent + ⓘ rationale**, reachability note when outreach was skipped (no usable email/LinkedIn), per-persona Start outreach | `GET /campaigns/{id}/personas` |
| · Outreach | Phase B threads grouped by lifecycle (awaiting approval / running / message validation / finished / stopped) → **approve/reject** whole sequence, per-step approve/skip/regenerate (per_step modes only), **Stop** / **Resume** / **Delete** (soft-delete, kept in DB), **Resolve action** for blocked sends, edit message / sequence / modify pending sequence, **prospect reply** (stops the sequence), audit trail, LLM observability | `GET /campaigns/{id}/outreach`, `POST /campaigns/{id}/outreach`, `POST .../outreach/{thread_id}/approve`, `POST .../outreach/{thread_id}/stop`, `POST .../outreach/{thread_id}/resume`, `POST .../outreach/{thread_id}/delete`, `POST .../outreach/{thread_id}/modify`, `POST .../outreach/workflow/{workflow_id}/resolve-action`, workflow signal endpoints, `POST /campaigns/{id}/reply`, `GET .../outreach/audit`, `GET .../outreach/observability` |

## How Phase B auto-start works

With **Auto-start Phase B** enabled in Configure (default), the orchestrator calls
`start_outreach_for_campaign()` as soon as `final_packages` are saved — no manual step.
Each lead package becomes an outreach thread; with `approval_mode: per_sequence`
(default) the workflow pauses at `outreach_awaiting_approval`, and this console shows
the sequence for review. Approving dispatches it and per-step messages are generated.
You can also start outreach manually from the campaign's Outreach tab.

The threads query polls while the campaign is `running`, so auto-started sequences
appear in the UI without needing a manual "Start outreach" click.

## Company approval gate (Phase A human-in-the-loop)

Phase A has its own approval pause, before any personas are searched. With
**auto-approve off** (`auto_approve: false`), the qualifier interrupts at
`ready_for_personas` and the pipeline **waits** — the Companies tab shows
`pending` until you approve or decline. Persona discovery only runs for
**approved** companies (`POST /campaigns/{id}/companies/approve`).

With **auto-approve on**, there is no pause: companies above the fit floor pass
straight through and persona discovery starts automatically (declined companies
are still excluded and counted against the target).

## Outreach review — grouping, stop/delete, resolve

The **Outreach** tab organizes threads into sections by lifecycle:

| Section | Contents |
|---|---|
| **Message validation** | `action_required` (send blocked by rate limit / exhausted credits) + pending per-step messages in `per_step_and_message` mode |
| **Awaiting approval** | Sequences paused for whole-sequence review |
| **Running** | Sequences live on schedule (`in_progress`, `approved`, `dispatched`, `partially_sent`) |
| **Finished** | Completed, replied, rejected, or failed |
| **Stopped / deleted** | Greyed out and inactive — kept in the DB for the record |

Every sequence exposes two lifecycle actions:
- **Stop** — signals the Temporal workflow to halt (`POST /campaigns/{id}/outreach/{thread_id}/stop`). The thread stays visible in its section; reactivation is planned.
- **Delete** — same backend stop, plus the thread is marked `deleted`: greyed out, no further actions (`POST /campaigns/{id}/outreach/{thread_id}/delete`). Nothing is physically removed — thread, steps, and sent messages stay in the DB.

Step-level controls follow the campaign's approval mode: per-step **Approve / Skip / Regenerate**
only appear for `per_step_and_message`; `per_sequence` shows only the whole-sequence
approve/reject bar plus message/sequence editing. **Resolve action**
unblocks a step that failed with a recoverable error — the modal lists the provider's
fallback actions (retry connect-only, switch channel, skip) and calls
`POST .../outreach/workflow/{workflow_id}/resolve-action`, after which the workflow
applies the choice and re-sends.

Every step also shows:
- **Two times** — the schedule fires at one UTC instant, displayed both in the **user's
  local timezone** and the **prospect's local timezone** (e.g. `Thu, Aug 14, 6:00 PM GMT+1`
  and `Thu, Aug 14, 10:00 AM (UTC−7)`). The prospect chip is computed deterministically
  from the stored UTC timestamp + the prospect's timezone offset; the user chip is the
  same instant rendered in the browser's timezone. The sequence is *built* in prospect
  time; the user time is display-only. When the prospect's location resolves to an IANA
  zone (`timezone_iana`, e.g. `Europe/Berlin`), the prospect chip is rendered via `Intl`
  with that zone — **DST-correct** — and falls back to offset math only when no zone exists.
- **An ⓘ tooltip** on hover with the AI's rationale for the step: **Why this timing ·**
  (`timing_justification`, e.g. *"Scheduled for Thursday morning at 11:00 AM PDT…"*) and
  **Why this step ·** (`sequence_architecture_rationale`). These come from persisted
  DB columns, so they survive restarts and are never substituted with strategy notes.

## Project layout

```
src/
  lib/       types.ts · api.ts (typed client) · utils.ts · stages.ts · enrich.ts (artifact merging)
  hooks/     queries.ts (React Query hooks + polling)
  context/   WorkspaceContext (user_id, persisted to localStorage)
  components/ Layout · ui.tsx (primitives) · StageStepper · CompanyCard · PersonaCard
              ThreadReview · SequenceTimeline · AuditFeed
  pages/     Dashboard · Setup · Campaigns · CampaignDetail
```
