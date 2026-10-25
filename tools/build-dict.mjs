// Builds dict.txt: real English words (in BOTH the CMU Pronouncing Dictionary and a general
// English word list), minus an offensive-words list, with a compact one-character-per-sound encoding.
//
// usage: node tools/build-dict.mjs <cmudict.dict> <words_alpha.txt> <badwords.txt> <out dict.txt>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../core.js');
const [cmuPath, wordsPath, badPath, outPath] = process.argv.slice(2);

const english = new Set(fs.readFileSync(wordsPath, 'utf8').split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(Boolean));
const bad = new Set(fs.readFileSync(badPath, 'utf8').split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(Boolean));
const isBad = w => bad.has(w);

const entries = new Map();   // word -> [phone arrays]
for (const line of fs.readFileSync(cmuPath, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith(';')) continue;
  const m = line.split('#')[0].trim().match(/^([^\s(]+)(?:\(\d+\))?\s+(.+)$/);
  if (!m) continue;
  const word = m[1];
  if (!/^[a-z]+$/.test(word) || !english.has(word) || isBad(word)) continue;
  (entries.get(word) || entries.set(word, []).get(word)).push(m[2].trim().split(/\s+/));
}

// Plurals / "-s" verb forms the pronouncing dictionary doesn't list: derive from the base word.
const SIBILANT = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']), VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH']);
let derived = 0;
for (const w of english) {
  if (entries.has(w) || !/^[a-z]+$/.test(w) || isBad(w) || !w.endsWith('s') || w.length < 4) continue;
  for (const base of [w.slice(0, -1), w.endsWith('es') ? w.slice(0, -2) : null, w.endsWith('ies') ? w.slice(0, -3) + 'y' : null]) {
    const prons = base && entries.get(base);
    if (!prons) continue;
    entries.set(w, prons.map(p => {
      const last = p[p.length - 1];
      return SIBILANT.has(last) ? [...p, 'IH0', 'Z'] : VOICELESS.has(last) ? [...p, 'S'] : [...p, 'Z'];
    }));
    derived++; break;
  }
}

const lines = [];
for (const [w, prons] of [...entries].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
  const enc = [...new Set(prons.slice(0, 3).map(core.encodePhones))];
  lines.push(`${w} ${enc.join('|')}`);
}
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} words (${derived} derived plurals) -> ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(2)} MB)`);
