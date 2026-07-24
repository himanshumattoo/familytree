import { isAuthenticated } from '../_shared/session.js';

export async function onRequestGet({ request, env }) {
  const authed = await isAuthenticated(request, env);
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(env.SHEET_CSV_URL);
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch family data' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const csv = await upstream.text();
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
