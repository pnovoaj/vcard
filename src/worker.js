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
<style>body{font:16px system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#172033}a{display:block;margin:1rem 0;padding:1rem;border-radius:.6rem;background:#155eef;color:#fff;text-decoration:none}small{color:#667085}</style></head>
<body><main><h1>Contactos de Pedro</h1><p>Selecciona el contacto que deseas guardar:</p>
<a rel="nofollow" href="/c/${encodedToken}/download/work">Contacto laboral</a>
<a rel="nofollow" href="/c/${encodedToken}/download/personal">Contacto personal</a>
<small>Enlace privado. No lo compartas ni lo publiques.</small></main></body></html>`;
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
