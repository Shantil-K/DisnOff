/*
 * DisnOff user script for Disney+ on LG webOS TVs.
 *
 * webOS WebAppManager loads <app>/webOSUserScripts/userScript.js into every
 * page the app opens. DisnOff copies this file into the installed Disney+ app.
 *
 * Scope (matching morphe-androidtv-patches):
 *  1. Pre-roll & Mid-roll ads:
 *     - Empties insertion points and ranges in media playback responses
 *       (equivalent of Morphe's Insertion.getPoints() -> [] and getRanges() -> []).
 *     - Clears ad cue arrays (adBreaks, interstitials, cuePoints, adPods).
 *     - Replaces any VAST / VMAP XML ad payloads with empty templates.
 *  2. Pause ads:
 *     - Blocks pause ad decision and image delivery requests
 *       (*.ads.digital.disneyadvertising.com, prod-frida-origin.bamgrid.com,
 *        beacons.digital.disneyadvertising.com, ad.doubleclick.net)
 *       (equivalent of Morphe's MediaXPauseSession.started() -> return-void).
 *     - Removes pause-ad metadata objects (pauseData, MediaXPause, pauseAd).
 *     - Injects CSS rules to hide pause-ad overlays as a UI fallback.
 *
 * Written in strict ES5 for compatibility with older webOS WebKit/Chromium engines.
 */
(function () {
  'use strict';

  if (window.__DISNOFF__) return;

  var VERSION = '0.1.0';
  var CONFIG = {
    stripInsertion: true,
    stripPauseAds: true,
    emptyVast: true,
    blockAdHosts: true,
    toast: true
  };

  var stats = { insertion: 0, pause: 0, vast: 0, blocked: 0 };
  window.__DISNOFF__ = { version: VERSION, config: CONFIG, stats: stats };

  // Only run inside Disney+ / BAMGrid domains
  var host = location.hostname || '';
  if (!/(^|\.)(disneyplus|bamgrid|dssott)\.com$/i.test(host)) return;

  function log(msg) {
    try { console.log('[DisnOff] ' + msg); } catch (e) {}
  }

  var isArray = Array.isArray || function (a) {
    return Object.prototype.toString.call(a) === '[object Array]';
  };

  // ---------------------------------------------------------------------------
  // URL Classification & Host Blocking
  // ---------------------------------------------------------------------------
  // Pause ad decision, pause image origin, beacons, and measurement endpoints
  var AD_HOST_RE = /ads\.digital\.disneyadvertising\.com|beacons\.digital\.disneyadvertising\.com|prod-frida-origin\.bamgrid\.com|ad\.doubleclick\.net|pubads\.g\.doubleclick\.net|securepubads\.g\.doubleclick\.net/i;
  var JSON_TARGET_RE = /disneyplus\.com|bamgrid\.com|dssott\.com/i;

  function absUrl(url) {
    url = String(url || '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
    if (url.indexOf('//') === 0) return location.protocol + url;
    return location.protocol + '//' + location.host + (url.charAt(0) === '/' ? '' : '/') + url;
  }

  function isBlockedAdUrl(url) {
    return CONFIG.blockAdHosts && AD_HOST_RE.test(absUrl(url));
  }

  function isJsonTarget(url) {
    return JSON_TARGET_RE.test(absUrl(url));
  }

  // ---------------------------------------------------------------------------
  // 1. Pre-roll & Mid-roll Ad Removal (Insertion Points & Ranges)
  // ---------------------------------------------------------------------------
  // In Morphe: Insertion.getPoints() -> empty list, Insertion.getRanges() -> empty list
  function sanitizeInsertion(node) {
    if (!CONFIG.stripInsertion || !node || typeof node !== 'object') return false;
    var changed = false;

    // Direct insertion container: { points: [...], ranges: [...] }
    if (Object.prototype.hasOwnProperty.call(node, 'points') && isArray(node.points) && node.points.length > 0) {
      node.points = [];
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(node, 'ranges') && isArray(node.ranges) && node.ranges.length > 0) {
      node.ranges = [];
      changed = true;
    }

    // Common variant property names in BAMGrid playback schemas
    var cueKeys = [
      'insertionPoints', 'insertion_points',
      'adBreaks', 'ad_breaks',
      'interstitials',
      'adPods', 'ad_pods',
      'cuePoints', 'cue_points',
      'adSchedule', 'ad_schedule'
    ];
    for (var i = 0; i < cueKeys.length; i++) {
      var k = cueKeys[i];
      if (Object.prototype.hasOwnProperty.call(node, k) && isArray(node[k]) && node[k].length > 0) {
        node[k] = [];
        changed = true;
      }
    }

    return changed;
  }

  // ---------------------------------------------------------------------------
  // 2. Pause Ad Sanitizing
  // ---------------------------------------------------------------------------
  var PAUSE_KEYS = [
    'pauseData', 'pause_data',
    'MediaXPause', 'mediax_pause',
    'pauseAd', 'pause_ad',
    'pauseSession', 'pause_session',
    'pauseEvent', 'pause_event'
  ];

  function sanitizePauseAds(node) {
    if (!CONFIG.stripPauseAds || !node || typeof node !== 'object') return false;
    var changed = false;

    for (var i = 0; i < PAUSE_KEYS.length; i++) {
      var k = PAUSE_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(node, k) && node[k] != null) {
        node[k] = null;
        changed = true;
      }
    }

    return changed;
  }

  // Deep traversal to sanitize insertion cues and pause ad payloads
  function sanitize(node, depth) {
    if (!node || typeof node !== 'object' || depth > 40) return false;
    var changed = false;

    if (sanitizeInsertion(node)) {
      stats.insertion++;
      changed = true;
    }

    if (sanitizePauseAds(node)) {
      stats.pause++;
      changed = true;
    }

    if (isArray(node)) {
      for (var i = node.length - 1; i >= 0; i--) {
        var item = node[i];
        if (item && typeof item === 'object') {
          // If array item is an ad break or pause ad object, sanitize it
          if (sanitize(item, depth + 1)) changed = true;
        }
      }
      return changed;
    }

    for (var k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      var v = node[k];
      if (v && typeof v === 'object') {
        if (sanitize(v, depth + 1)) changed = true;
      }
    }

    return changed;
  }

  // ---------------------------------------------------------------------------
  // 3. VAST / VMAP Ad XML Neutralizer
  // ---------------------------------------------------------------------------
  var EMPTY_VAST = '<?xml version="1.0" encoding="UTF-8"?><VAST version="4.0"></VAST>';
  var EMPTY_VMAP = '<?xml version="1.0" encoding="UTF-8"?><vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0"></vmap:VMAP>';

  function adXmlReplacement(text) {
    if (!CONFIG.emptyVast || typeof text !== 'string') return null;
    var head = text.slice(0, 600);
    if (head.indexOf('<') < 0) return null;
    if (/<(\w+:)?VMAP[\s>]/.test(head)) return EMPTY_VMAP;
    if (/<VAST[\s>]/.test(head)) {
      if (!/<Ad[\s>]/.test(text)) return null; // already empty
      return EMPTY_VAST;
    }
    return null;
  }

  // Transform text / json / xml payloads
  function transformText(url, text) {
    if (typeof text !== 'string' || !text) return null;
    var c = text.charAt(0) === '\uFEFF' ? text.charAt(1) : text.charAt(0);
    if (c === '<' || /^\s*</.test(text.slice(0, 64))) {
      var x = adXmlReplacement(text);
      if (x !== null) {
        stats.vast++;
        log('emptied ad XML from ' + url);
        return x;
      }
      return null;
    }
    if ((c === '{' || c === '[') && isJsonTarget(url) && text.length < 8 * 1024 * 1024) {
      try {
        var obj = JSON.parse(text);
        if (sanitize(obj, 0)) {
          return JSON.stringify(obj);
        }
      } catch (e) {}
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 4. XMLHttpRequest Hook
  // ---------------------------------------------------------------------------
  function hookXhr() {
    var X = window.XMLHttpRequest;
    if (!X || !X.prototype) return;
    var proto = X.prototype;
    var origOpen = proto.open;
    var origSend = proto.send;

    function protoGetter(name) {
      var d = Object.getOwnPropertyDescriptor(proto, name);
      return d && d.get ? d.get : null;
    }
    var getText = protoGetter('responseText');
    var getResp = protoGetter('response');
    var getType = protoGetter('responseType');
    var getState = protoGetter('readyState');
    var canPatch = !!(getText && getResp && getState);

    function done(xhr) {
      return (getState ? getState.call(xhr) : xhr.readyState) === 4;
    }

    function processed(xhr) {
      if (xhr.__doDone) return xhr.__doResult;
      if (!done(xhr)) return null;
      xhr.__doDone = true;
      xhr.__doResult = null;
      try {
        var type = getType ? getType.call(xhr) : xhr.responseType;
        if (type === '' || type === 'text') {
          xhr.__doResult = { text: transformText(xhr.__doUrl, getText.call(xhr)) };
        } else if (type === 'json') {
          var obj = getResp.call(xhr);
          if (obj && typeof obj === 'object' && isJsonTarget(xhr.__doUrl) && sanitize(obj, 0)) {
            // modified in place
          }
        }
      } catch (e) {
        log('xhr transform failed: ' + e);
      }
      return xhr.__doResult;
    }

    function patchInstance(xhr) {
      if (!canPatch || xhr.__doPatched) return;
      xhr.__doPatched = true;
      try {
        Object.defineProperty(xhr, 'responseText', {
          configurable: true,
          get: function () {
            var r = processed(this);
            return r && r.text !== null ? r.text : getText.call(this);
          }
        });
        Object.defineProperty(xhr, 'response', {
          configurable: true,
          get: function () {
            var r = processed(this);
            return r && r.text !== null ? r.text : getResp.call(this);
          }
        });
      } catch (e) {
        log('cannot patch xhr: ' + e);
      }
    }

    proto.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      this.__doUrl = String(url);
      this.__doDone = false;
      if (isBlockedAdUrl(url)) {
        stats.blocked++;
        args[1] = 'https://127.0.0.1:9/disnoff-blocked';
      }
      return origOpen.apply(this, args);
    };

    proto.send = function (body) {
      patchInstance(this);
      return origSend.call(this, body);
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Fetch API Hook
  // ---------------------------------------------------------------------------
  function hookFetch() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function' || typeof window.Response !== 'function') return;

    window.fetch = function (input, init) {
      var isReq = typeof window.Request === 'function' && input instanceof window.Request;
      var url = isReq ? input.url : String(input);

      if (isBlockedAdUrl(url)) {
        stats.blocked++;
        return Promise.resolve(new window.Response(null, { status: 204, statusText: 'No Content' }));
      }

      return origFetch.call(this, input, init).then(function (res) {
        try {
          var ct = (res.headers && res.headers.get('content-type')) || '';
          var wanted = /json|xml|text\/plain/i.test(ct) || (!ct && isJsonTarget(url));
          if (!wanted || res.status === 204 || res.type === 'opaque') return res;
          return res.clone().text().then(function (text) {
            var out = transformText(url, text);
            if (out === null) return res;
            return new window.Response(out, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers
            });
          }, function () {
            return res;
          });
        } catch (e) {
          return res;
        }
      });
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Navigator sendBeacon Hook (Impression Beacons)
  // ---------------------------------------------------------------------------
  function hookBeacon() {
    var nav = window.navigator;
    if (!nav || typeof nav.sendBeacon !== 'function') return;
    var orig = nav.sendBeacon;
    try {
      nav.sendBeacon = function (url) {
        if (isBlockedAdUrl(url)) {
          stats.blocked++;
          return true;
        }
        return orig.apply(nav, arguments);
      };
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // 7. CSS Fallback for Pause Ads
  // ---------------------------------------------------------------------------
  function injectCss() {
    if (!CONFIG.stripPauseAds) return;
    var css =
      '[data-testid*="pause-ad"],' +
      '[class*="PauseAd"],' +
      '[class*="pause-ad"],' +
      '[id*="pause-ad"],' +
      '[class*="MediaXPause"],' +
      '[data-testid*="MediaXPause"],' +
      '.pause-ad-overlay' +
      '{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}';

    var add = function () {
      var root = document.head || document.documentElement;
      if (!root) return false;
      var el = document.createElement('style');
      el.id = 'disnoff-style';
      el.appendChild(document.createTextNode(css));
      root.appendChild(el);
      return true;
    };

    if (!add()) document.addEventListener('DOMContentLoaded', add);
    document.addEventListener('DOMContentLoaded', function () {
      if (!document.getElementById('disnoff-style')) add();
    });
  }

  // ---------------------------------------------------------------------------
  // 8. User Feedback Toast
  // ---------------------------------------------------------------------------
  function toast() {
    if (!CONFIG.toast) return;
    try {
      if (window.sessionStorage.getItem('__disnoff_toast')) return;
      window.sessionStorage.setItem('__disnoff_toast', '1');
    } catch (e) {}
    try {
      if (typeof window.PalmServiceBridge !== 'function') return;
      var bridge = new window.PalmServiceBridge();
      bridge.onservicecallback = function () {};
      bridge.call('luna://com.webos.notification/createToast',
        JSON.stringify({ message: 'DisnOff loaded', noaction: true }));
      window.__DISNOFF__.bridge = bridge;
    } catch (e) {}
  }

  // Exposed internals for unit tests & dev inspection
  window.__DISNOFF__.internal = {
    sanitize: sanitize,
    sanitizeInsertion: sanitizeInsertion,
    sanitizePauseAds: sanitizePauseAds,
    isBlockedAdUrl: isBlockedAdUrl,
    adXmlReplacement: adXmlReplacement,
    transformText: transformText
  };

  try { hookXhr(); } catch (e) { log('xhr hook failed: ' + e); }
  try { hookFetch(); } catch (e) { log('fetch hook failed: ' + e); }
  try { hookBeacon(); } catch (e) {}
  try { injectCss(); } catch (e) {}
  try { toast(); } catch (e) {}
  log('active v' + VERSION);
})();
