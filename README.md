# Unfold Beta — Survey Insights (public dashboard)

Live, **anonymized** dashboard of the *Unfold Beta — User Survey*: feature-demand ranking,
an experience scorecard, adoption charts, an auto-generated friction/bug list, and verbatim
quotes — all for the road to launch.

**Privacy:** this repo is public, so it contains **no names and no email addresses**.
Respondents appear as `Tester 1`, `Tester 2`, … and `fetch-data.js` strips/aborts on any email.
The non-anonymized version (with names) lives in the private `unfold-bible-app` repo.

```
index.html      ← the dashboard (reads data.json, computes everything client-side)
data.json       ← anonymized responses (committed; refreshed automatically by CI)
fetch-data.js   ← pulls from Notion, anonymizes, writes data.json (zero npm deps)
```

## Live site

GitHub Pages serves the repo root → **https://legacyco.github.io/unfold-survey-dashboard/**

## How it stays up to date (automatic)

`.github/workflows/sync-survey.yml` runs **daily (12:00 UTC)** and on demand. It pulls the
latest responses from Notion, anonymizes them, and commits `data.json` only when something
changed.

### One-time setup (required for auto-refresh)

This repo needs its own copy of the Notion token (Actions secrets are per-repo):

1. **Create / reuse a Notion internal integration** → https://www.notion.so/my-integrations →
   copy its secret (`ntn_…`).
2. **Share the survey database with it** (Notion → database → `•••` → *Connections*).
3. **Add the repo secret**: Settings → Secrets and variables → Actions → *New repository
   secret* → name `NOTION_TOKEN`. *(Optional `NOTION_DATABASE_ID` to override the default.)*
4. Confirm: Actions tab → **Sync Unfold Beta survey data** → *Run workflow*.

Until the secret is added, the site still renders the committed anonymized snapshot.

## Run locally

```bash
python3 -m http.server 8080      # then open http://localhost:8080
# refresh data (optional):
NOTION_TOKEN=ntn_xxx node fetch-data.js
```

## Notes

- Ratings are 1–5. A few responses were entered as “6”; capped to 5 for averaging.
- Small sample → directional, not statistical. Everything recomputes from `data.json`.
