/* ===== Silenzio in Villa: client ===== */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const dev = () => { let d = ls.get('villa:dev'); if (!d || String(d).length < 16) { try { d = crypto.randomUUID() + crypto.randomUUID(); } catch (e) { d = Array.from({length:4}, () => Math.random().toString(36).slice(2)).join('-') + Date.now(); } ls.set('villa:dev', d); } return d; };

const ERRORI = {
  nome_vuoto:'Scrivi il tuo User name.', nome_occupato:'Questo User name è già usato in questa stanza. Scegline un altro.', user_name_occupato:'Questo User name è già registrato da un altro giocatore. Scegline uno diverso.', nome_non_valido:'Lo User name deve contenere almeno una lettera o un numero.', dispositivo_non_valido:'Impossibile identificare il dispositivo: ricarica la pagina.', stanza_inesistente:'Stanza non trovata. Controlla il codice.',
  partita_iniziata:'La partita è già iniziata, non si può più entrare.', stanza_piena:'La stanza è al completo.', giocatori_non_validi:'Scegli da 4 a 10 giocatori.', round_non_validi:'Scegli da 3 a 6 round.', giri_non_validi:'Scegli 1 o 2 giri.',
  non_autorizzato:'Sessione non valida. Rientra nella stanza.', solo_host:'Solo chi ha creato la stanza può farlo.', fase_errata:'Questa azione non è più possibile: la schermata si aggiorna.',
  pochi_giocatori:'Servono almeno 4 giocatori.', non_il_tuo_turno:'Non è il tuo turno.', testo_vuoto:'Scrivi qualcosa.', destinatario_non_valido:'Scegli a chi rivolgere la domanda.',
  occupato:'Il server è occupato, riprova.', errore_server:'Errore del server, riprova tra poco.', azione_sconosciuta:'Azione non valida.',
  non_puoi_votarti:'Non puoi votare te stesso.', voto_non_valido:'Voto non valido.', solo_assassino:'Solo l’assassino può ricostruire il delitto.', carta_non_valida:'Scegli una carta per ogni categoria.'
};
const testoErrore = e => { const m = String(e && e.message || e); return ERRORI[m] || ('Errore di connessione: ' + m); };
async function rpc(nome, args) {
  const r = await fetch('/api/' + nome, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(args)});
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  if (!r.ok) throw new Error((j && j.message) || ('http_' + r.status));
  return j;
}

/* ===== stato locale ===== */
let CL = null, CLT = 'sett', vista = 'home', S = null, SES = null, msg = '', occupato = false, mostra = false, ultimoJson = '', foco = null;
let bozza = '', dest = '', rifiuto = null, scelta = {}, barrate = {};
const linkStanza = cod => location.origin + location.pathname + '?s=' + cod;
const nomeDi = id => { const g = S && S.giocatori.find(x => x.id === id); return g ? g.nome : '?'; };
const nomeCarta = (cat, id) => { const c = S.tavolo[cat].carte.find(x => x.id === id); return c ? c.nome : id; };
const chiaveBar = () => 'villa:bar:' + S.codice + ':' + S.round;

function salvaSes(cod, token, nome) { ls.set('villa:' + cod, {token, nome}); ls.set('villa:ultimo', {cod}); SES = {cod, token, nome}; }
function esciStanza() { if (SES) ls.del('villa:' + SES.cod); ls.del('villa:ultimo'); SES = null; S = null; ultimoJson = ''; vista = 'home'; msg = ''; render(); caricaClassifica(); }

async function aggiorna(forza) {
  if (!SES || occupato) return;
  occupato = true;
  try {
    const st = await rpc('v_stato', {p_codice:SES.cod, p_token:SES.token});
    const j = JSON.stringify(st);
    if (forza || j !== ultimoJson) {
      ultimoJson = j;
      if (!S || S.round !== st.round) { mostra = false; bozza = ''; dest = ''; rifiuto = null; scelta = {}; barrate = ls.get('villa:bar:' + st.codice + ':' + st.round) || {}; }
      if (S && (S.turno !== st.turno || S.sub !== st.sub)) { bozza = ''; rifiuto = null; }
      S = st; vista = 'stanza'; render();
    }
  } catch (e) {
    if (String(e.message) === 'non_autorizzato') { esciStanza(); msg = 'La stanza non esiste più o la sessione è scaduta.'; render(); }
  }
  occupato = false;
}
async function azione(nome, args, dopo) {
  msg = '';
  try { const r = await rpc(nome, Object.assign({p_codice:SES.cod, p_token:SES.token}, args || {})); if (dopo) dopo(r); }
  catch (e) { msg = testoErrore(e); }
  ultimoJson = ''; occupato = false; await aggiorna(true);
}

/* ===== classifica generale ===== */
function clsHtml() {
  let corpo;
  if (CL === null) corpo = '<p class="sotto">Caricamento…</p>';
  else if (CL === 'errore') corpo = '<p class="sotto">Classifica non disponibile al momento.</p>';
  else {
    const r = CLT === 'sett' ? CL.settimana : CL.sempre;
    corpo = r.length
      ? '<div class="scorri"><table><thead><tr><th>#</th><th>Giocatore</th><th class="n">Punti</th><th class="n">Partite</th><th class="n">Vitt.</th></tr></thead><tbody>' +
        r.map((x, k) => '<tr' + (k === 0 ? ' class="top"' : '') + '><td>' + (k + 1) + '</td><td>' + esc(x.n) + '</td><td class="n">' + x.p + '</td><td class="n">' + x.g + '</td><td class="n">' + x.v + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="sotto">Ancora nessuna partita conclusa' + (CLT === 'sett' ? ' questa settimana' : '') + '.</p>';
  }
  return '<div class="eyebrow">Classifica generale · top 20</div><div class="riga"><button class="btn ghost sm tab" data-act="cls-tab" data-t="sett" aria-pressed="' + (CLT === 'sett') + '">Settimana</button><button class="btn ghost sm tab" data-act="cls-tab" data-t="sempre" aria-pressed="' + (CLT === 'sempre') + '">Da sempre</button><button class="link" data-act="cls-agg">Aggiorna</button></div>' + corpo +
    '<p class="sotto">Contano le partite concluse. Vittoria = più punti a fine partita (pari merito: vincono tutti). Ogni User name è unico e legato a questo browser.</p>';
}
function mostraCls() { const b = $('clsBox'); if (b) b.innerHTML = clsHtml(); }
async function caricaClassifica() {
  try { CL = await rpc('v_classifica', {}); } catch (e) { if (!CL || CL === 'errore') CL = 'errore'; }
  mostraCls();
}

/* ===== viste ===== */
const opz = (arr, sel) => arr.map(n => '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + '</option>').join('');
function home() {
  const url = new URLSearchParams(location.search), cod = (url.get('s') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5), nome = (ls.get('villa:nome') || '');
  return '<div class="eyebrow">Giallo di gruppo · 4–10 giocatori · online</div><h1>Silenzio in Villa</h1>' +
    '<p>Uno di voi è l’assassino e non sa come ha agito: arma, stanza e movente li conoscono solo gli altri. Ma chi li nomina perde un punto.</p>' +
    (msg ? '<p class="msg" role="status">' + esc(msg) + '</p>' : '') +
    '<section class="panel"><h2>' + (cod ? 'Entra nella stanza ' + esc(cod) : 'Entra in una stanza') + '</h2><div class="form">' +
      (cod ? '' : '<label for="cod">Codice stanza</label><input id="cod" class="campo" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="es. K7MQ2">') +
      '<label for="nomeE">User name</label><input id="nomeE" class="campo" maxlength="20" autocomplete="nickname" value="' + esc(nome) + '"><p class="sotto">Il tuo User name è unico: una volta usato, nessun altro potrà averlo.</p></div>' +
      '<button class="btn big" data-act="entra" data-cod="' + esc(cod) + '">Entra</button></section>' +
    (cod ? '' : '<section class="panel"><h2>Crea una stanza</h2><div class="form"><label for="nomeC">User name</label><input id="nomeC" class="campo" maxlength="20" autocomplete="nickname" value="' + esc(nome) + '">' +
      '<label for="maxg">Giocatori (massimo)</label><select id="maxg" class="campo">' + opz([4,5,6,7,8,9,10], 6) + '</select>' +
      '<label for="rounds">Round (un assassino diverso a ogni round)</label><select id="rounds" class="campo">' + opz([3,4,5,6], 4) + '</select>' +
      '<label for="giri">Giri di interrogatorio</label><select id="giri" class="campo"><option value="1" selected>1 giro (partita più rapida)</option><option value="2">2 giri (più indizi)</option></select></div>' +
      '<button class="btn big ghost" data-act="crea">Crea la stanza</button></section>') +
    (cod ? '' : '<section class="panel" id="clsBox">' + clsHtml() + '</section>') +
    '<details><summary>Come si gioca</summary><ol class="regole">' +
    '<li>Ogni round c’è un assassino. Gli innocenti ricevono il colpo segreto: <b>arma, stanza e movente</b>. L’assassino no.</li>' +
    '<li>A turno uno interroga un altro giocatore, scrivendo domanda e risposta qui nell’app.</li>' +
    '<li>Le 24 parole del tavolo non si possono scrivere. Se un innocente scrive una delle tre parole segrete, il messaggio viene bloccato e perde 1 punto.</li>' +
    '<li>Poi si vota. Assassino scoperto: +1 a ogni innocente. Sfuggito (o pareggio): +2 all’assassino.</li>' +
    '<li>L’assassino, a fine round, prova a ricostruire il colpo: +1 per ogni carta giusta (+1 bonus se le azzecca tutte e tre).</li></ol></details>';
}

function elencoGiocatori(conPunti) {
  return '<ul class="gioc">' + S.giocatori.map(g => '<li' + (g.id === S.io.id ? ' class="io"' : '') + '><span>' + esc(g.nome) + (g.host ? ' <small>host</small>' : '') + (g.id === S.io.id ? ' <small>tu</small>' : '') + '</span>' + (conPunti ? '<b class="n">' + g.punti + '</b>' : '') + '</li>').join('') + '</ul>';
}
function lobby() {
  const l = linkStanza(S.codice), t = '🔪 Silenzio in Villa! Entra nella stanza ' + S.codice + ':\n' + l;
  const ok = S.giocatori.length >= 4;
  return '<div class="head"><button class="link" data-act="esci">← Esci</button><span class="chip">Stanza <b>' + esc(S.codice) + '</b></span></div>' +
    '<section class="panel"><div class="eyebrow">Invita i giocatori</div><div><code class="codice">' + esc(S.codice) + '</code></div><p class="sotto">Manda il link nel gruppo: chi lo apre scrive solo il proprio User name.</p>' +
    '<div class="form"><label for="lnk">Link</label><input id="lnk" class="campo" readonly value="' + esc(l) + '"></div>' +
    '<div class="riga"><button class="btn" data-act="copia" data-t="' + esc(l) + '">Copia il link</button><a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(t) + '">Apri WhatsApp</a></div><p class="sotto" id="fb" role="status"></p></section>' +
    '<section class="panel"><div class="eyebrow">Giocatori · ' + S.giocatori.length + '/' + S.max + ' · ' + S.rounds + ' round · ' + S.giri + (S.giri === 1 ? ' giro' : ' giri') + '</div>' + elencoGiocatori(false) +
    (S.io.host ? '<button class="btn big" data-act="avvia"' + (ok ? '' : ' disabled') + '>Avvia la partita</button>' + (ok ? '' : '<p class="sotto">Servono almeno 4 giocatori.</p>') : '<p class="sotto">In attesa che l’host avvii la partita…</p>') + '</section>';
}
function schedaRuolo() {
  const r = S.ruolo; if (!r) return '';
  if (!mostra) return '<section class="panel"><button class="btn big" data-act="mostra">Tocca per vedere il tuo ruolo</button></section>';
  if (r.assassino) return '<section class="panel"><div class="ruolo a"><div class="eyebrow">Il tuo ruolo</div><div class="grande">Assassino</div><p>Non sai né l’arma, né la stanza, né il movente. Ascolta le risposte, deduci dalle reticenze e non farti scoprire.</p></div><button class="btn ghost" data-act="nascondi">Nascondi</button></section>';
  const sg = r.segreti;
  return '<section class="panel"><div class="ruolo"><div class="eyebrow">Il tuo ruolo · innocente · tienilo per te</div><div class="segreti">' +
    ['arma', 'stanza', 'movente'].map(c => '<div><span>' + esc(S.tavolo[c].titolo) + '</span><b>' + esc(nomeCarta(c, sg[c])) + '</b></div>').join('') +
    '</div><p class="sotto">Non scriverle mai: se lo fai, il messaggio è bloccato e perdi 1 punto. Fai capire senza nominare.</p></div><button class="btn ghost" data-act="nascondi">Nascondi</button></section>';
}
function tavolo() {
  const sono = S.ruolo && S.ruolo.assassino;
  return '<details' + (sono ? ' open' : '') + '><summary>Il tavolo · 24 parole proibite</summary><div class="form" style="margin-top:10px">' +
    ['arma', 'stanza', 'movente'].map(c => '<div class="cat"><div class="eyebrow">' + esc(S.tavolo[c].titolo) + '</div><div class="carte">' +
      S.tavolo[c].carte.map(x => sono
        ? '<button class="carta' + (barrate[c + ':' + x.id] ? ' x' : '') + '" data-act="barra" data-k="' + c + ':' + x.id + '" aria-pressed="' + !!barrate[c + ':' + x.id] + '">' + esc(x.nome) + '</button>'
        : '<span class="carta">' + esc(x.nome) + '</span>').join('') + '</div></div>').join('') +
    (sono ? '<p class="sotto">Taccuino: tocca una carta per barrarla quando pensi non sia quella (resta solo sul tuo telefono).</p>' : '<p class="sotto">Queste parole non si possono scrivere in nessun messaggio.</p>') + '</div></details>';
}
function logQA() {
  if (!S.qa.length) return '';
  return '<ul class="qa">' + S.qa.map(q => '<li><span class="d">' + esc(nomeDi(q.da)) + ' → ' + esc(nomeDi(q.a)) + ': ' + esc(q.d) + '</span><span class="r">' + esc(q.r) + '</span></li>').join('') + '</ul>';
}
function avvisoRifiuto() {
  if (!rifiuto) return '';
  return rifiuto === 'silenzio_violato'
    ? '<div class="rifiuto p" role="alert"><b>Silenzio violato: −1 punto.</b> Hai scritto una delle tre parole segrete. Il messaggio non è stato inviato: riscrivilo senza nominarle.</div>'
    : '<div class="rifiuto" role="alert"><b>Parola del tavolo.</b> Le 24 parole del tavolo sono vietate: riformula il messaggio.</div>';
}
function faseInterrogatorio() {
  const tot = S.totale, id = S.ordine[S.turno % S.ordine.length], mio = id === S.io.id, rispondo = S.sub === 'risposta' && S.attuale && S.attuale.a === S.io.id;
  const ord = '<div class="ordine">' + S.ordine.map((x, k) => '<span class="' + (k === S.turno % S.ordine.length ? 'ora' : (S.turno >= S.ordine.length || k < S.turno) && S.giri === 1 ? 'fatto' : '') + (x === S.io.id ? ' io' : '') + '">' + esc(nomeDi(x)) + '</span>').join('') + '</div>';
  let azioneHtml;
  if (S.sub === 'domanda' && mio) {
    azioneHtml = '<form class="form" id="formDomanda" novalidate><label for="dest">Chi interroghi?</label><div class="scelta">' + S.giocatori.filter(g => g.id !== S.io.id).map(g => '<button type="button" class="btn ' + (dest === g.id ? '' : 'ghost') + '" data-act="dest" data-id="' + g.id + '" aria-pressed="' + (dest === g.id) + '">' + esc(g.nome) + '</button>').join('') + '</div>' +
      '<label for="testo">La tua domanda</label><input id="testo" class="campo" maxlength="70" autocomplete="off" value="' + esc(bozza) + '" placeholder="es. Dove eri alle nove di sera?">' + avvisoRifiuto() + '<button class="btn big" type="submit">Fai la domanda</button></form>';
  } else if (S.sub === 'risposta' && rispondo) {
    azioneHtml = '<p><b>' + esc(nomeDi(S.attuale.da)) + '</b> ti chiede: «' + esc(S.attuale.d) + '»</p><form class="form" id="formRisposta" novalidate><label for="testo">La tua risposta</label><input id="testo" class="campo" maxlength="70" autocomplete="off" value="' + esc(bozza) + '">' + avvisoRifiuto() + '<button class="btn big" type="submit">Rispondi</button></form>';
  } else if (S.sub === 'risposta') {
    azioneHtml = '<p class="sotto">' + esc(nomeDi(S.attuale.da)) + ' ha chiesto a ' + esc(nomeDi(S.attuale.a)) + ': «' + esc(S.attuale.d) + '». Attendi la risposta…</p>';
  } else azioneHtml = '<p class="sotto">Tocca a ' + esc(nomeDi(id)) + ' fare una domanda…</p>';
  return '<section class="panel"><div class="eyebrow">Interrogatorio · domanda ' + Math.min(S.turno + 1, tot) + ' di ' + tot + '</div>' + ord + logQA() + azioneHtml +
    '<p class="sotto">Messaggi respinti finora: <b class="n">' + S.respinte + '</b></p>' +
    (S.io.host ? '<button class="link" data-act="salta">Salta questo turno (giocatore assente?)</button>' : '') + '</section>';
}
function faseVoto() {
  const n = S.giocatori.filter(g => g.votato).length;
  return '<section class="panel"><div class="eyebrow">Voto segreto · ' + n + '/' + S.giocatori.length + ' hanno votato</div>' + logQA() +
    '<p>Chi è l’assassino?</p><div class="scelta">' + S.giocatori.filter(g => g.id !== S.io.id).map(g => '<button class="btn ' + (S.mio_voto === g.id ? '' : 'ghost') + '" data-act="vota" data-id="' + g.id + '">' + esc(g.nome) + (S.mio_voto === g.id ? ' ✓' : '') + '</button>').join('') + '</div>' +
    '<p class="sotto">' + (S.mio_voto ? 'Puoi cambiare voto finché tutti non hanno votato.' : 'Tocca un nome per votare.') + '</p>' +
    (S.io.host ? '<button class="link" data-act="chiudi">Chiudi il voto adesso</button>' : '') + '</section>';
}
function faseRicostruzione() {
  const sono = S.ruolo && S.ruolo.assassino, sc = S.scoperto;
  const testa = '<div class="eyebrow">' + (sc.si ? 'Assassino scoperto' : 'Assassino sfuggito') + '</div><h3>' + (sc.si ? esc(nomeDi(sc.chi)) + ' era l’assassino' : 'Il gruppo non ha trovato il colpevole') + '</h3>';
  if (!sono) return '<section class="panel">' + testa + '<p class="sotto">L’assassino sta tentando di ricostruire il colpo: arma, stanza e movente…</p></section>';
  const pronto = ['arma', 'stanza', 'movente'].every(c => scelta[c]);
  return '<section class="panel">' + testa + '<p>Ultima mossa: ricostruisci il colpo. Ogni carta giusta vale +1 (+1 bonus se le azzecchi tutte).</p>' +
    ['arma', 'stanza', 'movente'].map(c => '<div class="cat"><div class="eyebrow">' + esc(S.tavolo[c].titolo) + '</div><div class="carte">' + S.tavolo[c].carte.map(x => '<button class="carta' + (scelta[c] === x.id ? ' sel' : '') + (barrate[c + ':' + x.id] && scelta[c] !== x.id ? ' x' : '') + '" data-act="scegli" data-c="' + c + '" data-id="' + x.id + '" aria-pressed="' + (scelta[c] === x.id) + '">' + esc(x.nome) + '</button>').join('') + '</div></div>').join('') +
    '<button class="btn big" data-act="ricostruisci"' + (pronto ? '' : ' disabled') + '>Confermo la ricostruzione</button></section>';
}
function faseRisultato() {
  const R = S.risultato, ultimo = S.round >= S.rounds, voti = {};
  Object.values(R.voti || {}).forEach(t => { voti[t] = (voti[t] || 0) + 1; });
  const sg = ['arma', 'stanza', 'movente'].map(c => esc(S.tavolo[c].titolo) + ': <b>' + esc(nomeCarta(c, R.segreti[c])) + '</b>' + (R.guess ? (R.guess[c] === R.segreti[c] ? ' ✓' : ' ✗ (' + esc(nomeCarta(c, R.guess[c])) + ')') : '')).join('<br>');
  return '<section class="panel"><div class="eyebrow">Risultato del round ' + S.round + '</div><div class="rivelato"><b>L’assassino era ' + esc(nomeDi(R.assassino)) + '.</b><span>' + (R.scoperto ? 'Il gruppo lo ha scoperto.' : 'Il gruppo non lo ha scoperto: +2 all’assassino.') + '</span><span>' + sg + '</span><span>Carte giuste ricostruite: <b>' + R.guess_ok + '/3</b></span></div>' +
    '<div class="scorri"><table><thead><tr><th>Giocatore</th><th class="n">Voti</th><th class="n">Punti</th></tr></thead><tbody>' +
    S.giocatori.map(g => '<tr><td>' + esc(g.nome) + (g.id === R.assassino ? ' <small>assassino</small>' : '') + (R.slip && R.slip[g.id] ? ' <small>silenzio violato ×' + R.slip[g.id] + '</small>' : '') + '</td><td class="n">' + (voti[g.id] || 0) + '</td><td class="n">' + g.punti + (R.delta && R.delta[g.id] ? ' <small>' + (R.delta[g.id] > 0 ? '+' : '') + R.delta[g.id] + '</small>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
    (S.io.host ? '<button class="btn big" data-act="prossimo">' + (ultimo ? 'Vedi la classifica finale' : 'Round successivo') + '</button>' : '<p class="sotto">In attesa dell’host…</p>') + '</section>';
}
const ESITI = { ok:'I tuoi punti sono stati aggiunti alla classifica generale.', nome_occupato:'Il tuo User name risulta registrato da un altro giocatore: i tuoi punti non sono stati aggiunti alla classifica generale.' };
function fine() {
  const ord = S.giocatori.slice().sort((a, b) => b.punti - a.punti);
  const testo = '🔪 Silenzio in Villa · classifica\n' + ord.map((g, k) => (k + 1) + '. ' + g.nome + ' ' + g.punti).join('\n');
  return '<section class="panel"><div class="eyebrow">Partita finita</div><h2>Classifica</h2><div class="scorri"><table><thead><tr><th>#</th><th>Giocatore</th><th class="n">Punti</th></tr></thead><tbody>' +
    ord.map((g, k) => '<tr' + (k === 0 ? ' class="top"' : '') + '><td>' + (k + 1) + '</td><td>' + esc(g.nome) + '</td><td class="n">' + g.punti + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="riga"><button class="btn" data-act="copia" data-t="' + esc(testo) + '">Copia la classifica</button><a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(testo) + '">Apri WhatsApp</a></div><p class="sotto" id="fb" role="status"></p>' +
    (S.class_esito ? '<p class="sotto">' + esc(ESITI[S.class_esito] || '') + '</p>' : '') +
    '<button class="btn ghost" data-act="esci">Torna all’inizio</button></section>';
}
function stanza() {
  if (S.fase === 'lobby') return lobby();
  const chips = '<div class="head"><button class="link" data-act="esci">← Esci</button><span class="chip">Stanza <b>' + esc(S.codice) + '</b></span><span class="chip">Round <b>' + Math.min(S.round, S.rounds) + '/' + S.rounds + '</b></span><span class="chip"><b>' + esc(S.io.nome) + '</b></span></div>';
  if (S.fase === 'fine') return chips + fine();
  const punti = '<details><summary>Punteggi</summary>' + elencoGiocatori(true) + '</details>';
  const corpo = S.fase === 'interrogatorio' ? faseInterrogatorio() : S.fase === 'voto' ? faseVoto() : S.fase === 'ricostruzione' ? faseRicostruzione() : faseRisultato();
  return chips + schedaRuolo() + corpo + (['interrogatorio', 'voto', 'ricostruzione'].includes(S.fase) ? tavolo() : '') + punti;
}
function render() {
  const a = document.activeElement; foco = a && a.id ? {id:a.id, p:a.selectionStart} : null;
  $('app').innerHTML = (vista === 'stanza' && S ? stanza() : home()) + (msg && vista === 'stanza' ? '<p class="msg" role="status">' + esc(msg) + '</p>' : '');
  if (foco) { const el = $(foco.id); if (el) { el.focus({preventScroll:true}); try { if (foco.p != null) el.setSelectionRange(foco.p, foco.p); } catch (e) {} } }
}

/* ===== eventi ===== */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'crea') {
    const nome = $('nomeC').value.trim(); ls.set('villa:nome', nome); msg = '';
    try { const r = await rpc('v_crea', {p_nome:nome, p_dev:dev(), p_rounds:+$('rounds').value, p_giri:+$('giri').value, p_max:+$('maxg').value}); salvaSes(r.codice, r.token, nome); ultimoJson = ''; await aggiorna(true); }
    catch (x) { msg = testoErrore(x); render(); }
  }
  else if (a === 'entra') {
    const cod = (b.dataset.cod || ($('cod') ? $('cod').value : '')).toUpperCase().replace(/[^A-Z0-9]/g, ''), nome = $('nomeE').value.trim(); ls.set('villa:nome', nome); msg = '';
    try { const r = await rpc('v_entra', {p_codice:cod, p_nome:nome, p_dev:dev()}); salvaSes(r.codice, r.token, nome); history.replaceState(null, '', location.pathname); ultimoJson = ''; await aggiorna(true); }
    catch (x) { msg = testoErrore(x); render(); }
  }
  else if (a === 'esci') esciStanza();
  else if (a === 'cls-tab') { CLT = b.dataset.t; mostraCls(); }
  else if (a === 'cls-agg') { CL = null; mostraCls(); caricaClassifica(); }
  else if (a === 'mostra') { mostra = true; render(); }
  else if (a === 'nascondi') { mostra = false; render(); }
  else if (a === 'avvia') azione('v_avvia');
  else if (a === 'salta') azione('v_salta');
  else if (a === 'vota') azione('v_vota', {p_votato:b.dataset.id});
  else if (a === 'chiudi') azione('v_chiudi_voto');
  else if (a === 'prossimo') azione('v_prossimo');
  else if (a === 'dest') { dest = b.dataset.id; render(); }
  else if (a === 'barra') { const k = b.dataset.k; barrate[k] = !barrate[k]; ls.set(chiaveBar(), barrate); render(); }
  else if (a === 'scegli') { scelta[b.dataset.c] = b.dataset.id; render(); }
  else if (a === 'ricostruisci') azione('v_ricostruzione', {p_arma:scelta.arma, p_stanza:scelta.stanza, p_movente:scelta.movente});
  else if (a === 'copia') { const fb = $('fb'); try { navigator.clipboard.writeText(b.dataset.t).then(() => { if (fb) fb.textContent = 'Copiato.'; }, () => { if (fb) fb.textContent = 'Copia non riuscita: selezionalo a mano.'; }); } catch (x) { if (fb) fb.textContent = 'Copia non riuscita: selezionalo a mano.'; } }
});
document.addEventListener('input', e => { if (e.target.id === 'testo') bozza = e.target.value; });
async function invia(nome, args) {
  msg = ''; rifiuto = null;
  try {
    const r = await rpc(nome, Object.assign({p_codice:SES.cod, p_token:SES.token}, args));
    if (r && r.rifiutato) rifiuto = r.rifiutato; else bozza = '';
  } catch (e) { msg = testoErrore(e); }
  ultimoJson = ''; occupato = false; await aggiorna(true);
}
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'formDomanda') { if (!dest) { msg = ERRORI.destinatario_non_valido; render(); return; } invia('v_domanda', {p_a:dest, p_testo:$('testo').value}); }
  if (e.target.id === 'formRisposta') invia('v_risposta', {p_testo:$('testo').value});
});
setInterval(() => { if (!document.hidden) aggiorna(false); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) aggiorna(false); });

/* ===== avvio ===== */
(function avvio() {
  const url = new URLSearchParams(location.search), s = (url.get('s') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ult = ls.get('villa:ultimo'), cod = s || (ult && ult.cod), ses = cod ? ls.get('villa:' + cod) : null;
  if (ses && ses.token) { SES = {cod, token:ses.token, nome:ses.nome}; aggiorna(true); }
  render();
  if (!SES) caricaClassifica();
})();
