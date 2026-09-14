import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';

// Each OpenCode conversation receives its own view of the SAME default context.
// Cookies stay in Chrome. Ownership is in memory and never inferred from URLs.
export async function createGuard(endpoint) {
  const owned = new Set();
  const sockets = new Set();
  const waiting = [];
  let creating = 0;
  let browserGeneration;
  let closed = false;
  const secretPath = `/devtools/browser/${randomUUID()}`;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  const stats = { denied: 0, hidden: 0, connections: 0 };
  const server = http.createServer(async (req, res) => {
    if (req.headers.origin) { res.writeHead(403); res.end(); return; }
    if (req.url === '/json/version' || req.url === '/json/version/') {
      try {
        const version = await getVersion();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ...version, webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}${secretPath}` }));
      } catch { res.writeHead(503); res.end('Shared Chrome is unavailable.'); }
    } else if (req.url === '/json/list' || req.url === '/json') {
      // Do not expose direct page websocket URLs that bypass this connection.
      res.setHeader('Content-Type', 'application/json'); res.end('[]');
    } else { res.writeHead(404); res.end(); }
  });
  async function getVersion() {
    const version = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(5000) }).then(r => { if (!r.ok) throw new Error('CDP unavailable'); return r.json(); });
    const ws = new URL(version.webSocketDebuggerUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(ws.hostname)) throw new Error('CDP must be local');
    if (browserGeneration && browserGeneration !== version.webSocketDebuggerUrl) owned.clear();
    browserGeneration = version.webSocketDebuggerUrl;
    return version;
  }
  const denyMessage = method => `Session guard: ${method} cannot affect another session or the shared browser. Use this session's own page.`;
  server.on('upgrade', (req, socket, head) => {
    if (closed || req.url !== secretPath || req.headers.origin) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', async client => {
    sockets.add(client);
    stats.connections++;
    let upstream;
    const pending = new Map();
    const sessions = new Map();
    let internalId = -1;
    const out = m => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(m)); };
    const remote = m => { if (upstream?.readyState === WebSocket.OPEN) upstream.send(JSON.stringify(m)); };
    const internal = (method, params) => remote({ id: internalId--, method, params });
    const result = (m, value = {}) => out({ id: m.id, result: value, ...(m.sessionId ? { sessionId: m.sessionId } : {}) });
    const deny = (m, message = denyMessage(m.method)) => { stats.denied++; out({ id: m.id, error: { code: -32000, message }, ...(m.sessionId ? { sessionId: m.sessionId } : {}) }); };
    function visible(info, parentSession) {
      if (!info) return false;
      if (owned.has(info.targetId)) return true;
      if (info.openerId && owned.has(info.openerId) || parentSession && sessions.has(parentSession)) {
        owned.add(info.targetId); return true;
      }
      return false;
    }
    function incoming(m) {
      if (closed || client.readyState !== WebSocket.OPEN) return;
      if (m.id !== undefined) {
        if (m.id < 0) return;
        const key = `${m.sessionId || ''}:${m.id}`;
        const p = pending.get(key);
        pending.delete(key);
        if (!p) return;
        if (p.method === 'Target.createTarget') {
          if (m.result?.targetId) owned.add(m.result.targetId);
          creating--;
          // Deliver ownership events before completion so both clients initialize pages.
          if (creating === 0) for (const f of waiting.splice(0)) f();
        }
        if (p.method === 'Target.attachToTarget' && m.result?.sessionId) sessions.set(m.result.sessionId, p.params.targetId);
        if (p.method === 'Target.getTargets' && m.result) m.result.targetInfos = m.result.targetInfos.filter(t => visible(t));
        if (p.method === 'Target.getTargetInfo' && m.result?.targetInfo && m.result.targetInfo.type !== 'browser' && !visible(m.result.targetInfo, p.sessionId)) {
          deny(p); return;
        }
        out(m); return;
      }
      const info = m.params?.targetInfo;
      if (m.method === 'Target.targetCreated' || m.method === 'Target.targetInfoChanged' || m.method === 'Target.attachedToTarget') {
        if (!visible(info, m.sessionId)) {
          if (creating > 0) { waiting.push(() => incoming(m)); return; }
          stats.hidden++;
          if (m.method === 'Target.attachedToTarget') {
            // Never leave a foreign target paused by an auto-attach request.
            internal('Target.detachFromTarget', { sessionId: m.params.sessionId });
          }
          return;
        }
        if (m.method === 'Target.attachedToTarget') sessions.set(m.params.sessionId, info.targetId);
      } else if (m.method === 'Target.detachedFromTarget') {
        if (!sessions.has(m.params.sessionId)) return;
        sessions.delete(m.params.sessionId);
      } else if (m.method === 'Target.targetDestroyed' || m.method === 'Target.targetCrashed') {
        if (!owned.has(m.params.targetId)) return;
        if (m.method === 'Target.targetDestroyed') owned.delete(m.params.targetId);
      } else if (m.sessionId && !sessions.has(m.sessionId)) {
        return;
      } else if (!m.sessionId && !m.method.startsWith('Target.')) {
        // Browser-wide download/trace events may belong to another conversation.
        return;
      }
      out(m);
    }
    const queued = [];
    function outgoing(m) {
      const { method, params = {}, sessionId } = m;
      if (!Number.isSafeInteger(m.id) || m.id < 0 || typeof method !== 'string') return;
      if (sessionId && !sessions.has(sessionId)) return deny(m, 'Session guard: the target session has closed or is not owned. List your own tabs before retrying.');
      if (params.targetId && !owned.has(params.targetId)) return deny(m);
      if (method === 'Target.getBrowserContexts') return result(m, { browserContextIds: [] });
      // These operate on a shared profile, window, service worker, or browser trace.
      if (/^(Browser\.(close|crash|crashGpuProcess|setWindowBounds|setPermission|grantPermissions|resetPermissions)|Target\.(createBrowserContext|disposeBrowserContext|attachToBrowserTarget|exposeDevToolsProtocol|sendMessageToTarget|autoAttachRelated)|Storage\.|ServiceWorker\.|Tracing\.|SystemInfo\.|PWA\.)/.test(method)) return deny(m);
      if (/^Network\.(clearBrowserCookies|clearBrowserCache|setCookie|setCookies|deleteCookies)$/.test(method)) return deny(m);
      if (method === 'Browser.setDownloadBehavior') {
        // Initializers may configure a shared download directory. Keep Chrome's
        // existing behavior instead of changing all concurrent sessions.
        return result(m);
      }
      if (method === 'Page.bringToFront' || method === 'Target.activateTarget') return result(m);
      if (method === 'Target.detachFromTarget' && params.sessionId && !sessions.has(params.sessionId)) return deny(m);
      if (method === 'Target.createTarget') {
        if (params.browserContextId) return deny(m);
        m.params = { ...params, background: true };
        creating++;
      }
      if (method === 'Target.setAutoAttach') {
        // A default-context auto-attach otherwise pauses every other session's
        // new tabs. Foreign sessions are filtered and detached above.
        m.params = { ...params, waitForDebuggerOnStart: false };
        if (!sessionId) m.params.filter = [{ type: 'page' }, { type: 'iframe' }, { exclude: true }];
      }
      if (method === 'Browser.getWindowForTarget' && !params.targetId && !sessionId) return deny(m);
      if (!sessionId && !/^(Browser\.(getVersion|getWindowForTarget|getWindowBounds)|Target\.(getTargets|getTargetInfo|setDiscoverTargets|setAutoAttach|attachToTarget|detachFromTarget|createTarget|closeTarget|activateTarget))$/.test(method)) return deny(m);
      pending.set(`${m.sessionId || ''}:${m.id}`, m);
      remote(m);
    }
    client.on('message', b => {
      try { const m = JSON.parse(String(b)); if (upstream?.readyState === WebSocket.OPEN) outgoing(m); else queued.push(m); }
      catch { client.close(1003); }
    });
    client.on('error', () => {});
    client.on('close', () => {
      sockets.delete(client);
      for (const p of pending.values()) if (p.method === 'Target.createTarget') creating--;
      pending.clear();
      if (creating === 0) for (const f of waiting.splice(0)) f();
      upstream?.close();
    });
    try {
      const version = await getVersion();
      if (client.readyState !== WebSocket.OPEN) return;
      upstream = new WebSocket(version.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
      sockets.add(upstream);
      upstream.on('message', b => { try { incoming(JSON.parse(String(b))); } catch { client.close(1011); } });
      upstream.on('error', () => client.close(1011));
      upstream.on('close', () => { sockets.delete(upstream); client.close(); });
      await once(upstream, 'open');
      for (const m of queued.splice(0)) outgoing(m);
    } catch { client.close(1011); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    endpoint: `http://127.0.0.1:${server.address().port}`,
    stats,
    owned,
    async close() {
      closed = true;
      for (const socket of sockets) socket.terminate();
      wss.close(); server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
