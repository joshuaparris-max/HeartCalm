# Calm — 10 Upgrade Ideas

Notes on improvements to the **Calm** breathing & palpitation-support PWA.

> **Status (2026-06-24): all 10 implemented.** The app was refactored from a single
> `index.html` into `index.html` + `styles.css` + `pure.js` + `app.js`, with a unit-test
> suite in `tests/` (`node --test`, 11 tests passing) and a `vercel.json` for deploy.
> Each item below is marked ✅ with implementation notes.

Ideas are ordered roughly by value-to-effort.

---

## 1. Trend charts & insight on the log
**What:** Add a lightweight visualisation to the Log/More view — episodes per day/week,
average pulse, average stress, and most-common triggers. A simple inline SVG bar/line chart
(no external library) keeps the single-file ethos.
**Why:** Right now the GP prep summary is text counts only. A 14- or 30-day trend helps the
user (and their GP) spot patterns — e.g. clustering after poor sleep or caffeine.
**Effort:** Medium. Pure SVG rendered from `state.logs`.

## 2. Data export/import (backup & device transfer)
**What:** "Export all data" → downloads a single JSON file (logs, care, reminders, settings).
"Import" → restores it. Pairs naturally with the existing CSV export.
**Why:** All data lives in one browser's `localStorage` and is lost if the user clears their
browser or switches phones. For a health-logging tool, durable backup matters.
**Effort:** Low. Reuse the existing Blob/download pattern from `csvLog`.

## 3. Haptic + audio breathing guidance improvements
**What:** Smoother breathing cues — a continuous gentle audio tone that rises on inhale and
falls on exhale (currently it's a single chime per phase), and configurable vibration patterns
per phase. Optional voice cues ("breathe in… breathe out") via the Web Speech API.
**Why:** During a palpitation episode, eyes-closed guidance is more calming than watching a
counter. Audio/haptic-led breathing reduces screen dependence.
**Effort:** Medium. Extend `chime()`/`vibe()` and the phase loop.

## 4. Real background reminders via the service worker
**What:** Move reminders from the in-page `setInterval` (only fires while the tab is open) to
the service worker using the Notifications API and, where supported, Periodic Background Sync.
**Why:** The current reminder ticker silently stops when the tab is closed — the most common
real-world state. Background notifications make the reminder feature actually reliable.
**Effort:** High (browser support is uneven, esp. iOS). Document the fallback clearly.

## 5. Heart-rate capture assist
**What:** A guided "tap to count" pulse tool — user taps along with their pulse for 15s, app
computes bpm and pre-fills the log. Optionally explore camera-based PPG, but tap-counting is
simple, private, and reliable.
**Why:** The log already has a pulse field but entering bpm mid-episode is fiddly. A tap
counter lowers friction and improves data quality.
**Effort:** Low–Medium for tap counter.

## 6. Configurable breathing patterns
**What:** Let users add/edit patterns (e.g. 4-7-8, coherent 5-5, physiological sigh) instead
of only the two hardcoded ones. Store custom patterns in `state.settings`.
**Why:** Different patterns suit different people and moments. Personalisation increases use.
**Effort:** Low–Medium. The `PATTERNS` structure already generalises to arbitrary phase lists.

## 7. Accessibility & internationalisation pass
**What:** Add ARIA roles/live-regions (announce breathing cues to screen readers), respect
`prefers-reduced-motion` for the expanding circle, ensure full keyboard navigation, and
externalise UI strings to enable translation.
**Why:** A health/calm tool should be usable by everyone, including users with motion
sensitivity or who use assistive tech. Reduced-motion is especially relevant given the
animated circle.
**Effort:** Medium.

## 8. Onboarding & emergency-info card
**What:** A first-run intro explaining the app is not a medical device, plus an optional
"emergency card" the user fills once (conditions, key meds, emergency contact, allergies),
shown prominently on the palpitation screen.
**Why:** During an episode, having key info one tap away is genuinely useful. Onboarding also
reinforces the safety messaging up front.
**Effort:** Low–Medium.

## 9. Code structure & maintainability
**What:** Split the single file into `index.html`, `styles.css`, and `app.js` (optionally
small ES modules per feature: breathing, log, care, reminders, prep). Add a minimal test
harness for the pure functions (`fmt`, `logsAsText`, CSV builder, prep aggregation).
**Why:** The single-file approach is great for portability but the JS is now ~400 lines and
growing. Modularisation + a few unit tests reduce regression risk as features are added.
Keep a build step that re-bundles to a single file if single-file deploy is still desired.
**Effort:** Medium. Tradeoff against the deliberate zero-build simplicity.

## 10. Privacy-preserving optional cloud sync
**What:** Opt-in end-to-end-encrypted sync (e.g. passphrase-derived key, sync via a simple
storage backend or the user's own cloud file). Default stays fully local.
**Why:** Enables multi-device use and durable backup without compromising the "no account, no
server" privacy promise — data is encrypted client-side before it ever leaves the device.
**Effort:** High. Significant scope; only pursue if multi-device demand is real.

---

---

## Implementation status & QA notes (2026-06-24)

| # | Upgrade | Status |
|---|---------|--------|
| 1 | Trend charts | ✅ Inline SVG bar chart (14-day) + stat cards (last-7, avg pulse, avg stress) in More → Trends |
| 2 | Export/import | ✅ JSON backup export + import-with-confirm; CSV export retained |
| 3 | Breathing audio/haptics | ✅ Continuous guide tone (rises on inhale, falls on exhale), optional voice cues, per-phase vibration |
| 4 | Background reminders | ✅ Best-effort Periodic Background Sync via service worker + reliable in-page ticker fallback |
| 5 | Tap-to-count pulse | ✅ "Tap on each heartbeat" control, auto-fills pulse after ≥6 taps |
| 6 | Configurable patterns | ✅ Add/remove custom patterns (`in:4, hold:2, out:8` syntax) + two new built-ins (4-7-8, coherent 5-5) |
| 7 | Accessibility & i18n | ✅ ARIA labels/live cue, `prefers-reduced-motion` respected, `aria-pressed` on toggles, i18n scaffold (`t()`) |
| 8 | Onboarding & emergency card | ✅ First-run modal + editable emergency info shown on the palpitation screen |
| 9 | Code structure & tests | ✅ Split into 4 files + `pure.js` module with 11 passing unit tests |
| 10 | Privacy-preserving sync | ✅ Passphrase-based AES-GCM encrypted backup (Web Crypto, PBKDF2 150k). Full cloud backend still future work |

### Bugs found & fixed during QA
- **Box-breathing circle jump** — the second `hold` (after exhale) snapped the circle back to
  large. Now the circle keeps its current size through holds.
- **Reminder-label escaping** — `esc()` didn't escape quotes, so a label containing `"` broke
  the `value` attribute. New `escHtml()` escapes `& < > " '` and is used everywhere.
- **First chime dropped** — the `AudioContext` could start `suspended`; it's now resumed on the
  Start tap so the first cue plays.
- **Service worker served stale UI** — bumped cache to `calm-v2` and added a `vercel.json`
  `no-cache` header for `sw.js` so deploys aren't masked by an old cache.
- **Sound toggle discoverability** — controls are now under labelled "Length / Pattern /
  Sound & feedback" headings rather than unlabelled grey buttons.

---

## Round 2 — clinical & UX improvements (2026-06-24)

Implemented from two reviewer passes focused on making the log clinically useful and
the in-the-moment flow safer.

1. **Sharper structured log.** Added the discriminators a cardiologist actually uses:
   **duration**, **regular/irregular rhythm**, **at rest / on exertion / lying down**,
   **pulse before → after breathing**, **what you were doing**, **did breathing help**,
   **cough timing**, and **Ventolin in the last 4h**. Mirrors a Holter symptom diary.
2. **Red-flag escalation.** Ticking chest pain, breathless, faint/near-faint, dizzy, or
   irregular pulse now surfaces an immediate "this may need urgent assessment — call 000"
   banner, in both the log and the palpitation self-check.
3. **Guided "Palpitations now" flow.** The palpitation screen is now a numbered sequence:
   steady → safety check → breathe → recheck & log.
4. **4–6 default reinforced**, box breathing kept but de-emphasised in copy (no breath-holds
   is the safer default for palpitations).
5. **Asthma-aware symptoms.** Added wheeze + tight-chest toggles and structured cough timing.
6. **Honest + real reminders.** Copy now states in-app reminders fire only while open;
   added an **Install app** prompt and **calendar (.ics) export** so nudges can live in the
   phone's real calendar and always arrive.
7. **Eye-safe breathing.** Added a **Dim** mode — the circle never brightens on inhale and
   its glow can be removed entirely (MGD / light-sensitivity friendly). `prefers-reduced-motion`
   already holds the circle still.
8. **Stronger GP export.** 7-day count, red-flag/cough/Ventolin/exertion counts, avg pulse &
   stress, top triggers, plus **Print summary** and **Copy message for reception**.
9. **Hydration decision card.** Clear water-only vs oral-rehydration guidance based on which
   signs are present, instead of a single generic message.
10. **"While symptoms are active — do not" checklist** (no intense exercise, no stimulant
    decongestants, no potassium/magnesium stacking, no carotid massage, no doom-searching).
11. **Privacy controls.** Per-entry delete (not just clear-all) and a **Private mode** that
    blurs on-screen log/trends/emergency details until hovered — for use at work.

Test suite expanded to **14 passing tests** (added CSV schema, `topTriggers`, `gpStats`,
`icsForReminders`).

---

### Deploy notes
- Static site; `vercel.json` sets `no-cache` on `sw.js` and `manifest.json`.
- After each change, bump `CACHE` in `sw.js` (already automated in spirit — remember to bump).
- `npm test` runs the pure-function suite (no build step required for the site itself).

---

## Quick wins summary
If picking just a few to start: **#2 (export/import)** and **#5 (tap-to-count pulse)** are
low-effort and high-value, and **#1 (trend charts)** meaningfully strengthens the GP-prep
purpose the app already serves.

## Things to preserve
- Local-only-by-default privacy model.
- Calm, low-stimulation visual design (no bright/flashing elements — important for the stated
  light-sensitivity/MGD-friendly intent).
- The persistent safety banner and "not a medical device / no medication advice" disclaimers.
