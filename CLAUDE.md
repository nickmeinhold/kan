# Kan (10xdeca fork)

Fork of [kanbn/kan](https://github.com/kanbn/kan). See `AGENTS.md` for general project conventions (code style, patterns, structure).

This file covers fork-specific context.

## Remotes

- `origin` — `https://github.com/10xdeca/kan.git` (our fork)
- `upstream` — `https://github.com/kanbn/kan.git` (upstream)

Keep `main` in sync with upstream. All 10xdeca work lives on feature branches.

## Deployment

Deployed to **tasks.xdeca.com**. The VPS is a GCP Compute Engine e2-medium (2 vCPU, 4GB RAM).

- **IP:** `34.116.110.7`
- **SSH:** `ssh ubuntu@34.116.110.7`
- **Infra repo:** [xdeca-infra](https://github.com/10xdeca/xdeca-infra) (`~/git/xdeca/xdeca-infra`)

### CI/CD (GitHub Actions → GHCR)

Pushing to `deploy/combined` triggers `.github/workflows/fork-deploy.yml`, which builds a `linux/amd64` Docker image and pushes it to `ghcr.io/10xdeca/kan`.

**Image tags:**
- `deploy-combined` — rolling tag, always the latest build from that branch
- `sha-<short>` — immutable tag per commit, useful for rollback

**To deploy** (from the VPS or via SSH):
```bash
docker compose pull && docker compose up -d
```

The VPS docker-compose references `image: ghcr.io/10xdeca/kan:deploy-combined`.

### VPS setup

The GHCR package is **public**, so no `docker login` is needed on the VPS. The VPS docker-compose config lives in [xdeca-infra](https://github.com/10xdeca/xdeca-infra) at `kanbn/docker-compose.yml`.

## Feature Branches

| Branch | Status | Description |
|--------|--------|-------------|
| `deploy/combined` | Deployed | Webhooks on latest upstream — the live branch |
| `feature/webhooks` | Deployed, split into PRs below | Webhook delivery on card CRUD events |
| `feature/webhooks-1-db-schema` | PR #391 | DB schema, migration, webhook repository |
| `feature/webhooks-2-delivery` | PR #392 | Webhook delivery utility + card event integration |
| `feature/webhooks-3-crud-api` | PR #393 | Webhook CRUD API router + tests |
| `feature/webhooks-4-ui` | PR #394 | Webhook management UI |

## Upstream Sync & Rebasing

When syncing with upstream:

```bash
git fetch upstream
git checkout main
git reset --hard upstream/main
git push origin main --force
```

Then rebase feature branches onto new main. Important:

- **i18n files**: During rebase conflicts in `apps/web/src/locales/`, reset compiled `.ts` files to main's version and regenerate:
  ```bash
  git checkout main -- apps/web/src/locales/
  pnpm --filter @kan/web lingui:compile
  ```
  The `.po` files are the source of truth; `.ts` files are compiled output.

- **pnpm-lock.yaml**: If upstream changed dependencies, the lockfile will be stale after rebase. Run `pnpm install --no-frozen-lockfile` and commit the updated lockfile before deploying.

- **Drizzle migration ordering**: `drizzle-kit migrate` uses a timestamp high-water mark — it only applies migrations where `when > lastAppliedCreatedAt`. Our webhook migration is already applied to the DB, so any new upstream migration with an older `when` timestamp will be skipped. After rebase, always ensure our webhook migration (`20260129210000_AddWorkspaceWebhooks`) is **before** any new upstream migrations in `_journal.json`, and that new upstream migrations have a `when` value **newer** than the webhook's `created_at` in the DB (`1771105200000`). If a new upstream migration has an older timestamp, bump its `when` to be newer than the webhook's.

## Auth (AGENTS.md correction)

AGENTS.md references `assertUserInWorkspace` for authorization. Upstream has since added a granular permissions system. The current helpers are in `packages/api/src/utils/permissions.ts`:

- `assertPermission` — general permission check
- `assertCanEdit` — edit permission check
- `assertCanDelete` — delete permission check

`assertUserInWorkspace` (in `packages/api/src/utils/auth.ts`) still exists but the permissions utils are preferred for new code.

## Webhooks

Fires webhooks on card events: `card.created`, `card.updated`, `card.moved`, `card.deleted`.

Split into four PRs (original PR #343 closed):

| PR | Branch | Description |
|----|--------|-------------|
| #391 | `feature/webhooks-1-db-schema` | DB schema, migration, webhook repository |
| #392 | `feature/webhooks-2-delivery` | Delivery utility + card event integration |
| #393 | `feature/webhooks-3-crud-api` | CRUD API router + tests |
| #394 | `feature/webhooks-4-ui` | Webhook management UI |

Dependency: #391 → #392 and #393 (parallel) → #394

Key files:
- `packages/db/src/schema/webhooks.ts` — schema definition
- `packages/db/src/repository/webhook.repo.ts` — CRUD repository
- `packages/api/src/utils/webhook.ts` — core delivery logic (HMAC-SHA256 signatures, 10s timeout, fire-and-forget)
- `packages/api/src/routers/webhook.ts` — CRUD routes for managing webhooks (workspace-scoped, admin role required)
- `packages/api/src/routers/card.ts` — webhook call sites in create/update/delete mutations

Webhook management requires session auth (better-auth). Sign in via `/api/auth/sign-in/email`, then use the session cookie for tRPC calls.

## Production Auth

- URL: https://tasks.xdeca.com
- Auth: better-auth with session cookies (`__Secure-kan.session_token`)
- Sign-in: magic link or email/password via `/api/auth/sign-in/email`
- Workspaces: "Sprints" (`du0q2k1jm99k`)
