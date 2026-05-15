/**
 * Cloudflare Pages Function — API Proxy
 * Route: /proxy
 *
 * All GreenLake and Central API calls from the browser are routed here.
 * This avoids CORS entirely — the browser talks same-origin to Cloudflare,
 * and Cloudflare makes the actual upstream request server-side.
 *
 * Usage:
 *   POST /proxy  { url, method, headers, body }
 *
 * The request body is JSON with:
 *   url     — full upstream URL to call
 *   method  — HTTP method (default GET)
 *   headers — object of headers to forward (Authorization, Content-Type, etc.)
 *   body    — string body (for POST/PATCH)
 */

export async function onRequestPost(context) {
  try {
    const { url, method = 'GET', headers = {}, body } = await context.request.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: corsHeaders('application/json'),
      });
    }

    // Safety: only allow HPE/Aruba domains
    const allowed = [
      'sso.common.cloud.hpe.com',
      'global.api.greenlake.hpe.com',
      '.api.central.arubanetworks.com',
      'cn1.api.central.arubanetworks.com.cn',
    ];
    const parsedUrl = new URL(url);
    const isAllowed = allowed.some(d => parsedUrl.hostname === d || parsedUrl.hostname.endsWith(d));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
        status: 403,
        headers: corsHeaders('application/json'),
      });
    }

    const fetchOptions = {
      method,
      headers: {
        ...headers,
        // Never forward the browser's Host header
        'Host': parsedUrl.hostname,
      },
    };
    if (body) fetchOptions.body = body;

    const upstream = await fetch(url, fetchOptions);

    // Stream the upstream response back, injecting CORS headers
    const responseHeaders = corsHeaders(
      upstream.headers.get('content-type') || 'application/json'
    );

    // Forward useful upstream headers
    for (const h of ['location', 'retry-after', 'x-request-id', 'allow', 'www-authenticate', 'x-error', 'x-error-description']) {
      const v = upstream.headers.get(h);
      if (v) responseHeaders[h] = v;
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders('application/json'),
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(contentType) {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}
