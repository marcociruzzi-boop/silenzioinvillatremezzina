import { getStore } from '@netlify/blobs';
import { esegui } from '../lib/gioco.mjs';

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ message: 'metodo_non_ammesso' }, { status: 405 });
  const azione = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  let args = {};
  try { args = await req.json(); } catch (e) { args = {}; }
  const store = getStore({ name: 'villa', consistency: 'strong' });
  try {
    return Response.json(await esegui(store, azione, args));
  } catch (e) {
    if (e && e.codice) return Response.json({ message: e.codice }, { status: 400 });
    console.error(e);
    return Response.json({ message: 'errore_server' }, { status: 500 });
  }
};

export const config = { path: '/api/*' };
