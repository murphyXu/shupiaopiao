import { invokeAdminApi, loadRepoEnvLocal, readJsonBody } from './proxy/cloudbase.mjs';

export function adminApiProxyPlugin() {
  return {
    name: 'admin-api-proxy',
    configureServer(server) {
      loadRepoEnvLocal();
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/admin-api')) return next();
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'POST') return next();
        try {
          const body = await readJsonBody(req);
          const auth = String(req.headers.authorization || '');
          const bearer = auth.match(/^Bearer\s+(.+)$/i);
          const adminToken = bearer ? bearer[1].trim() : '';
          const result = await invokeAdminApi(body, adminToken);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.statusCode = result && result.code === 0 ? 200 : (result?.code || 500);
          res.end(JSON.stringify(result));
        } catch (err) {
          console.error('[admin-api-proxy]', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ code: 500, msg: err.message || 'proxy error' }));
        }
      });
    },
  };
}
