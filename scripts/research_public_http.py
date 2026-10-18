"""Bounded public GET requests with robots checks before every page redirect."""

import ipaddress
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

AGENT = 'JachiUXResearch/1.0'


class AccessStop(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_url(url):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
        raise AccessStop('invalid_public_url')
    host = parts.hostname.lower()
    if host == 'localhost' or host.endswith(('.localhost', '.local')):
        raise AccessStop('non_public_host')
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise AccessStop('non_public_address')
    if any(ord(char) < 33 for char in url):
        raise AccessStop('control_or_space_in_url')
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path or '/', parts.query, ''))


def raw_get(url):
    opener = urllib.request.build_opener(NoRedirect())
    req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,text/plain;q=0.9'})
    try:
        response = opener.open(req, timeout=12)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status, headers = response.code, response.headers
        body = b''
        if status == 200 and any(kind in headers.get('Content-Type', '') for kind in ('html', 'text/plain')):
            body = response.read(3_000_001)
            if len(body) > 3_000_000:
                raise AccessStop('body_limit_not_full_capture')
        return status, url, headers, body


class PublicFetcher:
    def __init__(self, transport=raw_get, sleeper=time.sleep, max_redirects=5, max_delay=20):
        self.transport = transport
        self.sleep = sleeper
        self.max_redirects = max_redirects
        self.max_delay = max_delay
        self.robots = {}
        self.trace = []

    def permission(self, url):
        url = validate_url(url)
        parts = urllib.parse.urlsplit(url)
        origin = parts.scheme + '://' + parts.netloc
        if origin not in self.robots:
            robots_url = origin + '/robots.txt'
            visited = set()
            for hop in range(self.max_redirects + 1):
                if robots_url in visited:
                    raise AccessStop('robots_redirect_loop')
                visited.add(robots_url)
                status, _, headers, body = self.transport(robots_url)
                self.trace.append({'kind': 'robots', 'url': robots_url, 'status': status})
                if status in (301, 302, 303, 307, 308):
                    if hop == self.max_redirects or not headers.get('Location'):
                        raise AccessStop('robots_redirect_limit_or_missing_location')
                    target = validate_url(urllib.parse.urljoin(robots_url, headers['Location']))
                    t = urllib.parse.urlsplit(target)
                    if t.scheme + '://' + t.netloc != origin:
                        raise AccessStop('robots_cross_origin_redirect_needs_review')
                    robots_url = target
                    continue
                if status == 404:
                    rules, state = [], '404_no_published_rules'
                elif status == 200:
                    text = body.decode('utf-8', errors='replace')
                    if '<html' in text[:500].lower():
                        raise AccessStop('robots_html_not_rules')
                    rules, state = text.splitlines(), 'read'
                else:
                    raise AccessStop('robots_unavailable_' + str(status))
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(rules)
                self.robots[origin] = (parser, state)
                break
        parser, state = self.robots[origin]
        if not parser.can_fetch(AGENT, url):
            raise AccessStop('robots_disallowed')
        delay = parser.crawl_delay(AGENT)
        delay = 1 if delay is None else max(delay, 1)
        if delay > self.max_delay:
            raise AccessStop('robots_delay_exceeds_run_budget_not_fetched')
        return {'url': url, 'robots': state, 'delaySeconds': delay}

    def get(self, url):
        self.trace = []
        current = validate_url(url)
        seen = set()
        for hop in range(self.max_redirects + 1):
            if current in seen:
                raise AccessStop('page_redirect_loop')
            seen.add(current)
            try:
                permission = self.permission(current)
            except AccessStop as error:
                self.trace.append({'kind': 'permission', 'url': current, 'allowed': False, 'reason': str(error)})
                raise
            self.sleep(permission['delaySeconds'])
            status, _, headers, body = self.transport(current)
            self.trace.append({'kind': 'page', 'url': current, 'status': status})
            if status in (301, 302, 303, 307, 308):
                if hop == self.max_redirects or not headers.get('Location'):
                    raise AccessStop('page_redirect_limit_or_missing_location')
                target = validate_url(urllib.parse.urljoin(current, headers['Location']))
                if current.startswith('https:') and target.startswith('http:'):
                    raise AccessStop('https_downgrade_not_followed')
                current = target
                continue
            if status >= 400:
                raise urllib.error.HTTPError(current, status, 'Public request stopped', headers, None)
            return status, current, headers, body
        raise AccessStop('page_redirect_limit')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('url')
    args = parser.parse_args()
    fetcher = PublicFetcher()
    try:
        result = fetcher.permission(args.url)
        print(json.dumps({'allowed': True, **result, 'trace': fetcher.trace}))
    except Exception as error:
        print(json.dumps({'allowed': False, 'reason': str(error), 'trace': fetcher.trace}))
        raise SystemExit(1)
