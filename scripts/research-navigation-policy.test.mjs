import assert from 'node:assert/strict';
import test from 'node:test';
import { publicDocumentHandler } from './research-navigation-policy.mjs';

function setup({ allowed = true, status = 200, location, url = 'https://example.com/start', method = 'GET' } = {}) {
  const calls = [], navigation = [], redirectHints = new Map();
  const response = { status: () => status, headers: () => ({ location }), dispose: async () => calls.push('dispose') };
  const route = { request: () => ({ isNavigationRequest: () => true, method: () => method, url: () => url }),
    fetch: async options => { calls.push(['fetch', options]); return response; },
    abort: async () => calls.push('abort'), continue: async () => calls.push('continue'), fulfill: async () => calls.push('fulfill') };
  const handler = publicDocumentHandler({ permission: async () => ({ allowed, delaySeconds: 1, reason: allowed ? null : 'robots_disallowed' }), navigation, redirectHints, sleep: async () => {} });
  return { route, handler, calls, navigation, redirectHints };
}
test('robots denial never sends document request', async () => {
  const x = setup({ allowed: false }); await x.handler(x.route);
  assert.deepEqual(x.calls, ['abort']); assert.equal(x.navigation[0].reason, 'robots_disallowed');
});
test('redirect fetch disables implicit hops, aborts and leaves next URL for a fresh check', async () => {
  const x = setup({ status: 302, location: 'https://other.example/item' }); await x.handler(x.route);
  assert.equal(x.calls[0][1].maxRedirects, 0); assert.equal(x.calls[0][1].maxRetries, 0);
  assert.deepEqual(x.calls.slice(1), ['abort', 'dispose']);
  assert.equal(x.redirectHints.get('https://example.com/start'), 'https://other.example/item');
});
test('allowed page fulfills its exact response and releases body', async () => {
  const x = setup(); await x.handler(x.route); assert.deepEqual(x.calls.slice(1), ['fulfill', 'dispose']);
});
test('non-GET navigation stops before permission or fetching', async () => {
  const x = setup({ method: 'POST' }); await x.handler(x.route); assert.deepEqual(x.calls, ['abort']);
});
test('unsafe redirect never creates a navigation hint', async () => {
  for (const location of ['file:///private', 'https://user:password@other.example/', 'http://example.com/other']) {
    const x = setup({ status: 302, location }); await x.handler(x.route);
    assert.equal(x.redirectHints.size, 0); assert.equal(x.navigation[0].reason, 'unsafe-redirect-target');
  }
});
