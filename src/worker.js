const SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive"
};

function response(body, status = 200, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": contentType, ...extraHeaders }
  });
}

function html(strings, ...values) {
  return strings.reduce((result, part, index) => result + part + (values[index] ?? ""), "");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function tokenIsValid(token, configuredHashes = "") {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return false;
  const candidateHash = await sha256Hex(token);
  return configuredHashes
    .split(",")
    .map((hash) => hash.trim().toLowerCase())
    .filter(Boolean)
    .some((hash) => constantTimeEqual(candidateHash, hash));
}

function contactPage(token) {
  const encodedToken = encodeURIComponent(token);
  return html`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Contactos de Pedro</title>
<style>body{font:16px system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#172033}a{display:flex;align-items:center;gap:.75rem;margin:1rem 0;padding:1rem;border-radius:.6rem;background:#155eef;color:#fff;text-decoration:none}a:hover{background:#004eeb}svg{width:1.5rem;height:1.5rem;flex:none;fill:currentColor}small{display:flex;align-items:center;gap:.4rem;color:#667085}.lock{width:1rem;height:1rem}</style></head>
<body><main><h1>Contactos de Pedro</h1><p>Selecciona el contacto que deseas guardar:</p>
<a rel="nofollow" href="/c/${encodedToken}/download/work"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6h-4V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v3.5l8.2 2.05a7.4 7.4 0 0 0 3.6 0L22 11.5V8a2 2 0 0 0-2-2Zm-6 0h-4V4h4v2Zm8 7.56-7.72 1.93a9.3 9.3 0 0 1-4.56 0L2 13.56V20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6.44Z"/></svg><span>Contacto laboral</span></a>
<a rel="nofollow" href="/c/${encodedToken}/download/personal"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14Z"/></svg><span>Contacto personal</span></a>
<small><svg class="lock" aria-hidden="true" viewBox="0 0 24 24"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V6Z"/></svg><span>Enlace privado. No lo compartas ni lo publiques.</span></small></main></body></html>`;
}

async function rateLimit(request, env) {
  if (!env.CONTACT_RATE_LIMITER?.limit) return true;
  const actor = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const key = (await sha256Hex(actor)).slice(0, 24);
  return (await env.CONTACT_RATE_LIMITER.limit({ key })).success;
}

export async function handleRequest(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return response("Método no permitido", 405, undefined, { Allow: "GET, HEAD" });
  }

  const url = new URL(request.url);
  if (url.pathname === "/robots.txt") {
    return response("User-agent: *\nDisallow: /\n");
  }

  const match = url.pathname.match(/^\/c\/([^/]+)(?:\/download\/(work|personal))?\/?$/);
  if (!match) return response("No encontrado", 404);
  if (!(await rateLimit(request, env))) return response("Demasiadas solicitudes", 429, undefined, { "Retry-After": "60" });

  const [, token, contactType] = match;
  if (!(await tokenIsValid(token, env.NFC_TOKEN_HASHES))) return response("No encontrado", 404);

  if (!contactType) return response(contactPage(token), 200, "text/html; charset=utf-8");

  const destination = contactType === "work" ? env.CONTACT_WORK_URL : env.CONTACT_PERSONAL_URL;
  if (!destination) return response("Contacto no configurado", 503);
  return response(null, 302, undefined, { Location: destination });
}

export default { fetch: handleRequest };
export { constantTimeEqual, sha256Hex, tokenIsValid };
