# Shrimp Shack Academy

Mobile-first staff training for Shrimp Shack in English, Arabic and Urdu. Staff read PDF cards, take quizzes and earn certificates that anyone can check with a QR code. Managers assign training, sign off practical skills and follow progress.

- **Website:** GitHub Pages. Only the `site/` folder is published.
- **Server:** one Supabase Edge Function named `academy`, plus a Postgres table and a private Storage bucket for the PDFs.
- **Go-live guide (Arabic):** [docs/GO-LIVE-AR.md](docs/GO-LIVE-AR.md)
- **Security note:** [docs/SECURITY.md](docs/SECURITY.md)

## Folders

| Path | What it is |
|---|---|
| `site/` | The website. Plain HTML/CSS/JS with no build step. `config.js` holds public settings only. |
| `site/js/core.js` | **All server rules**: roles, permissions, grading, certificates. The live server and the trial copy both run this file. |
| `server/edge.js` | Live adapter that connects the rules to Postgres, Storage and HTTP. |
| `supabase/functions/academy/index.ts` | **Built file** (core + adapter in one file) to paste into Supabase. Do not edit by hand. |
| `supabase/setup.sql` | Creates the database table, change history and the private PDF bucket. |
| `tests/` | Automated tests. Open `tests/index.html` and `tests/edge.html` through the local server. |
| `tools/` | `serve.ps1` (local preview) and `build-function.ps1` (rebuilds `index.ts`). |

## Trial copy

When `config.js` has no Supabase address, the site runs as a **trial copy**. It uses the same rules, but all data stays in the browser. The setup code is `trial-setup`.

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8765
```

Then open http://localhost:8765/site/ (site) or http://localhost:8765/tests/ (tests).

## After changing `site/js/core.js` or `server/edge.js`

1. Run `powershell -ExecutionPolicy Bypass -File tools\build-function.ps1`.
2. Run both test pages.
3. Paste the new `supabase/functions/academy/index.ts` into Supabase → Edge Functions → academy → Code, then click **Deploy**.

## Rules that never change

- No passwords, secret keys, the `SETUP_CODE` or staff data in this repository.
- `config.js` contains only the **publishable** key.
- Secrets are typed directly into the Supabase dashboard, never into a chat or a file.
