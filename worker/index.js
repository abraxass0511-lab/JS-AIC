/**
 * SafePatrol Cloudflare Worker Relay
 * - GitHub Private Repository API Relay
 * - Zero Dependencies, 100% Free Plan Compatible (10ms CPU is plenty)
 * 
 * Environmental Variables to set in Cloudflare:
 * - GITHUB_TOKEN: Personal Access Token (repo scope)
 * - GITHUB_OWNER: GitHub Username/Org
 * - GITHUB_REPO: Data Repo Name (e.g., safepatrol-data-2026)
 * - PINS_JSON: '{"111111":{"name":"점검자1","role":"inspector"},"222222":{"name":"점검자2","role":"inspector"},"000000":{"name":"관리자","role":"admin"}}'
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-PIN',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pin = request.headers.get('X-PIN');
    const pins = JSON.parse(env.PINS_JSON || '{}');
    const user = pins[pin];

    // Auth verification endpoint
    if (url.pathname === '/auth') {
      if (!user) {
        return new Response(JSON.stringify({ error: '인증 실패' }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    if (!user) {
      return new Response(JSON.stringify({ error: '인증이 필요합니다' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // GitHub Repo Relay endpoint
    if (url.pathname === '/file') {
      const filePath = url.searchParams.get('path');
      const isRaw = url.searchParams.get('raw') === '1';

      if (!filePath) {
        return new Response('path parameter missing', { status: 400, headers: CORS_HEADERS });
      }

      const ghUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
      const ghHeaders = {
        'User-Agent': 'SafePatrol-Relay',
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': isRaw ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3+json'
      };

      if (request.method === 'GET') {
        const ghRes = await fetch(ghUrl, { headers: ghHeaders });
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }

      if (request.method === 'PUT') {
        const body = await request.text();
        const ghRes = await fetch(ghUrl, {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body
        });
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }

      if (request.method === 'DELETE') {
        const body = await request.text();
        const ghRes = await fetch(ghUrl, {
          method: 'DELETE',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body
        });
        const resHeaders = new Headers(ghRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        return new Response(ghRes.body, { status: ghRes.status, headers: resHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
