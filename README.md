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
