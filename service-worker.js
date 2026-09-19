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

var ICON_VERSION = "v2";
var CACHE_NAME = "utzline-itp-cache-v6";

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
