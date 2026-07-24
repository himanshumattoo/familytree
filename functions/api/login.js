import { createSessionCookie } from '../_shared/session.js';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 10 * 60;

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `login_attempts:${ip}`;

  const attemptsRaw = await env.RATE_LIMIT_KV.get(rateLimitKey);
  const attempts = attemptsRaw ? Number(attemptsRaw) : 0;

  if (attempts >= MAX_ATTEMPTS) {
    return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const hash = await sha256Hex(password);
  const ok = timingSafeEqual(hash, env.PASSWORD_HASH);

  if (!ok) {
    await env.RATE_LIMIT_KV.put(rateLimitKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
    return new Response(JSON.stringify({ error: 'Incorrect password.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await env.RATE_LIMIT_KV.delete(rateLimitKey);
  const cookie = await createSessionCookie(env);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}
