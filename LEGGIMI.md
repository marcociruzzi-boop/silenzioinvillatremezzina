# Silenzio in Villa — gioco online con link WhatsApp

Giallo di gruppo (4–10 giocatori). Ogni round c'è **un assassino** che non conosce arma, stanza e movente: li conoscono solo gli innocenti, ma se li scrivono il messaggio viene bloccato e perdono **1 punto**.

## Regole in breve
- Round 3–6, 1 o 2 giri di interrogatorio (domanda → risposta, tutto scritto nell'app).
- Le 24 parole del tavolo (8 armi, 8 stanze, 8 moventi) non si possono scrivere. Per l'assassino il rifiuto è neutro (non scopre nulla).
- Voto segreto: scoperto = +1 a ogni innocente; sfuggito o pareggio = +2 all'assassino.
- Ricostruzione dell'assassino: +1 per carta giusta, +1 bonus se tutte e 3.
- Punti minimi: 0. Classifica generale (settimana + da sempre), User name unico.

## Pubblicazione (progetto separato da Il Traditore)
1. Nuovo repository GitHub (es. `silenzio-in-villa`): carica **tutto il contenuto** di questa cartella (anche `netlify/` e `public/`).
2. Netlify → Add new project → Import from GitHub → scegli il repository. Publish directory `public`, functions `netlify/functions` (già in `netlify.toml`).
3. Apri il sito Netlify, crea una stanza e condividi il link su WhatsApp.

## Limiti noti
- Un solo assassino per round (secondo assassino non ancora previsto).
- Il blocco riconosce solo le parole elencate (singolare/plurale): sinonimi e derivati passano.
- Le stanze si cancellano dopo 2 giorni. Aggiornamento ogni 3 secondi.
