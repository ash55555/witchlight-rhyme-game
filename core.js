// Rhyme engine + game rules for the Witchlight rhyming game.
// Pure logic (no page code) so it can run in the browser and be tested in Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RhymeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Phoneme encoding (one character per sound, keeps the dictionary small) ----------
  const CONS = ['B','CH','D','DH','F','G','HH','JH','K','L','M','N','NG','P','R','S','SH','T','TH','V','W','Y','Z','ZH'];
  const VOW  = ['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'];
  const CCH = 'abcdefghijklmnopqrstuvwx';
  const VCH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+';
  const INFO = {};
  for (let i = 0; i < CONS.length; i++) INFO[CCH[i]] = { v: false };
  for (let i = 0; i < VCH.length; i++) INFO[VCH[i]] = { v: true, id: Math.floor(i / 3), stress: i % 3 };
  const REDUCED = new Set([VOW.indexOf('AH'), VOW.indexOf('IH'), VOW.indexOf('ER'), VOW.indexOf('UH')]);

  function encodePhones(phones) {
    let out = '';
    for (const p of phones) {
      const c = CONS.indexOf(p);
      if (c >= 0) { out += CCH[c]; continue; }
      const id = VOW.indexOf(p.slice(0, 2)), stress = +p[2];
      if (id < 0 || !(stress >= 0 && stress <= 2)) throw new Error('bad phone ' + p);
      out += VCH[id * 3 + stress];
    }
    return out;
  }

  // ---------- Dictionary ----------
  let DICT = new Map();   // word -> [encoded pronunciations]
  function loadDictionary(text) {
    DICT = new Map();
    for (let line of text.split('\n')) {
      line = line.replace(/\r$/, '');
      if (!line) continue;
      const sp = line.indexOf(' ');
      DICT.set(line.slice(0, sp), line.slice(sp + 1).split('|'));
    }
    return DICT.size;
  }
  const hasWord = w => DICT.has(w);
  const dictSize = () => DICT.size;

  // ---------- Rhyme tails ----------
  function vowelPositions(s) { const out = []; for (let i = 0; i < s.length; i++) if (INFO[s[i]].v) out.push(i); return out; }
  function tailStart(s) {
    let lastStressed = -1, lastVowel = -1;
    for (let i = 0; i < s.length; i++) { const f = INFO[s[i]]; if (f.v) { lastVowel = i; if (f.stress > 0) lastStressed = i; } }
    return lastStressed >= 0 ? lastStressed : lastVowel;
  }
  function onsetOf(s, vowelIdx) { let i = vowelIdx; while (i > 0 && !INFO[s[i - 1]].v) i--; return s.slice(i, vowelIdx); }
  function tailInfo(s) {
    const t = tailStart(s);
    if (t < 0) return null;
    return { tail: s.slice(t), k: vowelPositions(s.slice(t)).length, onset: onsetOf(s, t) };
  }
  function tailsMatch(a, b) {
    if (a.length !== b.length) return false;
    let first = true;
    for (let i = 0; i < a.length; i++) {
      const ca = a[i], cb = b[i], ia = INFO[ca], ib = INFO[cb];
      if (!ia.v || !ib.v) { if (ca !== cb) return false; continue; }
      if (first) { if (ia.id !== ib.id) return false; first = false; continue; }
      if (ia.id === ib.id) continue;
      if ((ia.stress === 0 || ib.stress === 0) && REDUCED.has(ia.id) && REDUCED.has(ib.id)) continue;
      return false;
    }
    return true;
  }

  // Every pronunciation of a phrase (words glued together), capped to a handful.
  function phraseVariants(tokens) {
    let combos = [''];
    for (const t of tokens) {
      const prons = DICT.get(t); if (!prons) return [];
      const next = [];
      for (const c of combos) for (const p of prons) { next.push(c + p); if (next.length >= 8) break; }
      combos = next;
    }
    return combos;
  }

  // Compare one candidate pronunciation to a seed's tails. 'ok' = rhymes, 'same' = rhymes but sounds identical.
  function compare(seedInfos, cand) {
    let same = false;
    const vp = vowelPositions(cand);
    for (const si of seedInfos) {
      if (vp.length < si.k) continue;
      const start = vp[vp.length - si.k];
      if (!tailsMatch(si.tail, cand.slice(start))) continue;
      if (onsetOf(cand, start) === si.onset) { same = true; continue; }
      return 'ok';
    }
    return same ? 'same' : 'no';
  }

  function makeSeed(word) {
    const prons = DICT.get(word);
    if (!prons) return null;
    return { word, infos: prons.map(tailInfo).filter(Boolean) };
  }

  function tokenize(text) {
    return String(text || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  }

  // used = Set of whole answers already said (including the seed word)
  function checkAnswer(seed, text, used) {
    const tokens = tokenize(text);
    if (tokens.length === 0) return { ok: false, kind: 'empty' };
    if (tokens.length > 4) return { ok: false, kind: 'long' };
    for (const t of tokens) if (!DICT.has(t)) return { ok: false, kind: 'notword', word: t };
    const key = tokens.join(' ');
    if (used && used.has(key)) return { ok: false, kind: 'used', word: key };
    let result = 'no';
    for (const cand of phraseVariants(tokens)) {
      const r = compare(seed.infos, cand);
      if (r === 'ok') { result = 'ok'; break; }
      if (r === 'same') result = 'same';
    }
    if (result === 'ok') return { ok: true, text: key };
    if (result === 'same') return { ok: false, kind: 'same' };
    return { ok: false, kind: 'wrong', text: tokens.join(' ') };
  }

  // How many ordinary single words rhyme with a seed (to pick seeds that are fun to play).
  function rhymeCount(word) {
    const seed = makeSeed(word); if (!seed) return 0;
    let n = 0;
    for (const [w, prons] of DICT) {
      if (w === word) continue;
      for (const p of prons) if (compare(seed.infos, p) === 'ok') { n++; break; }
    }
    return n;
  }

  // ---------- Game rules (shared by every screen, driven by an ordered event log) ----------
  const MAX_PLAYERS = 10;
  function initialState() {
    return { status: 'lobby', players: [], seed: null, secs: 25, turnIdx: 0, turnPid: null, turnStart: 0, words: [], used: new Set(), winner: null };
  }
  const nextAlive = (st, fromPid) => {
    const n = st.players.length, i0 = st.players.findIndex(p => p.pid === fromPid);
    for (let step = 1; step <= n; step++) { const p = st.players[(i0 + step) % n]; if (p.alive) return p.pid; }
    return null;
  };
  function advance(st, ev, fromPid, effects) {
    const alive = st.players.filter(p => p.alive);
    if (alive.length <= 1) {
      st.status = 'ended'; st.turnPid = null; st.winner = alive[0] ? alive[0].pid : null;
      if (st.winner) effects.push({ type: 'win', pid: st.winner });
      return;
    }
    st.turnPid = nextAlive(st, fromPid); st.turnIdx++; st.turnStart = ev.ts;
    effects.push({ type: 'turn', pid: st.turnPid });
  }

  // Apply one event. Mutates and returns { state, effects }. Invalid or out-of-turn events are ignored.
  function reduce(st, ev) {
    const effects = [];
    const P = pid => st.players.find(p => p.pid === pid);
    switch (ev.t) {
      case 'join': {
        if (st.status !== 'lobby') break;
        const name = String(ev.name || '').slice(0, 16).trim() || 'Guest', emoji = String(ev.emoji || '✨').slice(0, 12);
        const ex = P(ev.by);
        if (ex) { ex.name = name; ex.emoji = emoji; effects.push({ type: 'update', pid: ex.pid }); break; }
        if (st.players.length >= MAX_PLAYERS) break;
        st.players.push({ pid: ev.by, name, emoji, alive: true, height: 0 });
        effects.push({ type: 'join', pid: ev.by });
        break;
      }
      case 'leave': {
        const p = P(ev.by); if (!p) break;
        if (st.status === 'lobby') { st.players = st.players.filter(x => x !== p); effects.push({ type: 'leave', pid: p.pid }); break; }
        if (!p.alive) break;
        p.alive = false; effects.push({ type: 'burst', pid: p.pid, reason: 'left' });
        if (st.status === 'playing') {
          if (st.turnPid === p.pid) advance(st, ev, p.pid, effects);
          else if (st.players.filter(x => x.alive).length <= 1) advance(st, ev, p.pid, effects);
        }
        break;
      }
      case 'start': {
        if (st.status !== 'lobby' || st.players.length < 2 || ev.by !== st.players[0].pid) break;
        const seed = makeSeed(String(ev.seed || '').toLowerCase());
        if (!seed) break;
        st.seed = seed; st.secs = Math.max(10, Math.min(90, +ev.secs || 25));
        st.used = new Set([seed.word]); st.words = []; st.winner = null;
        st.players.forEach(p => { p.alive = true; p.height = 0; });
        st.status = 'playing'; st.turnIdx = 0; st.turnPid = st.players[0].pid; st.turnStart = ev.ts;
        effects.push({ type: 'start' }, { type: 'turn', pid: st.turnPid });
        break;
      }
      case 'say': {
        if (st.status !== 'playing' || ev.pid !== st.turnPid || ev.idx !== st.turnIdx) break;
        const r = checkAnswer(st.seed, ev.text, st.used);
        if (!r.ok) break;
        const p = P(ev.pid); p.height++;
        st.used.add(r.text); st.words.push({ pid: p.pid, text: r.text, idx: st.turnIdx });
        effects.push({ type: 'rise', pid: p.pid, text: r.text });
        advance(st, ev, p.pid, effects);
        break;
      }
      case 'fail': {
        if (st.status !== 'playing' || ev.pid !== st.turnPid || ev.idx !== st.turnIdx) break;
        if (ev.reason === 'timeout') {
          if (ev.ts < st.turnStart + st.secs * 1000 - 2500) break;     // too early to be a real timeout
        } else if (ev.reason === 'wrong') {
          const r = checkAnswer(st.seed, ev.text, st.used);
          if (r.ok || r.kind === 'notword' || r.kind === 'empty' || r.kind === 'long') break;
        } else break;
        const p = P(ev.pid); p.alive = false;
        effects.push({ type: 'burst', pid: p.pid, reason: ev.reason, text: ev.reason === 'wrong' ? ev.text : '' });
        advance(st, ev, p.pid, effects);
        break;
      }
      case 'reset': {
        if (st.status === 'lobby' || !P(ev.by)) break;
        if (st.status === 'playing' && ev.by !== st.players[0].pid) break;
        st.status = 'lobby'; st.seed = null; st.turnPid = null; st.words = []; st.used = new Set(); st.winner = null;
        st.players.forEach(p => { p.alive = true; p.height = 0; });
        effects.push({ type: 'reset' });
        break;
      }
    }
    return { state: st, effects };
  }

  return {
    encodePhones, loadDictionary, hasWord, dictSize, tokenize, makeSeed, checkAnswer, rhymeCount, tailInfo,
    initialState, reduce, MAX_PLAYERS,
  };
});
