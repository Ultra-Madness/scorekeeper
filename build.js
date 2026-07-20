#!/usr/bin/env node
/*
  build.js — stamps the app with a version derived from its own contents.

  Why it works this way: the version is a hash of index.html + sw.js, so it is
  physically incapable of drifting from what is actually deployed. There is no
  number to remember to bump. Two things are written from that single hash:

    1. the label shown next to "Games" in the toolbar
    2. the service-worker cache name

  Because the cache name changes automatically on any content change, a deploy
  can never be silently swallowed by a stale cache again.

  Usage:  node build.js
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = __dirname;
const OUT = path.join(DIR, '..', 'scorekeeper-deploy');
const ASSETS = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

const idxPath = path.join(DIR, 'index.html');
const swPath = path.join(DIR, 'sw.js');

let idx = fs.readFileSync(idxPath, 'utf8');
let sw = fs.readFileSync(swPath, 'utf8');

// Normalise the two generated values before hashing, so re-running the build
// on unchanged source produces the same hash instead of chasing its own tail.
const norm = (s) => s
  .replace(/const BUILD='[^']*'/, "const BUILD='dev'")
  .replace(/const CACHE = '[^']*'/, "const CACHE = 'dev'");

// 7 chars, not 6: a 6-character hex string is indistinguishable from a CSS
// colour (#f48a0e), which reads as a design token rather than a build stamp.
const hash = crypto.createHash('sha256')
  .update(norm(idx) + norm(sw))
  .digest('hex')
  .slice(0, 7);

// Build counter only advances when the content hash actually changes.
const verPath = path.join(DIR, 'version.json');
let prev = { build: 0, hash: null };
try { prev = JSON.parse(fs.readFileSync(verPath, 'utf8')); } catch (e) {}

const changed = prev.hash !== hash;
const build = changed ? (prev.build || 0) + 1 : (prev.build || 1);
const stamp = new Date().toISOString().slice(0, 10);
// 7 hex chars is enough to break the colour resemblance on its own; a "build"
// prefix reads better but overflows the toolbar on a 375px phone.
const label = 'v' + build + ' · ' + hash;

fs.writeFileSync(verPath, JSON.stringify({ build, hash, date: stamp }, null, 2) + '\n');

idx = idx.replace(/const BUILD='[^']*'/, "const BUILD='" + label + "'");
sw = sw.replace(/const CACHE = '[^']*'/, "const CACHE = 'scorekeeper-" + hash + "'");
fs.writeFileSync(idxPath, idx);
fs.writeFileSync(swPath, sw);

// Syntax-check the stamped output before it can reach the deploy folder.
const script = idx.match(/<script>([\s\S]*)<\/script>/);
if (!script) { console.error('FAILED: no <script> block found in index.html'); process.exit(1); }
try { new Function(script[1]); } catch (e) {
  console.error('FAILED: index.html script syntax error — ' + e.message); process.exit(1);
}
try { new Function(sw); } catch (e) {
  console.error('FAILED: sw.js syntax error — ' + e.message); process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of ASSETS) fs.copyFileSync(path.join(DIR, f), path.join(OUT, f));

console.log((changed ? 'Content changed → new build' : 'No content change → build held') + ': ' + label);
console.log('  cache name : scorekeeper-' + hash);
console.log('  staged to  : ' + OUT);
