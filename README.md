# UTZLINE Install ITP — installable app

**Current version: v27** (its own independent version line, separate from Site Measure/Viewer's — bump this line, and add a dated entry below, every time a new build ships. See `next-version-notes.md` in the project for the full per-version changelog if a gap ever needs filling in.)

**v27 (2026-09-25):** performance fix, round 2 — opening a checklist by tapping its marker on the floor plan. Andrew, after v26: "still takes about 40 seconds to load the actual itp from a floor plan, but from the list its instant. everything elso is pretty much instant." Root cause: rendering the Level Plan fired one **full** checklist read (photos and signatures included) per marker, all at once, just to draw each marker's ✓/✕ — plus a three-step folder lookup per marker for the status badges. The plan paints immediately, so it looks ready, but Android's file layer was still working through a few hundred queued reads behind it; tapping a marker put that checklist's own read at the back of the queue. From the Items list there's no such backlog, which is why that path was already instant.

Fixes, all in a new "Level Plan background status loading" block: (1) marker ✓/✕ now comes from the v26 item-status index — one small index read per *room* instead of one full checklist read per *item*; which items exist at all comes from one directory listing (flat: the shared checklist folder; legacy: one per room, merging `itp-install` with the pre-rename `itp` folder), so never-started items resolve with no per-item lookup. Only items that exist but aren't in the index yet get a full read, and those backfill the index room by room. (2) Status badges list the Joinery Status folder once and only read folders that actually exist (replaces v26's `readJoineryStatusesForKeys`, now removed). (3) Everything left runs through a small queue — at most 3 file operations in flight — that stops starting new work the moment you leave the plan (tapping a marker, opening a room, rework, or any screen change). So a tap only ever waits behind a couple of in-flight reads. Markers not yet resolved when you leave stay "…" and are recomputed next visit. Same display-only staleness trade-off as v26's Items list; opening an item always reads the real file.

New tests: `run_plan_marker_tap_latency.js` (flat, 80 markers, with a mock file layer that serializes every operation at a fixed delay the way Android's does) — marker tap → checklist in ~140 ms on a cold plan vs ~4.4 s for the same test against v26, file queue never deeper than 6 (v26: 160), zero full checklist reads on a warm visit (v26: 60), every marker/badge still correct. `run_plan_marker_status_legacy.js` covers the legacy shape: old-`itp`-folder items, pre-joinery-code room markers, index backfill, and the "never create folders just from viewing the plan" rule. Full suite green. `service-worker.js` cache bumped to `utzline-itp-cache-v27`.

**v26 (2026-09-25):** performance fix — pages were taking minutes to load on Android. Andrew, verbatim: "itps are still taking minutes to load pages on android. just fix install itp first." (scoped to this app only for now — Manufacture ITP and Delivery ITP run the same pattern and likely have the same bottleneck, but haven't been touched). Two root causes, both about doing far more file I/O than a page actually needs to render:

1. **Items list** used to open and fully parse every item's checklist JSON — including any embedded photo base64 data — just to show a one-line status label ("Signed off" / "5 of 16 checked" / etc). On a room with several items each carrying photos, that's several full-file reads and parses, sequentially, before the list could even paint. Fixed with a small derived **item-status index cache**: one JSON file per level+room (`{fileName: {joineryNo, answered, total, signed, bothSigned, hasNo, updatedAt}}`), written every time a checklist is saved AND every time it's opened (self-healing), and consulted by the Items list instead of the real files. This is deliberately **not** a new source of truth — `openItem` always reads the real checklist file fresh regardless of what the cache says, so the cache can never cause a wrong answer to be saved or signed off, only a stale *label* for a few seconds if a file was changed by another device/app and hasn't been opened here yet since — and it self-heals the moment that item is next opened or saved. Stored at `Install ITP Index/<Level>/<Room>.json` (legacy) or `Project Saves/UTZLINE ITP/Install ITP Index/<Level> - <Room>.json` (flat).
2. **Level Plan** screen was re-folding the entire project's joinery-status event history (every item, every level, every room) on every single render, just to colour a handful of on-screen markers for the one level being viewed. Replaced with a new scoped fold, `readJoineryStatusesForKeys`, that only reads and folds the exact items actually shown as markers on the current level.

Bonus fix found via the new test for (1): a pre-existing bug (from the joinery-status v2 event-sourcing feature, v20/2026-09-24) where `Project Saves` — created lazily at the project root the first time any item's status is synced in a legacy project — wasn't excluded from the Levels-list filter, so it could show up as a fake, unopenable "level" once created. Fixed in the same exclusion list as the new index folder. This is the same one-line pattern and very likely affects Manufacture ITP, Delivery ITP, and Site Measure's own level-listing code too, none of which have been touched yet.

New regression test `run_item_status_index_cache.js` (`pdftest-itp/`) proves both the correctness (right labels, cold and warm) and the actual performance win — it instruments the mock filesystem to count real file reads and confirms a warm Items-list load opens **zero** full checklist files — plus the staleness/self-heal behaviour and the fake-level regression guard (checked both before and after the new index folder exists on disk). Full family test suite (`pdftest-itp/`, plus the relevant Install ITP tests in `pdftest-projects/`) re-run clean, zero regressions. `service-worker.js` cache bumped to `utzline-itp-cache-v26`.

**v25 (2026-09-25):** autosave removed. Same change as Delivery ITP v12 (see its own README for the full writeup) — Andrew, right after the v24 crash fix above: "ok, stop the auto save. we can reimplement it later, just make sure we save on exit with a button." `markDirty()` no longer schedules `flushPendingSave()` on a 900ms debounce timer — it only sets the `dirty` flag now. The explicit **Save** button, the "Save changes before leaving?" dialog, and the `beforeunload` best-effort save already fully covered "save on exit with a button," so nothing else needed building. This app's separate rework-tracker save path (`writeReworkFile`/`syncReworkPdf`) was never on a timer to begin with — it saves immediately on each rework action — so nothing there changes. `flushPendingSave()` itself is unchanged. Tradeoff, accepted deliberately by Andrew as reversible: an edit between saves is now lost if the app is killed before an explicit Save, leave, or tab close — no background timer catches it within ~900ms anymore. `run_itp_auto_export_on_signoff.js` updated to click Save explicitly instead of waiting past the old debounce; `smoke_itp_v2_e2e.js`'s leave-confirm-discard coverage updated to describe the current (timer-free) behaviour rather than debounce cancellation. Full family-wide suite re-run clean. Same change, same day, in Delivery ITP (v12) and Manufacture ITP (v14). `service-worker.js` cache bumped to `utzline-itp-cache-v25`.

**v24 (2026-09-25):** crash fix — "Add photo" no longer hands off to the OS's own camera app. Same fix as Delivery ITP v11 (see its own README for the full root-cause writeup) — Andrew reported the app "crashed when taking a photo" right after v23 shipped, pointing at a fix already made in Site Measure (its own v37, 2026-09-19) for the identical symptom: `capture="environment"` on the file input launches Android's native Camera app as a separate foreground activity, backgrounding the tab; on a memory-constrained onsite tablet Android can and does kill that backgrounded tab, and the File System Access folder permission this app needs isn't persisted across the resulting reload — so the app lands back on "choose your Projects folder" mid-checklist. Ported Site Measure's fix verbatim: "Add photo" now opens a small chooser ("Take photo" — an in-page getUserMedia + `<video>` + canvas capture that never leaves the tab — or "Choose file", the existing OS picker without the forced capture attribute). This app is the one place the fix had to be wired twice — the checklist's own "Add photo" AND the rework tracker's separate "Add photo" (v17) both had the same `capture="environment"` bug, and both now share the one chooser/camera-capture module. Every photo, from either button, still goes through the same downscale-to-JPEG pipeline as before.

**v23 (2026-09-25):** performance fix — auto-export the PDF only on the transition into "Signed off," not on every later edit. Andrew: "app is really slow on mobile onsite even working from local folder on device," investigated first on Delivery ITP (its own v10). Root cause: the v21 auto-export feature (2026-09-24, below) re-ran `exportChecklistPdf()` — the full, synchronous, main-thread jsPDF pipeline, re-embedding every photo already attached to the item — on every single 900ms autosave for as long as the checklist stayed signed off, so any post-signoff tweak (fixing a typo in a comment, adding one more photo) froze the UI while it rebuilt. Live in Manufacture ITP and Delivery ITP too (both added the identical feature the same day), so all three got the same fix.

`flushPendingSave()` now tracks a new `state.wasSignedOffLastSave` flag (initialized in `openItem()` from the checklist's own on-disk signed-off state) and only calls `exportChecklistPdf()` when the checklist's signed-off status flips from false to true on this save — a first-time sign-off, or a re-sign-off after being knocked out of it by a "No" answer and fixed again. An edit made while it was *already* signed off no longer triggers a re-export at all; "Export PDF" still refreshes it on demand, exactly as always. This does not touch the separate rework-PDF sync (`syncReworkPdf`, v22 above) — that one is already scoped to actual rework changes only, never fired from this general checklist autosave. `run_itp_auto_export_on_signoff.js` extended with a new step confirming an incidental Notes edit while still signed off produces no additional PDF, alongside the existing signed-off/re-signed-off transition coverage. Full suite re-run clean. `service-worker.js` cache bumped to `utzline-itp-cache-v23`.

**v22 (2026-09-24):** rework PDF export — Round 2 (part 2) of the Joinery Item page overhaul. Andrew, verbatim: "the rework section can open the rework pdf to view. any rework images for this joinery item get attached to that rework pdf. the top of the pdf matches the itp layout and details, but with red highlights." Every rework entry save (add, delete, or toggling "Received back on site") now regenerates one cumulative PDF for that item — `exportReworkPdf`, sharing the checklist PDF's own top-of-page logo band and PROJECT/LEVEL/ROOM/JOINERY field layout, but with the title and both dividers in red instead of black, and a red-bordered "REWORK PENDING" tag on every entry still outstanding versus a plain gray card with a green "RECEIVED" tag once it's ticked off — the same at-a-glance colour language the on-screen checkbox already uses, carried through to paper. Each entry's own photos are drawn inline inside its own card (not collected into one trailing grid, since here every photo belongs to one specific entry), date/name-stamped the same way the checklist's own trailing photo pages already are. Unlike the checklist's own auto-export (a new timestamped file per signed-off state), this is a single always-current file with a fixed, un-timestamped name — `syncReworkPdf` overwrites it in place on every change and deletes it outright the moment the last rework entry for that item is removed, so nothing stale or empty is ever left behind. Stored at `PDF Files/UTZLINE ITP/Install ITP Rework/<Level> - <Room> - <Code>.pdf` (flat) or alongside the rework JSON in `itp-install-rework/<Level>/<Room>/<Code>.pdf` (legacy) — the same per-shape split the checklist's own PDF already uses. New regression test `run_rework_pdf_export.js` (`pdftest-itp/`) covers: no PDF before any rework is logged; exactly one PDF (fixed filename) after the first entry; still exactly one after a second entry (overwritten, not accumulated); regenerates cleanly when an entry is marked received; and is deleted entirely once the last entry is removed. The existing `run_rework_tracker.js` suite (both project shapes) was re-run and still passes unchanged. `service-worker.js` cache bumped to `utzline-itp-cache-v22`.

**v21 (2026-09-24):** auto-export the ITP PDF on sign-off — part of Andrew's Joinery Item page overhaul ("once an itp is saved / completed, it automatically exports the pdf of the itp into the correct folder, you can then click on each relative itp here to open it," confirmed via a direct follow-up question: fire "only when it reaches Signed off," not on every save). `flushPendingSave()` now checks the just-saved checklist with a new `isChecklistSignedOff(data)` helper (both signoff signatures present, no row flagged "No") right after its existing `syncJoineryStatusFromChecklist` call, and when true, calls the same `exportChecklistPdf()` the manual "Export PDF" button already uses — landing in the same flat `PDF Files/UTZLINE ITP/Install ITP/` folder and filename convention, no click needed. A later edit made while still signed off (e.g. clearing a "No" that had temporarily un-completed it) re-exports a fresh, separately-named PDF rather than overwriting the first, so every state the checklist passed through while complete stays on disk — this is what makes "click each relative ITP here to open it" in UTZLINE Projects meaningful. The export call is chained off `flushPendingSave()`'s own promise (not fire-and-forget like the status sync next to it) — this app's `state.currentData`/`state.currentFileHandle` are only ever reassigned from inside `openItem()`, which itself starts with `flushPendingSave().then(...)`, so chaining the export is what guarantees it always reads the checklist it just saved, never a newer one opened mid-export. New regression test `run_itp_auto_export_on_signoff.js` (`pdftest-projects/`) covers: one signature alone exports nothing; the second signature auto-exports exactly one PDF; flagging a row "No" exports nothing further; clearing it re-exports a second, distinct PDF; the manual "Export PDF" button still works unchanged as a third. `service-worker.js` cache bumped to `utzline-itp-cache-v21`. Full suite re-run clean.

**v20 (2026-09-24):** joinery-status.json v2 — Andrew, verbatim, describing the coming scale: "we will have 30 people using this app in different stages, all coming back to the same database... needs to be foolproof and nevel lose data. some of this will be done via dropbox upload after the fact." The shared `joinery-status.json` (read by every app in the family, written by this one, Manufacture ITP, Delivery ITP, and the new Machine Schedule app) used to be one JSON array file, rewritten whole on every save — safe with two or three writers, but with up to 15 across five apps, some syncing in late via Dropbox, a genuine risk of two people's saves silently clobbering each other. Replaced with one small immutable event file per status change, filed under `Project Saves/Joinery Status/<Level> - <Room> - <Code>/` — two writers can never collide (they're never touching the same file), and a late-arriving Dropbox sync can never overwrite a newer save, regardless of arrival order. The old file is migrated automatically and losslessly (once, idempotently) the first time any app in the family opens a project after this update, and left in place afterward, untouched. Every existing display/render call site is completely unchanged — this app still reads and writes the exact same `{status, updatedAt, updatedBy, history[]}` shape as before, just backed by folded events instead of a shared array (this app's own sign-off flow still advances status to "installed" exactly as it always has). `service-worker.js` cache bumped to `utzline-itp-cache-v20`. Full suite re-run clean.

**v19 (2026-09-23):** Andrew, verbatim: "Manufacture status needs to be split up into 2 parts. We need a machined and a manufactured tab. All traceable by user name. Machined to have its own app. Called machine schedule. This is where the machinist can mark off a joinery item as complete. It will add their name and date time to the system." This app now recognises a new **"machined"** joinery status — rank 3, slotting in between "in_manufacture" and "manufactured" — set by the brand-new sibling app **UTZLINE Machine Schedule** the moment a machinist marks an item complete there (their own signed-in name + timestamp, via the same shared identity every app in this family already uses). This app never writes "machined" itself, exactly as it already never wrote "manufactured"/"in_manufacture"/"delivered" — it's still a read-only consumer of those stages, only ever writing "installed" on its own checklist sign-off — but `joineryStatusRank`/`joineryStatusIcon`/`joineryDisplayIcon` needed the new case (⚙️) so this app's own Level Plan markers keep showing the right icon for an item sitting at any stage. `manufactured`/`delivered`/`installed` all shift up one rank (4/5/6, previously 3/4/5) to make room. No hardcoded status-filter dropdown exists in this app to update, and no other rank-number comparisons appear anywhere in `index.html` (checked: this app doesn't do the delay-math some other apps in the family do). `service-worker.js` cache bumped to `utzline-itp-cache-v19`. No test changes needed (this app is a read-only consumer of the shifted ranks) — `run_itp_no_answer_gating_and_photos.js` was re-run and still passes clean.

**v18 (2026-09-23):** Andrew, verbatim, on the exported PDF's photos: "when the photos, pin drops, snapshots are added to the itp pages, change it from a3 to a4 portrait. All collated nicely per page. All to be date and time stamped with users name also." The trailing photo pages (previously one or more A3 landscape pages, 3 columns × 2 rows) are now **A4 portrait**, 2 columns × 3 rows — the same 6-per-page count, reflowed for the narrower shape, and matching this document's own page size for the first time (previously only the photo pages were the odd one out). Each photo now shows a **date/time + uploader-name caption** underneath it, sourced from a new `addedBy` field stamped onto the photo record the moment it's added (whoever's signed in on this device at add-time — the existing shared identity system, not asked to type anything new) alongside its existing `addedAt` timestamp. A photo added before this release has no `addedBy` on file and simply shows its date/time alone, never a blank line or "undefined". New regression coverage: `run_itp_no_answer_gating_and_photos.js` (`pdftest-projects/`) was updated to spy on jsPDF's own `addPage` calls (confirmed directly: `addPage` isn't on `jsPDF.API` or `jsPDF.prototype` in this build at all, only on each construct*ed* instance, so the app's own `jsPDF` constructor is wrapped rather than a shared method patched) and now checks the export calls `addPage("a4","portrait")` for the photo grid and never `"a3"`, replacing the old raw-PDF-bytes MediaBox check. Layout also independently verified by rendering a real 7-photo export to PNG with poppler and eyeballing it: clean 2×3 grid, correct wraparound to a second page for the 7th photo, captions readable and non-overlapping. `service-worker.js` cache bumped to `utzline-itp-cache-v18`. Full 8-file suite re-run clean.

**v17 (2026-09-23):** rework tracker — Andrew, verbatim: "the install itp is to aldo have a rework tracker. You can now long press on a joinery item and have 2 buttons. 1 is open itp. The other is open rework. This is where we can take photos and provide text information for rework joinery parts including cabinet number. This will also have a received tick box with date selector. Multiple reworks can be added per joinery item and fully trackable via this system and via utzline projects summary pages per project." The Level Plan screen had no long-press/menu concept before this — a plain tap always jumped straight into the checklist. Long-press (550ms) or a real right-click on desktop now opens a small "Open ITP" / "Open rework" action sheet on a joinery marker instead; a plain tap is completely unchanged and still opens the checklist directly. "Open rework" opens a new **Rework** screen for that item: an "Add rework" form (cabinet number, free-text details, photos — reusing the checklist's own photo downscale-to-JPEG pipeline) plus a history list of every past entry, newest first, each with its own independent "Received back on site" checkbox and date selector, and a delete button. Multiple entries per item are fully supported. Stored in its own project-wide JSON file per item — `Project Saves/UTZLINE ITP/Install ITP Rework/<Level> - <Room> - <Code>.json` for a flat project, `itp-install-rework/<Level>/<Room>/<Code>.json` for a legacy one — deliberately separate from the checklist's own JSON so other apps can read rework history independently. No PDF export for rework (not asked for, no paper-template precedent) — in-app tracking here, plus a read-only summary in UTZLINE Projects' own Joinery Item page. Covered by a new regression test, `run_rework_tracker.js` (both project shapes). `service-worker.js` cache bumped to `utzline-itp-cache-v17`.

**v16 (2026-09-23):** branding fix — Andrew, verbatim: "this needs to change to UTZLINE Install ITP Branding for the install itp logos." The app was still displaying the ambiguous "UTZLINE ITP" name everywhere user-facing (browser tab title, PWA install name/manifest, the header wordmark next to the app icon, the PDF export footer, the "browser not supported" message) — indistinguishable from its sibling UTZLINE Manufacture ITP, whose own manifest already correctly said "UTZLINE Manufacture ITP" / "Manufacture ITP". Every one of those now says "UTZLINE Install ITP" (manifest `name`/`short_name`, `<title>`, `apple-mobile-web-app-title`, the header's `.brand-text`, the PDF footer's "Generated by..." line). **Deliberately left unchanged**: the actual on-disk folder name `"UTZLINE ITP"` (`Project Saves/UTZLINE ITP/Install ITP/` and `PDF Files/UTZLINE ITP/Install ITP/`) — that's a shared folder BOTH this app and Manufacture ITP write into side by side, and Andrew asked for the branding/logos, not a file-layout change; renaming it would break every already-saved project. `service-worker.js` cache bumped to `utzline-itp-cache-v16`. No test changes needed (display-text-only change) — the full existing suite (8 files) was re-run and still passes with zero regressions.

**v15 (2026-09-23):** the shared name+PIN identity registry, ported verbatim from UTZLINE Delivery ITP (the reference implementation), per Andrew's own instruction, verbatim: "implement the username as per the delivery itp throughout the entire system, but instead of it opening a popup, the button is the selector, when you pick a name it opens a numberpad to input the pin (4 digit pin)." This app's old "Set your name" button on the Projects screen, plus a single freeform-text prompt with no PIN at all, is gone. The native `<select id="identitySelector">` IS the button now — its own dropdown lists every known name plus "+ Add a new name...", and choosing an existing name immediately opens a real on-screen 0–9 numberpad to verify its 4-digit PIN, instead of a popup. Adding a brand-new name still asks for the name as plain text (this app's own existing name prompt), then the PIN is chosen and confirmed via two numberpad rounds (a mismatched confirmation shakes and clears for a retry), then a small "show me in" app-tickbox modal (Install ITP pre-checked) records which of the family's apps this person is expected to sign in on — reference-only, for Andrew's own admin use. Names and PINs live in a new shared CSV, `<ProjectsRoot>/utzline-users.csv` ("Name,PIN,ShowInApps", PIN in plain text — a reference-only attribution registry, not a real access-control system, so Andrew can inspect it, reset a PIN, or delete a row to free a name for reuse, all without touching any project data) — the SAME file every app in the family reads/writes, so a name added from any app shows up in all of them. The underlying per-device "utzline-identity" IndexedDB mechanism this app already shared cross-app (added v7) is completely unchanged — only what triggers the write on this screen. Covered by a new regression test, `run_itp_identity_pin.js`; `service-worker.js` cache bumped to `utzline-itp-cache-v15`.

**v14 (2026-09-23):** adds this app's FIRST "Layers" control to the Level Plan screen — a small button + one-checkbox popover, currently offering just "Delivery locations" (off by default). Switching it on reads UTZLINE Delivery ITP's own checklist files for every joinery item on the current level (read-only — this app never writes to Delivery ITP's own folder, in either a flat or a legacy project) and renders each item's saved `deliveryLocationPin` as an inert, amber, non-interactive reference pin — visually distinct from this app's own green markers and the shared 📏/📦/🚚/🏆 status badges, and structurally impossible to tap/drag/select (same "reference layer, drawn underneath the real interactive objects" convention as Site Measure/Viewer's own "Site Measure layers" panel). `service-worker.js` cache bumped to `utzline-itp-cache-v14`.

**v11–v13 (2026-09-23):** this app's own level-list exclusion was updated across three small releases to also skip the new `itp-delivery` folder (UTZLINE Delivery ITP's own project-wide data folder), so it's never mistaken for a Level anywhere in this app. No other functional change in v11–v13 — see `next-version-notes.md` for the exact detail of each.

**v10 (2026-09-23):** checklist sign-off now auto-advances the shared `joinery-status.json` record (project root, works in both flat and legacy projects) to "installed" the moment both signoff fields are filled in, forward-only, with backfill for a checklist signed off before this existed. The shared status badge (📏/📦/🏆) now renders on this app's own Level Plan markers too, alongside the existing per-item ✓/✕ indicator. Also adds a read-only "View job note" button to the checklist screen, listing PDFs Site Measure/Viewer have attached to that joinery item.

**v9 (2026-09-22):** flat-project support -- a project created by UTZLINE Projects v9+ (no real Level/Room folders; Project Saves/Floor Plans/ + joinery-items.json instead) now works here too. Levels/Rooms are read from those files, the joinery-item list is built from joinery-items.json ("+ New Joinery Item" is hidden -- only UTZLINE Projects creates items), and this app's flat-project checklist/PDF data lives in `Project Saves/UTZLINE ITP/Install ITP/` and `PDF Files/UTZLINE ITP/Install ITP/`. A LEGACY (folder-based) project's behaviour is unchanged. Bundled into this same release: this app's own project-wide data folder is renamed from `itp` to `itp-install` (disambiguating it from Manufacture ITP's `itp-manufacture`), with an automatic, additive, lossless migration from the old folder name the first time each room is opened.

This folder is the self-contained, installable **UTZLINE ITP** app —
a third app in the same family as **UTZLINE Site Measure** (the editor)
and **UTZLINE Viewer** (the read-only browser), for filling in and
signing off joinery installation checklists on site, usually on a phone
or tablet.

**Unlike the Viewer, this is NOT built from `source.html`.** The editor
and Viewer share one canonical source file because they're really the
same app (a plan-drawing canvas) in two modes. ITP is a different kind
of screen entirely — a checklist form, not a canvas — so it's its own
small, purpose-built codebase (`index.html`, ~1400 lines) with its own
`manifest.json` and `service-worker.js`. There's no `build.py` here and
nothing to "rebuild" when you edit it directly; whatever's in
`index.html` is what ships.

It reads the **same Projects folder** the other two apps use — the
same project → level → room folder structure — so nothing about how a
project is organised has to change to start using it. It never touches
a room's own `saves`/`pdfs`/`backup` content; it only reads a project's
`project-meta.json` (written by Site Measure's own "Project Info"
screen, if filled in) to auto-fill the title block, and it keeps its
own checklist data in a project-wide `itp` folder it creates alongside
the level folders (see "Where things are saved" below).

## What it does

1. Choose the Projects folder (same one as the other two apps) — the
   folder handle is remembered, same reconnect-after-permission-reset
   flow as the others.
2. Browse Project → Level → Room, same navigation as the Viewer.
3. Inside a room, see a simple list of joinery items that already have
   a checklist started, or start a new one by typing its joinery
   number ("+ New Joinery Item").
4. Fill in the checklist: the title block (Project No./Name/Head
   Contractor/Level/Room/Joinery No.) auto-fills itself; the 16
   install-quality checks are Yes/No/N/A with a comment field each,
   taken verbatim from Metro Joinery's own paper template; there's a
   free-text Notes/Comments/Missing Parts box; and two sign-off blocks
   ("Subcontractor Rep. (Joinery Installer)" and "Metro Site
   Supervisor") each with a Name field, a Date field that fills itself
   in with today's date the moment a name is typed (but never
   overwrites a date you've already changed), and a signature pad you
   sign with a finger or stylus.
5. It autosaves a few seconds after any change, and there's an
   explicit Save button too.
6. "Export PDF" renders the whole checklist — including both
   signatures — to a PDF and saves it straight into the project's
   `itp` folder. Exporting again later adds a new timestamped PDF
   rather than overwriting the last one, so a history of exports for
   the same item is kept.

## Where things are saved

**LEGACY (folder-based) project:**

```
<Projects folder>/
  <Project>/
    project-meta.json          <- written by Site Measure, read-only here
    <Level>/...                <- Site Measure's own level folders
    itp-install/                <- this app's own folder, project-wide
      <Level>/
        <Room>/
          <joinery-no>.json            <- this item's saved checklist state
          <joinery-no>_<timestamp>.pdf <- one file per export, never overwritten
```

The `itp-install` folder sits directly under the **project's** own folder, as
a sibling of the level folders — not nested inside any one level — so
every joinery item across the whole project ends up under one place,
itself organised by level and room to mirror the plan. Site Measure's
own level list, this app's own level list, UTZLINE Projects' own level
list, and its sibling app UTZLINE Manufacture ITP's own level list all
know to skip a folder literally named `itp-install` (and `itp`, this
folder's own pre-2026-09-22 name, and `itp-manufacture`, the sibling
app's own equivalent folder) so none of them ever shows up mislabeled
as if it were a level. Renamed from `itp` on 2026-09-22 — a room still
holding files under the old name gets them copied over automatically
(additively, losslessly, never deleting the old copy) the first time
that room is opened.

**FLAT project** (created by UTZLINE Projects v9+ — no real Level/Room
folders at all):

```
<Projects folder>/
  <Project>/
    project-meta.json
    joinery-items.json                          <- written by UTZLINE Projects, read-only here
    Project Saves/
      Floor Plans/<Project> - <Level>.json       <- one file per Level (rooms/markers inside)
      UTZLINE ITP/Install ITP/
        <Level> - <Room> - <Joinery Item>.json   <- this item's saved checklist state
    PDF Files/
      UTZLINE ITP/Install ITP/
        <Level> - <Room> - <Joinery Item>_<timestamp>.pdf
```

One shared folder for the whole project (not per-Level/Room) since the
filename itself already carries the full Level/Room/Item key. "+ New
Joinery Item" is hidden for a flat project — only UTZLINE Projects
creates joinery items — but every item it has created shows up here the
moment it exists, even before its checklist has been touched.

## Getting this installed as its own app

**This app lives in its own separate GitHub repository** — not a
subfolder of Site Measure's, the Viewer's, or any sibling app's repo.
Every app in the UTZLINE family (Site Measure, Viewer, Install ITP,
Manufacture ITP, UTZLINE Projects, UTZLINE Scheduler, UTZLINE Delivery
ITP) is its own repo with its own GitHub Pages URL.

1. In this app's own repo, add every file from this bundle at the repo
   **root** (not inside a subfolder) — keep the `icons/` folder
   structure intact. It'll go live at that repo's own GitHub Pages URL.
2. Open that URL once in a normal browser tab while online, so the
   service worker can cache it for offline use.
3. Install it: Chrome/Edge's install icon in the address bar ("Install
   this site as an app"). Because it has its own `manifest.json` (its
   own name and icons — green, to tell it apart from every sibling
   app's own colour), Chrome and Windows/Android treat it as a wholly
   separate, independently installable app.
4. On a phone or tablet — the main way this one's meant to be used —
   "Install this site as an app" is under the browser's own menu
   (Chrome: ⋮ → "Add to Home screen" / "Install app").

## Updating this app

Same process every time a new build ships: unzip whatever's shared in
chat, upload the files into this app's own repo root (overwriting
existing ones, keeping `icons/` intact), commit, wait for GitHub Pages
to redeploy, then close and reopen the installed app to pick up the
change. **Bump the "Current version" line at the top of this README
(with a dated changelog entry) and `service-worker.js`'s `CACHE_NAME`
every single time a change ships** — both need to move together, or
installed copies keep serving a stale cached build and this README
stops being a reliable record of what's actually live.

## Things worth knowing

- **A joinery item is just a number you type in**, not a marker placed
  on the plan — there's no on-plan picking in this app. If two people
  type slightly different numbers for what's meant to be the same
  item ("J101" vs "J-101"), they'll end up as two separate checklists;
  agreeing on a numbering convention on site avoids that.
- **Signing is finger/stylus on the device's own touchscreen** — the
  signature pad is a plain draw area with a "Clear signature" button
  per role; there's no typed/typed-name-as-signature fallback.
- **Project No./Name/Head Contractor only show up if Site Measure's
  own "Project Info" has been filled in for that project.** If it
  hasn't, those title-block fields just show as blank on the checklist
  and in the exported PDF — nothing breaks, but it's worth filling
  that in from Site Measure first for a tidy-looking export.
- **Exported PDFs accumulate.** Re-exporting the same joinery item
  after fixing something adds a new timestamped file rather than
  replacing the old one, so the `itp` folder can build up multiple
  PDFs per item over time — that's deliberate (a paper trail of every
  export), not a bug, but worth knowing if you're tidying up the
  folder later.

## What's in this folder

- `index.html` — the whole app: markup, styles, and logic in one file
- `manifest.json`, `service-worker.js` — what makes this installable
  and offline-capable as its own app
- `icons/` — this app's own green-accented icon set
- `jspdf.umd.min.js`, `sans.woff2`, `mono.woff2` — bundled library and
  fonts (all local, no CDN) — no SVG/PDF-import libraries are needed
  here since this app never opens an existing PDF or SVG, unlike the
  editor and Viewer
