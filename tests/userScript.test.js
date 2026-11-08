// Unit tests for the DisnOff user script. Run: node tests/userScript.test.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const src = fs.readFileSync(
  process.argv[2] || path.join(__dirname, '..', 'resources', 'disneyplus', 'webOSUserScripts', 'userScript.js'),
  'utf8'
);

// 1. ES5 syntax check (must run cleanly on older webOS JavaScript engines)
new vm.Script(src);
const codeWithoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
if (/=>|\blet\b|\bconst\b|`/.test(codeWithoutComments)) {
  throw new Error('non-ES5 syntax detected in userScript.js');
}

// Minimal XHR mock with prototype getters
function XHR() { this._state = 0; }
XHR.prototype.open = function (m, u) { this.openedUrl = u; this._state = 1; };
XHR.prototype.send = function (b) { this.sentBody = b; };
['responseText', 'response', 'responseType', 'readyState'].forEach(n => {
  Object.defineProperty(XHR.prototype, n, {
    configurable: true,
    get() {
      return n === 'readyState' ? this._state :
        (n === 'responseType' ? (this._type || '') :
        (n === 'response' && this._type === 'json' ? this._json : this._text));
    }
  });
});

let fetched = [];
const win = {
  location: { hostname: 'disneyplus.com', protocol: 'https:', host: 'disneyplus.com' },
  XMLHttpRequest: XHR,
  sessionStorage: { getItem() { return null; }, setItem() {} },
  navigator: { sendBeacon: () => 'orig' },
  console,
  Response: global.Response,
  Request: global.Request,
  fetch: (i, init) => {
    fetched.push([i, init]);
    const url = typeof i === 'string' ? i : i.url;
    if (url.includes('vast')) {
      return Promise.resolve(new Response(
        '<?xml version="1.0"?><VAST version="3.0"><Ad id="1"><InLine/></Ad></VAST>',
        { headers: { 'content-type': 'application/xml' } }
      ));
    }
    return Promise.resolve(new Response(
      JSON.stringify({
        playback: {
          insertion: {
            points: [{ id: "ad_cue_1", type: "preroll" }],
            ranges: [{ id: "range_1", start: 0, end: 15 }]
          },
          pauseData: { image: "ad.jpg" }
        }
      }),
      { headers: { 'content-type': 'application/json' } }
    ));
  }
};
win.window = win;

vm.runInNewContext(src, Object.assign(win, { Promise, JSON, Array, Object, String, Number, decodeURIComponent, encodeURIComponent }));
const D = win.__DISNOFF__;
const I = D.internal;

// Test: Pre-roll / Mid-roll Insertion stripping (Morphe parity)
const playbackSample = {
  scenario: "playback",
  stream: {
    insertion: {
      points: [
        { id: "preroll_1", timestamp: 0 },
        { id: "midroll_1", timestamp: 300 }
      ],
      ranges: [
        { id: "r1", start: 0, duration: 15 },
        { id: "r2", start: 300, duration: 30 }
      ]
    },
    adBreaks: [{ id: "ab1", start: 600 }],
    interstitials: [{ id: "in1" }],
    cuePoints: [0, 300, 600]
  }
};

const sanitizedPlayback = JSON.parse(
  I.transformText('https://playback.edge.bamgrid.com/v1/play', JSON.stringify(playbackSample))
);
assert.deepStrictEqual(sanitizedPlayback.stream.insertion.points, []);
assert.deepStrictEqual(sanitizedPlayback.stream.insertion.ranges, []);
assert.deepStrictEqual(sanitizedPlayback.stream.adBreaks, []);
assert.deepStrictEqual(sanitizedPlayback.stream.interstitials, []);
assert.deepStrictEqual(sanitizedPlayback.stream.cuePoints, []);

// Test: Pause ad stripping (Morphe parity)
const pauseSample = {
  player: {
    state: "paused",
    pauseData: { creativeId: "disney_pause_promo_1", assetUrl: "https://prod-frida-origin.bamgrid.com/img.jpg" },
    MediaXPause: { session: "active" },
    pause_ad: { duration: 30 }
  }
};

const sanitizedPause = JSON.parse(
  I.transformText('https://disneyplus.com/api/v1/player', JSON.stringify(pauseSample))
);
assert.strictEqual(sanitizedPause.player.pauseData, null);
assert.strictEqual(sanitizedPause.player.MediaXPause, null);
assert.strictEqual(sanitizedPause.player.pause_ad, null);

// Test: VAST / VMAP XML ad replacement
const vastInput = '<?xml version="1.0"?><VAST version="4.0"><Ad id="test"><InLine/></Ad></VAST>';
const vastOut = I.transformText('https://ads.digital.disneyadvertising.com/vast', vastInput);
assert(vastOut.includes('<VAST version="4.0"></VAST>'));
assert(!vastOut.includes('<InLine/>'));

const vmapInput = '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0"><vmap:AdBreak/></vmap:VMAP>';
const vmapOut = I.transformText('https://ads.digital.disneyadvertising.com/vmap', vmapInput);
assert(vmapOut.includes('<vmap:VMAP'));
assert(!vmapOut.includes('<vmap:AdBreak/>'));

// Test: Non-target JSON is untouched
assert.strictEqual(I.transformText('https://example.com/api', '{"some":"data"}'), null);

// Test: Blocked ad hosts detection
assert(I.isBlockedAdUrl('https://us-east-2.ads.digital.disneyadvertising.com/ad'));
assert(I.isBlockedAdUrl('https://prod-frida-origin.bamgrid.com/image.png'));
assert(I.isBlockedAdUrl('https://beacons.digital.disneyadvertising.com/impression'));
assert(I.isBlockedAdUrl('https://ad.doubleclick.net/pixel'));
assert(!I.isBlockedAdUrl('https://playback.edge.bamgrid.com/v1/play'));
assert(!I.isBlockedAdUrl('https://disneyplus.com/home'));

// Test: XHR hook
const xAd = new win.XMLHttpRequest();
xAd.open('GET', 'https://prod-frida-origin.bamgrid.com/pause_banner.png');
assert(xAd.openedUrl.includes('127.0.0.1:9'));

const xPlay = new win.XMLHttpRequest();
xPlay.open('GET', 'https://playback.edge.bamgrid.com/media');
xPlay.send(null);
xPlay._text = JSON.stringify({ insertion: { points: [{ id: 1 }], ranges: [{ id: 2 }] } });
xPlay._state = 4;
const xRes = JSON.parse(xPlay.responseText);
assert.deepStrictEqual(xRes.insertion.points, []);
assert.deepStrictEqual(xRes.insertion.ranges, []);

// Test: sendBeacon hook
assert.strictEqual(win.navigator.sendBeacon('https://beacons.digital.disneyadvertising.com/track'), true);
assert.strictEqual(win.navigator.sendBeacon('https://disneyplus.com/telemetry-normal'), 'orig');

// Test: Fetch hook async
(async () => {
  const rBlocked = await win.fetch('https://us-east-2.ads.digital.disneyadvertising.com/decision');
  assert.strictEqual(rBlocked.status, 204);

  const rPlay = await win.fetch('https://playback.edge.bamgrid.com/v1/play');
  const playData = await rPlay.json();
  assert.deepStrictEqual(playData.playback.insertion.points, []);
  assert.strictEqual(playData.playback.pauseData, null);

  const rVast = await win.fetch('https://adserver.test/vast');
  assert(await rVast.text(), '<VAST version="4.0"></VAST>');

  console.log('ALL TESTS PASSED!', JSON.stringify(D.stats));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
