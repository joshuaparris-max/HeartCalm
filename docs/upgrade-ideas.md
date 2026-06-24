# Calm — 10 Upgrade Ideas

Notes on potential improvements to the **Calm** breathing & palpitation-support PWA.
The app is currently a single `index.html` (markup + CSS + JS) plus `manifest.json` and `sw.js`,
storing everything in `localStorage`. No build step, no server, no account — these are
constraints worth preserving where possible.

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

## Quick wins summary
If picking just a few to start: **#2 (export/import)** and **#5 (tap-to-count pulse)** are
low-effort and high-value, and **#1 (trend charts)** meaningfully strengthens the GP-prep
purpose the app already serves.

## Things to preserve
- Local-only-by-default privacy model.
- Calm, low-stimulation visual design (no bright/flashing elements — important for the stated
  light-sensitivity/MGD-friendly intent).
- The persistent safety banner and "not a medical device / no medication advice" disclaimers.
