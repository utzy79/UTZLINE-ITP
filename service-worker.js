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

var ICON_VERSION = "v2";
var CACHE_NAME = "utzline-itp-cache-v4";

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
