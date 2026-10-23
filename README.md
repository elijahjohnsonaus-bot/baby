# Pip

A shared newborn tracker. Feeds, nappies, sleep, pumping and growth, logged in one tap and kept identical on both phones.

Single-page app plus one Netlify function, same pattern as Stash and Queue.

## Setting it up

1. **Push this to a private GitHub repo.**

   ```bash
   git init
   git add .
   git commit -m "Pip"
   git branch -M main
   git remote add origin git@github.com:<you>/pip.git
   git push -u origin main
   ```

2. **Create a Netlify site** from that repo. Leave the build command empty; publish directory `.`.

3. **Add the passcode.** In Netlify, go to Site configuration → Environment variables and add:

   | Key | Value |
   | --- | --- |
   | `APP_PASSCODE` | any phrase you both know |

   Redeploy after adding it. Without this variable the sync endpoint is open to anyone with the URL.

4. **On each phone**, open the site in Safari, go to Settings and set:
   - who's logging on that phone
   - the baby's name and date of birth
   - the same shared passcode

5. **Add it to the Home Screen** (Share → Add to Home Screen) so it opens full screen and works offline.

## How syncing works

Every entry is its own record with an id. Nothing is stored as one big blob, so two phones logging at the same moment can't overwrite each other.

- Entries save to the phone first and render straight away, so the app never waits on the network.
- Pending entries sit in an outbox and are **only** cleared once the server confirms it is holding them. A dropped request means a retry, not a lost feed.
- The server stamps each change with a sequence number. Each phone asks for everything past the number it last saw, so a sync sends only what changed.
- Edits and deletes carry a timestamp; the newer one wins.
- Deletes sync as a flag rather than removing the row, so a deleted entry can't reappear from the other phone.
- The app polls every 10 seconds while it's open, on returning to the foreground, and whenever the network comes back.

## Data

Everything lives in one Netlify Blobs store called `pip-entries`. Export JSON or CSV any time from Settings.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole app: UI, storage, sync client |
| `netlify/functions/sync.js` | The sync endpoint at `/api/sync` |
| `sw.js` | Service worker, caches the shell so it opens with no signal |
| `manifest.json` | Home Screen name, icon and colours |
| `make-icons.py` | Regenerates the icon PNGs if you change the mark |

## A note on the nappy guide

The wet and dirty nappy targets in Settings are general figures, and in the first week the wet target ramps up with the baby's age. They're there to make a pattern visible, not to tell you anything about your baby. Check them against what your midwife or child and family health nurse says, and call them if something doesn't look right.

## Running it on Cloudflare

Pip also runs as a Cloudflare Worker, on the free plan. The page is served as it is, and the baby's entries are kept in a Durable Object that takes the place of Netlify Blobs. `netlify/functions/sync.js` runs on Cloudflare exactly as it is. `_headers` carries over the two security headers from `netlify.toml`.

### What was added

- `wrangler.jsonc`, `.assetsignore`: the Worker's settings, and the files that stay private (everything that is not the website).
- `cloudflare/worker.js`: runs the function on Cloudflare. `cloudflare/store.js` and `cloudflare/blobs.js`: the storage that takes the place of Netlify Blobs.
- `cloudflare/import.js` and `cloudflare/import-kit.js`: the one-off copy from the old Netlify site (below).

### Deploy

1. In the Cloudflare dashboard, go to Workers & Pages and create a new Worker by importing the GitHub repo `baby`.
2. Name it `pip` (it has to match `name` in `wrangler.jsonc`). Leave the build command empty and keep the default deploy command (`npx wrangler deploy`). Until the `cloudflare` branch is merged into `main`, set the production branch to `cloudflare` (Settings, Builds).
3. In the Worker's Settings, Variables and secrets, add:
   - `APP_PASSCODE` (optional, recommended): any phrase you both know. Without it the sync address is open to anyone who has the link. Enter the same one in Settings on each phone.
4. Open `https://pip.YOUR-SUBDOMAIN.workers.dev` on each phone, then Share, **Add to Home Screen**. A new address is a new site as far as a phone is concerned, so each phone starts with nothing saved on it and picks everything up from the cloud once the data is across.

### Moving the data over from Netlify

This copies the baby's entries from the old Netlify site into this one. It only reads from the old site and never changes it, and it is safe to run again. It cannot read a Netlify site while Netlify has it paused, so do it once the old site is back.

1. In the Worker's Variables and secrets, add `IMPORT_FROM` with the old site's address, then `|` and its passcode if it had one:

   ```
   https://OLD-SITE.netlify.app|OLDPASSCODE
   ```

2. Open `https://pip.YOUR-SUBDOMAIN.workers.dev/api/import` (add `?key=YOUR-NEW-PASSCODE` on the end if you set one above). The page keeps going by itself and says Done when everything is across. Do this before you start using the new site on your phones.
3. Delete `IMPORT_FROM`.

If you now use the Baby page in the nursery app, that app's own import already covers Pip, so you may not need this one.
