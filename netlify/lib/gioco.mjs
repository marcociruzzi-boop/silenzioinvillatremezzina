// Logica di "Silenzio in Villa". Lo "store" è un archivio chiave/valore (Netlify Blobs).
import { randomUUID, createHash } from 'node:crypto';

export const NMAX = 10, NMIN = 4, TTL_MS = 2 * 24 * 3600 * 1000;

// Le carte del tavolo. "forme" = parole che non si possono scrivere (singolare, plurale, ecc.).
export const CARTE = {
  arma: { titolo: 'Arma', carte: [
    { id: 'candelabro', nome: 'Candelabro', forme: ['candelabri'] },
    { id: 'pugnale', nome: 'Pugnale', forme: ['pugnali'] },
    { id: 'veleno', nome: 'Veleno', forme: ['veleni'] },
    { id: 'corda', nome: 'Corda', forme: ['corde'] },
    { id: 'fermacarte', nome: 'Fermacarte', forme: [] },
    { id: 'attizzatoio', nome: 'Attizzatoio', forme: ['attizzatoi'] },
    { id: 'statuetta', nome: 'Statuetta', forme: ['statuette'] },
    { id: 'bottiglia', nome: 'Bottiglia', forme: ['bottiglie'] } ] },
  stanza: { titolo: 'Stanza', carte: [
    { id: 'biblioteca', nome: 'Biblioteca', forme: ['biblioteche'] },
    { id: 'serra', nome: 'Serra', forme: ['serre'] },
    { id: 'cantina', nome: 'Cantina', forme: ['cantine'] },
    { id: 'veranda', nome: 'Veranda', forme: ['verande'] },
    { id: 'scuderia', nome: 'Scuderia', forme: ['scuderie'] },
    { id: 'salotto', nome: 'Salotto', forme: ['salotti'] },
    { id: 'darsena', nome: 'Darsena', forme: ['darsene'] },
    { id: 'soffitta', nome: 'Soffitta', forme: ['soffitte'] } ] },
  movente: { titolo: 'Movente', carte: [
    { id: 'eredita', nome: 'Eredità', forme: [] },
    { id: 'gelosia', nome: 'Gelosia', forme: ['gelosie'] },
    { id: 'ricatto', nome: 'Ricatto', forme: ['ricatti'] },
    { id: 'vendetta', nome: 'Vendetta', forme: ['vendette'] },
    { id: 'debito', nome: 'Debito', forme: ['debiti'] },
    { id: 'tradimento', nome: 'Tradimento', forme: ['tradimenti'] },
    { id: 'rivalita', nome: 'Rivalità', forme: [] },
    { id: 'scandalo', nome: 'Scandalo', forme: ['scandali'] } ] }
};
const CATS = Object.keys(CARTE);
export const TAVOLO = Object.fromEntries(CATS.map(c => [c, { titolo: CARTE[c].titolo, carte: CARTE[c].carte.map(x => ({ id: x.id, nome: x.nome })) }]));

const ALF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const err = m => { const e = new Error(m); e.codice = m; return e; };
const norm = x => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const parole = x => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const mescola = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const pulisciCodice = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const chiave = cod => 'stanza-' + cod;
const pulisciNome = n => String(n == null ? '' : n).trim().slice(0, 20);
const pulisciTesto = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, 70);

// parola -> carta (tutte le carte del tavolo, comprese le forme)
const FORME = new Map();
for (const cat of CATS) for (const c of CARTE[cat].carte) for (const f of [c.id, c.nome, ...c.forme]) FORME.set(norm(f), { cat, id: c.id });

// ===== Classifica generale: un solo archivio, ogni User name appartiene a un solo giocatore =====
const CLS = 'classifica-v1', CLS_MAX = 3000, TOP = 20;
export const clock = { now: () => Date.now() };
export function settimanaId(ts) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const y0 = dt.getUTCFullYear(), w = Math.ceil(((dt - Date.UTC(y0, 0, 1)) / 86400000 + 1) / 7);
  return y0 + '-W' + String(w).padStart(2, '0');
}
const ownerDa = dev => {
  const d = String(dev == null ? '' : dev);
  if (d.length < 16 || d.length > 100) throw err('dispositivo_non_valido');
  return createHash('sha256').update('villa-dev|' + d).digest('hex').slice(0, 32);
};
const nuovoProfilo = (nome, o, sett) => ({ n: nome, o, p: 0, g: 0, v: 0, s: { w: sett, p: 0, g: 0, v: 0 }, u: clock.now() });
function pota(d) {
  const ks = Object.keys(d.profili), ora = clock.now();
  for (const k of ks) { const x = d.profili[k]; if (x.g === 0 && ora - x.u > 7 * 24 * 3600 * 1000) delete d.profili[k]; }
  const rest = Object.keys(d.profili);
  if (rest.length > CLS_MAX) rest.sort((x, y) => d.profili[x].u - d.profili[y].u).slice(0, rest.length - CLS_MAX).forEach(k => { delete d.profili[k]; });
}
const scriviCls = (store, r, d) => r ? store.setJSON(CLS, d, { onlyIfMatch: r.etag }) : store.setJSON(CLS, d, { onlyIfNew: true });
async function riserva(store, nome, o) {
  const k = norm(nome); if (!k) throw err('nome_non_valido');
  for (let i = 0; i < 12; i++) {
    const r = await store.getWithMetadata(CLS, { type: 'json' }), d = r ? r.data : { profili: {} }, pr = d.profili[k];
    if (pr && pr.o !== o) throw err('user_name_occupato');
    if (pr && pr.n === nome) return;
    if (pr) { pr.n = nome; pr.u = clock.now(); } else d.profili[k] = nuovoProfilo(nome, o, settimanaId(clock.now()));
    pota(d);
    const w = await scriviCls(store, r, d); if (w && w.modified) return;
  }
  throw err('occupato');
}
async function registra(store, part) {
  const max = Math.max(...part.map(p => p.punti));
  for (let i = 0; i < 12; i++) {
    const r = await store.getWithMetadata(CLS, { type: 'json' });
    const d = r ? r.data : { profili: {} }, sett = settimanaId(clock.now()), cred = {};
    for (const p of part) {
      const k = norm(p.nome); let pr = d.profili[k];
      if (pr && pr.o !== p.o) { cred[p.id] = 'nome_occupato'; continue; }
      if (!pr) pr = d.profili[k] = nuovoProfilo(p.nome, p.o, sett);
      if (!pr.s || pr.s.w !== sett) pr.s = { w: sett, p: 0, g: 0, v: 0 };
      const vinto = p.punti === max ? 1 : 0;
      pr.n = p.nome; pr.u = clock.now();
      pr.p += p.punti; pr.g += 1; pr.v += vinto;
      pr.s.p += p.punti; pr.s.g += 1; pr.s.v += vinto;
      cred[p.id] = 'ok';
    }
    pota(d);
    const w = await scriviCls(store, r, d);
    if (w && w.modified) return cred;
  }
  return null;
}

// ===== Stanze =====
async function leggi(store, cod) {
  const r = await store.getWithMetadata(chiave(cod), { type: 'json' });
  return r ? { s: r.data, etag: r.etag } : null;
}
// Lettura, modifica e scrittura con controllo di versione: se due persone scrivono insieme, uno riprova.
async function modifica(store, cod, fn, senzaStanza = 'non_autorizzato') {
  for (let i = 0; i < 12; i++) {
    const r = await leggi(store, cod);
    if (!r) throw err(senzaStanza);
    const s = r.s, out = fn(s);
    const w = await store.setJSON(chiave(cod), s, { onlyIfMatch: r.etag, metadata: { creata: s.creata } });
    if (w && w.modified) return out;
  }
  throw err('occupato');
}
const giocatore = (s, token) => { const g = s.giocatori.find(x => x.token === token && token); if (!g) throw err('non_autorizzato'); return g; };
const nomeSicuro = (s, id) => (s.giocatori.find(g => g.id === id) || { nome: '?' }).nome;

function iniziaRound(s) {
  const ids = s.giocatori.map(g => g.id);
  let cand = ids.filter(id => !s.usati_ass.includes(id));
  if (!cand.length) { s.usati_ass = []; cand = ids; }
  const ass = pick(cand), segreti = {};
  for (const c of CATS) {
    let liberi = CARTE[c].carte.map(x => x.id).filter(id => !(s.usate[c] || []).includes(id));
    if (!liberi.length) { s.usate[c] = []; liberi = CARTE[c].carte.map(x => x.id); }
    segreti[c] = pick(liberi); (s.usate[c] = s.usate[c] || []).push(segreti[c]);
  }
  s.usati_ass.push(ass);
  Object.assign(s, { round: s.round + 1, fase: 'interrogatorio', assassino: ass, segreti, ordine: mescola(ids), turno: 0, sub: 'domanda', attuale: null, qa: [], respinte: 0, slip: {}, voti: {}, scoperto: null, guess: null, guess_ok: null, delta: {} });
}
const totaleTurni = s => s.ordine.length * s.giri;
function avanzaTurno(s) { s.turno += 1; s.sub = 'domanda'; s.attuale = null; if (s.turno >= totaleTurni(s)) s.fase = 'voto'; }

// Controlla un testo prima di pubblicarlo. Restituisce null se va bene, altrimenti il motivo del rifiuto.
// Nessuno può scrivere le parole delle carte del tavolo. Solo chi conosce i segreti (gli ospiti) perde un punto
// se la parola è davvero un segreto; per l'assassino il rifiuto è sempre neutro, così non scopre nulla.
function controllaTesto(s, g, testo) {
  const hit = parole(testo).map(w => FORME.get(w)).filter(Boolean);
  if (!hit.length) return null;
  s.respinte = (s.respinte || 0) + 1;
  if (g.id !== s.assassino && hit.some(h => s.segreti[h.cat] === h.id)) { s.slip[g.id] = (s.slip[g.id] || 0) + 1; return 'silenzio_violato'; }
  return 'parola_tavolo';
}

function chiudiVoto(s) {
  const tally = {}; Object.values(s.voti).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
  const max = Math.max(0, ...Object.values(tally)), nmax = Object.values(tally).filter(n => n === max).length;
  s.scoperto = max > 0 && tally[s.assassino] === max && nmax === 1;
  s.fase = 'ricostruzione';
}
function chiudiRound(s) {
  const delta = {}, add = (id, n) => { delta[id] = (delta[id] || 0) + n; };
  if (s.scoperto) s.giocatori.forEach(g => { if (g.id !== s.assassino) add(g.id, 1); }); else add(s.assassino, 2);
  add(s.assassino, s.guess_ok); if (s.guess_ok === 3) add(s.assassino, 1);
  s.delta = {};
  for (const g of s.giocatori) {
    const nuovo = Math.max(0, g.punti + (delta[g.id] || 0) - (s.slip[g.id] || 0));
    s.delta[g.id] = nuovo - g.punti; g.punti = nuovo;
  }
  s.fase = 'risultato';
}

function vista(s, g) {
  const attivo = ['interrogatorio', 'voto', 'ricostruzione', 'risultato'].includes(s.fase), sono = g.id === s.assassino;
  const fineRound = ['risultato', 'fine'].includes(s.fase);
  return {
    codice: s.codice, fase: s.fase, round: s.round, rounds: s.rounds, giri: s.giri, max: s.max || NMAX,
    io: { id: g.id, nome: g.nome, host: g.id === s.host },
    giocatori: s.giocatori.map(x => ({ id: x.id, nome: x.nome, punti: x.punti, host: x.id === s.host, votato: Object.prototype.hasOwnProperty.call(s.voti, x.id) })),
    tavolo: TAVOLO,
    ruolo: attivo ? { assassino: sono, segreti: sono ? null : s.segreti } : null,
    ordine: s.ordine, turno: s.turno, totale: s.ordine.length ? totaleTurni(s) : 0, sub: s.sub,
    attuale: s.attuale, qa: s.qa, respinte: s.respinte || 0,
    mio_voto: s.voti[g.id] || null,
    scoperto: ['ricostruzione', 'risultato', 'fine'].includes(s.fase) ? { si: !!s.scoperto, chi: s.scoperto ? s.assassino : null } : null,
    class_esito: s.fase === 'fine' && s.cred ? (s.cred[g.id] || null) : null,
    risultato: fineRound && s.assassino ? { assassino: s.assassino, segreti: s.segreti, scoperto: s.scoperto, guess: s.guess, guess_ok: s.guess_ok, voti: s.voti, delta: s.delta, slip: s.slip } : null
  };
}

const AZIONI = {
  async v_crea(store, a) {
    const nome = pulisciNome(a.p_nome); if (!nome) throw err('nome_vuoto');
    const rounds = Number(a.p_rounds); if (!Number.isInteger(rounds) || rounds < 3 || rounds > 6) throw err('round_non_validi');
    const giri = a.p_giri === undefined || a.p_giri === '' ? 1 : Number(a.p_giri); if (!Number.isInteger(giri) || giri < 1 || giri > 2) throw err('giri_non_validi');
    const o = ownerDa(a.p_dev);
    const max = a.p_max === undefined || a.p_max === null || a.p_max === '' ? NMAX : Number(a.p_max); if (!Number.isInteger(max) || max < NMIN || max > NMAX) throw err('giocatori_non_validi');
    await riserva(store, nome, o);
    try {
      const { blobs } = await store.list({ prefix: 'stanza-' });
      for (const b of blobs.slice(0, 60)) { const m = await store.getMetadata(b.key); if (m && m.metadata && m.metadata.creata && Date.now() - m.metadata.creata > TTL_MS) await store.delete(b.key); }
    } catch (e) { /* la pulizia non deve bloccare la creazione */ }
    const g = { id: randomUUID(), token: randomUUID(), nome, o, punti: 0, entrato: Date.now() };
    for (let i = 0; i < 30; i++) {
      let cod = ''; for (let k = 0; k < 5; k++) cod += ALF[Math.floor(Math.random() * ALF.length)];
      const s = { codice: cod, creata: Date.now(), host: g.id, rounds, giri, max, round: 0, fase: 'lobby', assassino: null, segreti: null, ordine: [], turno: 0, sub: 'domanda', attuale: null, qa: [], respinte: 0, slip: {}, voti: {}, scoperto: null, guess: null, guess_ok: null, delta: {}, usati_ass: [], usate: {}, giocatori: [g] };
      const w = await store.setJSON(chiave(cod), s, { onlyIfNew: true, metadata: { creata: s.creata } });
      if (w && w.modified) return { codice: cod, token: g.token };
    }
    throw err('occupato');
  },
  async v_entra(store, a) {
    const cod = pulisciCodice(a.p_codice), nome = pulisciNome(a.p_nome); if (!nome) throw err('nome_vuoto');
    if (!cod) throw err('stanza_inesistente');
    const o = ownerDa(a.p_dev);
    await riserva(store, nome, o);
    return modifica(store, cod, s => {
      if (s.fase !== 'lobby') throw err('partita_iniziata');
      if (s.giocatori.length >= (s.max || NMAX)) throw err('stanza_piena');
      if (s.giocatori.some(x => norm(x.nome) === norm(nome))) throw err('nome_occupato');
      const g = { id: randomUUID(), token: randomUUID(), nome, o, punti: 0, entrato: Date.now() };
      s.giocatori.push(g); return { codice: s.codice, token: g.token };
    }, 'stanza_inesistente');
  },
  async v_stato(store, a) {
    const cod = pulisciCodice(a.p_codice), r = await leggi(store, cod);
    if (!r) throw err('non_autorizzato');
    return vista(r.s, giocatore(r.s, a.p_token));
  },
  v_avvia: (store, a) => modifica(store, pulisciCodice(a.p_codice), s => {
    const g = giocatore(s, a.p_token);
    if (s.host !== g.id) throw err('solo_host'); if (s.fase !== 'lobby') throw err('fase_errata');
    if (s.giocatori.length < NMIN) throw err('pochi_giocatori');
    iniziaRound(s); return { ok: true };
  }),
  v_domanda: (store, a) => modifica(store, pulisciCodice(a.p_codice), s => {
    const g = giocatore(s, a.p_token);
    if (s.fase !== 'interrogatorio' || s.sub !== 'domanda') throw err('fase_errata');
    if (s.ordine[s.turno % s.ordine.length] !== g.id) throw err('non_il_tuo_turno');
    if (a.p_a === g.id || !s.giocatori.some(x => x.id === a.p_a)) throw err('destinatario_non_valido');
    const t = pulisciTesto(a.p_testo); if (!t) throw err('testo_vuoto');
    const rif = controllaTesto(s, g, t); if (rif) return { rifiutato: rif };
    s.attuale = { da: g.id, a: a.p_a, d: t }; s.sub = 'risposta'; return { ok: true };
  }),
  v_risposta: (store, a) => modifica(store, pulisciCodice(a.p_codice), s => {
    const g = giocatore(s, a.p_token);
    if (s.fase !== 'interrogatorio' || s.sub !== 'risposta' || !s.attuale) throw err('fase_errata');
    if (s.attuale.a !== g.id) throw err('non_il_tuo_turno');
    const t = pulisciTesto(a.p_testo); if (!t) throw err('testo_vuoto');
    const rif = controllaTesto(s, g, t); if (rif) return { rifiutato: rif };
    s.qa.push({ da: s.attuale.da, a: s.attuale.a, d: s.attuale.d, r: t }); avanzaTurno(s); return { ok: true };
  }),
  v_salta: (store, a) => modifica(store, pulisciCodice(a.p_codice), s => {
    const g = giocatore(s, a.p_token);
    if (s.host !== g.id) throw err('solo_host'); if (s.fase !== 'interrogatorio') throw err('fase_errata');
    if (s.sub === 'risposta' && s.attuale) s.qa.push({ da: s.attuale.da, a: s.attuale.a, d: s.attuale.d, r: '—' });
    avanzaTurno(s); return { ok: true };
  }),
  v_vota: (store, a) => modifica(store, pulisciCodice(a.p_codice), s => {
    const g = giocatore(s, a.p_token);
    if (s.fase !== 'voto') throw err('fase_errata');
    if (a.p_votato === g.id) throw err('non_puoi_votarti');
    if (!s.giocatori.some(x => x.id === a.p_votato)) throw err('voto_non_valido');
    s.voti[g.id] = a.p_votato;
    if (Object.keys(s.voti).length >= s.giocatori.length) chiudiVoto(s);
    return { ok: true };
  }),
  v_chiudi_voto: (store, a) => modifica(store, pulisciCodice(a.p_codice), s => {
    const g = giocatore(s, a.p_token);
    if (s.host !== g.id) throw err('solo_host'); if (s.fase !== 'voto') throw err('fase_errata');
    chiudiVoto(s); return { ok: true };
  }),
  v_ricostruzione: (store, a) => modifica(store, pulisciCodice(a.p_codice), s => {
    const g = giocatore(s, a.p_token);
    if (s.fase !== 'ricostruzione') throw err('fase_errata');
    if (g.id !== s.assassino) throw err('solo_assassino');
    const guess = { arma: a.p_arma, stanza: a.p_stanza, movente: a.p_movente };
    for (const c of CATS) if (!CARTE[c].carte.some(x => x.id === guess[c])) throw err('carta_non_valida');
    s.guess = guess; s.guess_ok = CATS.filter(c => guess[c] === s.segreti[c]).length;
    chiudiRound(s); return { ok: true };
  }),
  async v_prossimo(store, a) {
    const cod = pulisciCodice(a.p_codice);
    const out = await modifica(store, cod, s => {
      const g = giocatore(s, a.p_token);
      if (s.host !== g.id) throw err('solo_host'); if (s.fase !== 'risultato') throw err('fase_errata');
      let fine = null;
      if (s.round >= s.rounds) { s.fase = 'fine'; fine = s.giocatori.map(x => ({ id: x.id, nome: x.nome, o: x.o, punti: x.punti })); }
      else iniziaRound(s);
      return { ok: true, fine };
    });
    // La transizione a 'fine' avviene una sola volta (controllo di versione): i punti vengono registrati una sola volta.
    if (out.fine) {
      try { const cred = await registra(store, out.fine); if (cred) await modifica(store, cod, s => { s.cred = cred; return 0; }); }
      catch (e) { console.error('classifica', e); }
    }
    return { ok: true };
  },
  async v_classifica(store) {
    const r = await store.get(CLS, { type: 'json' }), righe = Object.values((r && r.profili) || {}), sett = settimanaId(clock.now());
    const ord = (x, y) => y.p - x.p || y.v - x.v || x.g - y.g || x.n.localeCompare(y.n, 'it');
    const top = a => a.sort(ord).slice(0, TOP);
    return {
      settimana_id: sett, giocatori: righe.length,
      sempre: top(righe.filter(x => x.g > 0).map(x => ({ n: x.n, p: x.p, g: x.g, v: x.v }))),
      settimana: top(righe.filter(x => x.s && x.s.w === sett && x.s.g > 0).map(x => ({ n: x.n, p: x.s.p, g: x.s.g, v: x.s.v })))
    };
  }
};

export async function esegui(store, azione, args) {
  const f = Object.prototype.hasOwnProperty.call(AZIONI, azione) ? AZIONI[azione] : null;
  if (!f) throw err('azione_sconosciuta');
  return f(store, args && typeof args === 'object' ? args : {});
}
