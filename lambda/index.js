const crypto = require('crypto');

const COOKIE_NAME = 'ft_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function hmacHex(secret, message) {
  return crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSessionCookie() {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = hmacHex(process.env.SESSION_SECRET, String(expiry));
  return `${COOKIE_NAME}=${expiry}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function isAuthenticated(cookies) {
  const raw = (cookies || []).find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return false;
  const token = raw.slice(COOKIE_NAME.length + 1);
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry)) return false;
  if (Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqualStr(hmacHex(process.env.SESSION_SECRET, expiry), sig);
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'POST' && path === '/api/login') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid request' });
    }

    const password = typeof body.password === 'string' ? body.password : '';
    const ok = timingSafeEqualStr(sha256Hex(password), process.env.PASSWORD_HASH);
    if (!ok) return json(401, { error: 'Incorrect password.' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      cookies: [createSessionCookie()],
      body: JSON.stringify({ ok: true }),
    };
  }

  if (method === 'GET' && path === '/api/family-data') {
    if (!isAuthenticated(event.cookies)) {
      return json(401, { error: 'Not authenticated' });
    }

    const upstream = await fetch(process.env.SHEET_CSV_URL);
    if (!upstream.ok) return json(502, { error: 'Failed to fetch family data' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'private, no-store' },
      body: await upstream.text(),
    };
  }

  return json(404, { error: 'Not found' });
};
