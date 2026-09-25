// UTZLINE ITP offline service worker.
//
// This is a SEPARATE, independently-installable app in the same family as
// UTZLINE Site Measure (the editor) and UTZLINE Viewer (the read-only
// browser) -- its own manifest, own icon, own taskbar/Start-menu entry, own
// cache namespace ("utzline-itp-cache-*", never sharing a name with either
// of the other two even though all three can be installed side by side on
// the same machine). Unlike the Viewer, this is NOT built from the same
// source.html as the editor -- it's a standalone, purpose-built app (a
// checklist form, not a plan-drawing canvas) that reads the SAME Projects
// folder structure (project/level/room, the same reserved saves/pdfs/backup
// convention) and writes its own project-wide "itp" folder alongside a
// project's level folders. See index.html's own top-of-file comment for the
// full data-format rationale.
//
// Same cache-first app shell strategy as the other two apps: a small, fixed
// set of local files, no CDN calls once installed. Bump CACHE_NAME whenever
// index.html or any vendored asset changes, so installed copies pick up the
// update instead of serving stale files forever.
//
// (v1: first release -- project/level/room browsing, a Joinery Items list
// per room, the 16-row install-quality checklist with per-role touch
// signatures, and PDF export into the project's own itp/<level>/<room>
// folder.)
//
// (v2, 2026-09-18: a Level Plan screen -- the level's own photo, panned/
// zoomed like the Viewer, with every joinery-item marker Site Measure
// places on it (one marker per joinery item, not per room) shown as a
// green tick/red cross for that item's own sign-off status; tapping one
// jumps straight into that item's checklist. A company-logo setting
// (device-wide, stored locally) prints top-right on exported PDFs, and
// UTZLINE ITP's own brand mark prints bottom-right on every page. The
// checklist's Back button now asks to save/discard/cancel when there's a
// real unsaved edit, same three-way dialog as the other two apps.)
//
// (v3, 2026-09-18: BUG FIX -- the new Level Plan screen (v2) never showed a
// plan at all, on any level, always falling back to the room list. Root
// cause: it only recognised a level's base photo saved as one single
// imageDataURL string; a large plan (e.g. a big CAD-exported fitout scan)
// is saved by Site Measure as a set of stitched image tiles instead, which
// is the normal case for real architectural plans, not an edge case -- so
// loadLevelPlan()/renderLevelPlanScreen() now render tiled plans too, the
// same way Site Measure and the Viewer already do.)
//
// (v4, 2026-09-19: two adjustments Andrew asked for. (1) "make the viewer
// larger in the itp app, same as the viewer app" -- the Level Plan screen
// now goes full-viewport, edge-to-edge below a slim top bar, instead of a
// fixed 60vh box sitting in a narrow, padded, centered column. (2) the
// exported PDF's logos: both the company logo and UTZLINE ITP's own brand
// mark are now 2x their previous size and sit together at the TOP of every
// page -- company logo on the left, UTZLINE on the right -- instead of
// company-logo-top-right-on-page-1-only plus UTZLINE-bottom-right-on-every-
// page. The company logo is still set per device via "Insert logo" on the
// Projects screen; Andrew separately asked for it to be baked into the app
// the same way the UTZLINE mark already is, which needs his actual logo
// file to embed -- see the reply for what's needed to finish that part.)
//
// (v5, 2026-09-19: BUG FIX -- reported directly as the joinery-items list
// "getting a lot of garbage." populateItemList() used to list every .json
// file sitting in a room's itp folder as if it were a real joinery item,
// with no filtering at all. A cloud-sync client (Dropbox, or an Android
// storage provider backing a synced folder) renames rather than overwrites
// a file when the SAME item file gets written from two places close
// together in time -- e.g. "y45ry5r (Andrew Utz's conflicted copy) (1).json"
// or "y45ry5r_1234620388645988351.json" -- and every one of those extra
// files was showing up as its own full checklist entry. Nothing in this
// app's own code ever creates a filename like that; it's produced entirely
// by the sync layer underneath the folder. Fixed by recognising both known
// naming patterns and keeping them out of the main list -- never deleted,
// since one could hold real signed-off data from whichever device lost the
// naming race -- tucked instead under a collapsed "N sync-duplicate files
// found" toggle that can still be expanded and opened for review.)

// (v6, 2026-09-19: four PDF export improvements Andrew asked for in one
// note. (1) "N/A on the itp i want to be blue" -- the on-screen N/A
// tri-button now uses a new blue --info color instead of a neutral grey
// (new :root/dark-theme tokens --info/--info-ink/--info-soft). (2) "the itp
// exort forms need gridlines for na / no / yes ... make the itp export
// look more like the app" -- the checklist table now draws real vertical
// gridlines between every column on every row (previously just one outer
// box per row, no internal dividers), and the selected Yes/No/N-A cell
// gets a light tint of that same status's color (green/red/blue) with the
// "X" drawn in its ink color, echoing the on-screen tri-buttons instead of
// a plain black "X" regardless of status. (3) "bottom signatures on the
// exports to be side by side to save space" -- the two sign-off blocks
// (installer/supervisor) now share one row of two half-width columns
// instead of each taking a full-width row; each column stacks its own
// label/Name/Date above its own (now slightly smaller) signature box,
// since a half-width column doesn't have room to put the text and the
// signature box side by side the way the old full-width layout did. (4)
// "both company and utzline logos on the exports are low resolution
// unreadable" -- UTZLINE ITP's own baked-in brand mark was only a 96x96
// source PNG; v36/ITP v4 doubled its PDF footprint (24px -> 48pt) without
// a matching resolution bump, so it was being upscaled and looked
// pixelated. Re-exported at 256x256 from the same icon-512.png artwork
// this app's own icon set already uses. The company logo is a per-device
// upload (Projects screen "Insert logo"), so its crispness depends on the
// resolution of whatever file was uploaded -- this app already never
// upscales it beyond its own natural pixel size, so if it still looks
// soft, re-uploading a higher-resolution version of that same file is what
// actually fixes it, not a code change here.)
//
// (v7, 2026-09-21: first piece of UTZLINE Data Standard v1 -- a shared
// "device identity" setting (Projects screen, "Set your name") stored in
// the same "utzline-identity" IndexedDB database Site Measure/Viewer's own
// toolbar button now uses, so a name set in either app shows up in both
// (same GitHub Pages origin). Stamped into every checklist autosave as
// "lastEditedBy" -- purely additive, an empty string reads exactly like a
// checklist saved before this field existed.)
//
// (v8, 2026-09-22: this app now has a sibling, UTZLINE Manufacture ITP --
// the factory/pre-delivery-stage checklist app, forked directly from this
// codebase, with its own project-wide "itp-manufacture" data folder so the
// two stages' checklists for the same joinery item never collide. This
// app's own level list now also excludes that folder by name, the same way
// it already excluded its own "itp" folder, so it never shows up here
// mislabeled as an empty level.)
//
// v9, 2026-09-22 (same day): flat-project support, per Andrew's "Ok now
// let's get both the itp pages working with the new folder structure" --
// a project created by UTZLINE Projects v9+ (Project Saves/Floor Plans/,
// joinery-items.json, no real Level/Room folders) now works here too:
// Levels/Rooms are read from those files instead of folders, the joinery-
// item list comes from joinery-items.json ("+ New Joinery Item" hidden --
// only UTZLINE Projects creates items, per Andrew's own cutover
// instruction), and this app's own checklist/PDF data for a flat project
// lives in Project Saves/UTZLINE ITP/Install ITP/ and PDF Files/UTZLINE
// ITP/Install ITP/ (one shared, app-grouped folder per project, matching
// Andrew's own approved Release 3 folder diagram) rather than per-Level/
// Room. Bundled into this same release: this app's own data folder is
// renamed from "itp" to "itp-install" (Unified Implementation Brief
// section O, disambiguating it from the "itp-manufacture" folder its
// Manufacture ITP sibling owns) -- writes always go to the new name, and
// opening a room additively, losslessly migrates any files still sitting
// under the old "itp" folder into "itp-install" the first time that room
// is opened post-rename (never deleting the old copy). A LEGACY
// (folder-based) project's behaviour is otherwise completely unchanged.
// v10, 2026-09-23: this app's checklist sign-off now auto-advances the
// shared joinery-status.json record (project root, a sibling of
// joinery-items.json, works in both flat and legacy projects) forward to
// "installed" the moment both signoff.builder and signoff.supervisor are
// filled in -- on every autosave/explicit save (flushPendingSave), and
// retroactively the next time an already-signed checklist from before this
// existed is opened (openItem), so nothing has to be re-signed to pick up
// the new status. Status is forward-only (never demoted back down to
// "measured"/"manufactured" by anything). The shared status badge (📏 site
// measured / 📦 manufactured / 🏆 installed) now renders on this app's own
// Level Plan markers too, alongside its existing ✓/✕ checklist-complete
// indicator (a separate, unrelated signal, unchanged). Also adds a "View
// job note" button to the checklist screen, listing whatever PDFs Site
// Measure or the Viewer have attached to this joinery item under its own
// "Project Saves/Job Notes/<key>/" folder (read-only here; this app never
// writes a job note itself). Per Andrew: "we also need on the right click
// menu, a mark as check measured button, this also changes the red dot...
// installed (install itp signed off)". The shared forward-only status
// pipeline itself is covered end to end by
// run_joinery_status_and_job_notes.js and, with a real UI-driven sign-off
// (actual drawn signatures, not simulated), by
// run_manufacture_itp_status_signoff.js against this app's sibling,
// Manufacture ITP -- both apps' auto-status wiring into flushPendingSave/
// openItem is byte-for-byte the same shape. This app's own existing smoke
// tests and the full cross-app regression suite re-run clean afterward.
//
// v11, 2026-09-23 (same day): the shared joinery-status.json pipeline now
// has two more stages (Andrew, on UTZLINE Projects' Joinery Register) --
// "in_manufacture" (Manufacture ITP checklist opened, not yet signed) and
// "delivered" (a placeholder reserved for a future Delivery ITP app -- this
// app writes neither). This app's own "installed" trigger is unchanged
// except it now prefers the real signed-in device identity over the plain
// "Install ITP" app-name fallback when attributing the change, and every
// forward transition now appends a {status, at, by} entry to the record's
// own `history` array (with a one-time backfill for a record saved before
// this field existed), so UTZLINE Projects' Register can show a full
// status-change history on hover.
//
// v15, 2026-09-23 (same day): the shared name+PIN identity registry, ported
// verbatim from UTZLINE Delivery ITP (the reference implementation), per
// Andrew's own instruction: "implement the username as per the delivery itp
// throughout the entire system, but instead of it opening a popup, the
// button is the selector, when you pick a name it opens a numberpad to
// input the pin (4 digit pin)." This app's old "Set your name" button plus
// a single freeform-text genericPrompt (no PIN at all) is gone. The native
// <select id="identitySelector"> on the Projects screen IS the button --
// its own dropdown lists every known name plus "+ Add a new name...", and
// choosing an existing name immediately opens a real on-screen 0-9
// numberpad (#numberpadBackdrop) to verify its 4-digit PIN, rather than a
// popup. Adding a brand-new name still asks for the name as plain text via
// this app's own genericPrompt, then the PIN is chosen and confirmed via
// two numberpad rounds, then a small "show me in" app-tickbox modal
// (InstallITP pre-checked) is shown. Names/PINs live in a new shared CSV,
// <ProjectsRoot>/utzline-users.csv ("Name,PIN,ShowInApps", PIN in plain
// text -- reference-only attribution, not real access control, so Andrew
// can inspect/edit it directly) -- the SAME file every app in the family
// reads/writes, so a name added from any app shows up in all of them. The
// underlying per-device "utzline-identity" IndexedDB mechanism (shared
// cross-app on the same origin already) is completely unchanged -- only
// what triggers the write on this screen. Covered end to end by the new
// run_itp_identity_pin.js; this app's other existing smoke tests re-run
// clean afterward.
//
// (v17, 2026-09-23: Andrew, verbatim: "the install itp is to aldo have a
// rework tracker. You can now long press on a joinery item and have 2
// buttons. 1 is open itp. The other is open rework. This is where we can
// take photos and provide text information for rework joinery parts
// including cabinet number. This will also have a received tick box with
// date selector. Multiple reworks can be added per joinery item and fully
// trackable via this system and via utzline projects summary pages per
// project." The Level Plan screen previously had no long-press/menu
// concept at all -- a plain tap jumped straight into the checklist (a
// deliberate scope limit called out in the Job Notes design comment the
// day before this request). Long-press (550ms) or a real right-click on
// desktop now opens a small "Open ITP" / "Open rework" action sheet
// instead; a plain tap is completely unchanged. "Open rework" opens a new
// Rework screen for that item: an "Add rework" form (cabinet number, free
// text, photos -- reusing the checklist's own photo downscale pipeline)
// plus a history list of every past entry, each independently showing a
// "Received back on site" checkbox with its own date selector. Multiple
// entries per item are supported. Stored in its own JSON file per item
// (Project Saves/UTZLINE ITP/Install ITP Rework/ for a flat project,
// itp-install-rework/<Level>/<Room>/ for a legacy one) -- deliberately
// separate from the checklist's own JSON, so UTZLINE Projects (and any
// future app) can read rework history without depending on the
// checklist's own shape. No PDF export for rework -- in-app tracking here,
// plus a read-only summary in UTZLINE Projects.)
//
// (v18 / cache v18, 2026-09-23: Andrew, verbatim, on the exported PDF's
// photos/pin-drops/snapshots: "change it from a3 to a4 portrait. All
// collated nicely per page. All to be date and time stamped with users
// name also." The trailing photo-grid page(s) (previously A3 landscape,
// 3x2) are now A4 portrait, 2x3, matching the rest of the document's own
// page size for the first time -- each photo now shows a date/time +
// uploader-name caption underneath it (formatPdfImageStamp), sourced from
// a new `addedBy` field stamped onto a photo the moment it's added
// (deviceUserName at add-time, not export-time) alongside its existing
// `addedAt`. A photo added before this release has no addedBy on file and
// simply shows its date/time alone, never a blank or "undefined" name.)
//
// (v19 / cache v19, 2026-09-23: Andrew, verbatim: "Manufacture status needs
// to be split up into 2 parts. We need a machined and a manufactured tab.
// All traceable by user name. Machined to have its own app. Called machine
// schedule. This is where the machinist can mark off a joinery item as
// complete. It will add their name and date time to the system." This app
// now recognises a new "machined" joinery status (rank 3, between
// "in_manufacture" and "manufactured") set by the brand-new sibling app
// UTZLINE Machine Schedule, whenever a machinist marks an item complete
// there (their own signed-in name + timestamp, via the same shared
// deviceUserName identity this app already uses). This app never sets
// "machined" itself -- read-only here, same as it already was for
// "manufactured"/"in_manufacture"/"delivered" -- but its own
// joineryStatusRank/joineryStatusIcon/joineryDisplayIcon needed the new
// case, and manufactured/delivered/installed all shift up one rank (4/5/6,
// was 3/4/5) to make room for it. No other behaviour change.)
var ICON_VERSION = "v2";
var CACHE_NAME = "utzline-itp-cache-v25";

var PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json?v=" + ICON_VERSION,
  "./jspdf.umd.min.js",
  "./sans.woff2",
  "./mono.woff2",
  "./icons/icon-192.png?v=" + ICON_VERSION,
  "./icons/icon-512.png?v=" + ICON_VERSION,
  "./icons/icon-192-maskable.png?v=" + ICON_VERSION,
  "./icons/icon-512-maskable.png?v=" + ICON_VERSION
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(PRECACHE_URLS);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(event){
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function(cached){
      var networkFetch = fetch(event.request).then(function(response){
        if (response && response.status === 200){
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){
        return cached;
      });
      // Cache-first for instant offline loads; refresh the cache in the
      // background whenever the network is available.
      return cached || networkFetch;
    })
  );
});
