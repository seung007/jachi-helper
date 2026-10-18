import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export function publicPermissionChecker({ root = process.cwd(), python = process.env.PYTHON_BIN || 'python' } = {}) {
  const run = promisify(execFile), cache = new Map();
  const check = async url => {
    if (!cache.has(url)) {
      let result;
      try {
        const { stdout } = await run(python, [path.join(root, 'scripts/research_public_http.py'), url], { timeout: 25000 });
        result = JSON.parse(stdout);
      } catch (error) {
        try { result = JSON.parse(error.stdout); }
        catch { result = { allowed: false, reason: 'policy-check-failed' }; }
      }
      cache.set(url, result);
    }
    return cache.get(url);
  };
  return { check, cache };
}

export function publicDocumentHandler({ permission, navigation, redirectHints, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  return async route => {
    const request = route.request();
    if (!request.isNavigationRequest()) { await route.continue(); return; }
    const observation = { url: request.url(), allowed: false };
    navigation.push(observation);
    try {
      if (request.method() !== 'GET') throw Error('public-GET-only');
      const result = await permission(request.url());
      if (!result.allowed) throw Error(result.reason || 'permission-denied');
      observation.allowed = true;
      await sleep(result.delaySeconds * 1000);
      // Redirects must become separately checked navigations, not implicit network hops.
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 20000 });
      try {
        observation.status = response.status();
        if ([301, 302, 303, 307, 308].includes(response.status())) {
          const location = response.headers().location;
          if (!location) throw Error('redirect-missing-location');
          const target = new URL(location, request.url());
          if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password ||
              (request.url().startsWith('https:') && target.protocol !== 'https:')) throw Error('unsafe-redirect-target');
          redirectHints.set(request.url(), target.href);
          observation.redirectTarget = target.href;
          observation.state = 'redirect-not-automatically-followed';
          await route.abort();
          return;
        }
        await route.fulfill({ response });
      } finally { await response.dispose(); }
    } catch (error) {
      observation.reason = error.message;
      await route.abort().catch(() => {});
    }
  };
}
