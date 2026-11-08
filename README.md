# DisnOff

> Patch-based ad-block layer for the stock Disney+ app on rooted LG webOS TVs.
> A sister project of [HotsOff](https://github.com/Shantil-K/HotsOff) and [AmazOff](https://github.com/azoffshowy/AmazOff).

![Screenshot](./Screenshot.png?raw=true)

## Overview

**DisnOff** is an IPK application for **rooted LG webOS TVs**. It patches the installed Disney+ app (`com.disney.disneyplus-prod`):

- **Removes VOD pre-rolls and mid-rolls**: Empties playback orchestration insertion points and ranges so the player schedules zero ad cues.
- **Removes pause ads**: Blocks pause ad decision and image fetch network requests (`*.ads.digital.disneyadvertising.com`, `prod-frida-origin.bamgrid.com`, `beacons.digital.disneyadvertising.com`, `ad.doubleclick.net`), removes pause ad payloads, and injects CSS to suppress pause overlays.
- **Scope**: Focused strictly on disabling **mid-roll / pre-roll ads and pause ads**, leaving all standard app features (profiles, browsing, playback controls, and live streams) completely untouched.

Because the stock app itself is patched, every launch path—including the magic remote, home launcher tile, and deep links—opens the ad-free version.

DisnOff requires **[Homebrew Channel](https://www.webosbrew.org/)** to be present and functional.

---

## How it works

The Disney+ webOS app runs inside the webOS WebAppManager. DisnOff places a WebAppManager user script (`webOSUserScripts/userScript.js`) into the installed Disney+ app directory. When Disney+ starts, WebAppManager injects this script into every page of the app.

The patch design aligns directly with the bytecode patches developed in [morphe-androidtv-patches](https://github.com/Paresh-Maheshwari/morphe-androidtv-patches):

1. **Pre-rolls & Mid-rolls (Insertion points & ranges)**: In Morphe Android TV, `Insertion.getPoints()` and `Insertion.getRanges()` in DSS SDK and DMP (Disney Media Platform) are patched to return an empty list. In webOS, DisnOff intercepts BAMGrid/DSS network responses, clearing `insertion.points`, `insertion.ranges`, and all ad cue lists (`adBreaks`, `interstitials`, `adPods`, `cuePoints`).
2. **Pause ads**: In Morphe, `MediaXPauseSession.started()` is patched with `return-void` to prevent the Glide network fetch from `prod-frida-origin.bamgrid.com` and beacons to `beacons.digital.disneyadvertising.com`. In webOS, DisnOff hooks XHR/fetch/sendBeacon to block these endpoints, neutralizes pause ad metadata, and injects CSS rules to hide pause overlays.

See [development/NOTES.md](development/NOTES.md) for full technical details.

---

## Requirements

- Rooted LG webOS TV (e.g. via [webosbrew / rootmy.tv](https://www.webosbrew.org/))
- [Homebrew Channel](https://www.webosbrew.org/)
- Stock Disney+ app installed from the LG Content Store (`com.disney.disneyplus-prod`)

> **Status:** not yet tested on a TV. Reports from webOS 22+ owners are welcome.

---

## Installation

Install the `.ipk` using **[Device Manager for webOS](https://github.com/webosbrew/dev-manager-desktop)** or via the Homebrew Channel.

---

## Usage

1. Launch **DisnOff** from the TV app launcher.
2. Press **Start Service** (installs the patch and closes Disney+ if it was running).
3. **Recommended:** Enable **Autostart** – the patch will be automatically re-applied at every boot, which ensures continuous protection after Disney+ app updates.
4. **Launch Disney+**.

**Notes:**
- A **"DisnOff loaded"** toast confirms the patch when Disney+ starts.
- **Stop Service** removes the user script and restores original configuration.
- Check the **Details** page log if you encounter any issues.

---

## Building

```bash
# Run unit tests
node tests/userScript.test.js

# Build IPK package
sh development/createPackage.sh
```

---

## License

DisnOff is licensed under the **GNU General Public License v3.0**, see [LICENSE](LICENSE).

---

## Credits & third-party licenses

- DisnOff is inspired by and derived from [HotsOff](https://github.com/Shantil-K/HotsOff) and [AmazOff](https://github.com/azoffshowy/AmazOff). The UI, service scripts, and packaging are adapted under the GPL-3.0 / MIT license; original notice kept in [LICENSES/MIT-AmazOff.txt](LICENSES/MIT-AmazOff.txt).
- The patch logic was informed by the Disney+ patches in [morphe-androidtv-patches](https://github.com/Paresh-Maheshwari/morphe-androidtv-patches) by RookieEnough, Paresh-Maheshwari, chiggi, and ajstrick81.
- `js/spatial_navigation.js`: [js-spatial-navigation](https://github.com/luke-chang/js-spatial-navigation) by Luke Chang, MPL 2.0 (unmodified).
- `js/webOSTVjs-1.2.10`: LG webOS TV library, Apache 2.0.
- DisnOff is not affiliated with Disney or Disney+. Disney+ is a trademark of its owner.
