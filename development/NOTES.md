# DisnOff development notes

## How the Disney+ webOS app works

The Disney+ webOS app (`com.disney.disneyplus-prod`) runs on the LG webOS WebAppManager container, communicating with Disney Media Platform (DMP) and BAMGrid/DSS backend endpoints (`playback.edge.bamgrid.com`, `disney.api.edge.bamgrid.com`, `dssott.com`, `disneyplus.com`).

Similar to HotsOff, DisnOff uses webOS's built-in WebAppManager user script mechanism:
WAM injects `<app dir>/webOSUserScripts/userScript.js` into every page the Disney+ web application opens.
`tools/patchctl.sh start` installs `resources/disneyplus/webOSUserScripts/userScript.js` into the installed Disney+ app folder (`/media/cryptofs/apps/usr/palm/applications/com.disney.disneyplus-prod`). Preinstalled system versions receive a bind-mount overlay.

---

## Patch Details (Parity with `morphe-androidtv-patches`)

In Morphe Android TV (`ajstrick81.morphe.patches.disney`), the Disney+ patch removes **mid-roll / pre-roll ads and pause ads**:

| Ad type | Morphe Android TV Patch | DisnOff webOS Counter-Measure |
|---|---|---|
| **VOD Pre-roll & Mid-roll** | `Insertion.getPoints()` and `Insertion.getRanges()` in DSS SDK (`com.dss.sdk.internal.media.Insertion`) and DMP (`com.disney.dmp.internal.pbo.Insertion`) are patched at offset 0 to return an empty `ArrayList`. This causes the player orchestration to see zero ad cues and skip all break scheduling. | Intercepts XHR and fetch responses from BAMGrid / Disney endpoints. Deep sanitization ensures `insertion.points = []`, `insertion.ranges = []`, and clears any `adBreaks`, `interstitials`, `adPods`, `cuePoints`. Player sees zero ad cues and skips ad scheduling. |
| **Pause Ads (Network & Decision)** | `MediaXPauseSession.started()` patched with `return-void`. Network analysis (PCAPdroid) confirmed image fetch from `prod-frida-origin.bamgrid.com` (+26.10s) and ad decision to `us-east-2.ads.digital.disneyadvertising.com` (+25.52s), beacons to `beacons.digital.disneyadvertising.com`, and measurement to `ad.doubleclick.net`. | Network hooks (XHR, fetch, sendBeacon) and `/etc/hosts` block all calls to `*.ads.digital.disneyadvertising.com`, `prod-frida-origin.bamgrid.com`, `beacons.digital.disneyadvertising.com`, and `ad.doubleclick.net`. |
| **Pause Ads (Metadata & DOM)** | Overlay render event (`getStarted().onNext()`) never fires; overlay stays at `alpha = 0`. | JSON responses have `pauseData`, `MediaXPause`, `pauseAd`, and `pauseSession` objects stripped/nulled. Injected CSS hides all pause-ad containers (`[data-testid*="pause-ad"]`, `[class*="PauseAd"]`, `[class*="MediaXPause"]`). |
| **Ad Server Fallback** | — | Any VAST / VMAP XML document that reaches the client is replaced by an empty VAST 4.0 / VMAP 1.0 template. |

---

## Scope & Non-interference

As requested, DisnOff targets **only**:
1. VOD pre-roll & mid-roll ads
2. Pause ads

It intentionally leaves all other features untouched (account authentication, profile picker, home catalog browsing, audio/subtitle tracks, video playback streams, and live streams).

---

## Debugging & Verification

To inspect DisnOff inside the running Disney+ app on webOS:

```bash
# Open Web Inspector on the TV
ares-inspect -d <tv-device-name> --app com.disney.disneyplus-prod

# Check counters inside DevTools console:
> __DISNOFF__.stats
// { insertion: N, pause: N, vast: N, blocked: N }
```
