// Stateless, signed session tokens (HMAC-SHA256) — no KV lookup needed to verify.
// Token format: "<expiryEpochSeconds>.<base64url hmac>"

const COOKIE_NAME = 'ft_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(secret, message) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function createSessionCookie(env) {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await sign(env.SESSION_SECRET, String(expiry));
  const token = `${expiry}.${sig}`;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

export async function isAuthenticated(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;
  const expiry = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  if (!/^\d+$/.test(expiry)) return false;
  if (Number(expiry) < Math.floor(Date.now() / 1000)) return false;

  const expected = await sign(env.SESSION_SECRET, expiry);
  return timingSafeEqual(expected, sig);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
