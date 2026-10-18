from email.message import Message
import unittest

from research_public_http import AccessStop, NoRedirect, PublicFetcher, validate_url


def reply(status=200, body='User-agent: *\nAllow: /', location=None):
    headers = Message()
    headers['Content-Type'] = 'text/plain'
    if location is not None:
        headers['Location'] = location
    return status, '', headers, body.encode()


class PublicFetchTests(unittest.TestCase):
    def test_transport_disables_implicit_redirects(self):
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example/'))

    def client(self, routes, **kwargs):
        calls, sleeps = [], []

        def transport(url):
            calls.append(url)
            self.assertIn(url, routes, 'Unexpected request: ' + url)
            return routes[url]

        return PublicFetcher(transport, sleeps.append, **kwargs), calls, sleeps

    def test_same_origin_redirect_checks_new_path_before_request(self):
        f, calls, _ = self.client({'https://example.com/robots.txt': reply(body='User-agent: *\nDisallow: /private'), 'https://example.com/start': reply(302, location='/private')})
        with self.assertRaisesRegex(AccessStop, 'robots_disallowed'):
            f.get('https://example.com/start')
        self.assertNotIn('https://example.com/private', calls)

    def test_cross_origin_checks_destination_robots_first(self):
        f, calls, _ = self.client({'https://example.com/robots.txt': reply(), 'https://example.com/start': reply(302, location='https://other.example/item'), 'https://other.example/robots.txt': reply(body='User-agent: *\nDisallow: /')})
        with self.assertRaisesRegex(AccessStop, 'robots_disallowed'):
            f.get('https://example.com/start')
        self.assertNotIn('https://other.example/item', calls)

    def test_allowed_redirect_reuses_rules_and_waits(self):
        f, calls, sleeps = self.client({'https://example.com/robots.txt': reply(body='User-agent: *\nCrawl-delay: 3'), 'https://example.com/start': reply(302, location='/item'), 'https://example.com/item': reply(body='item')})
        self.assertEqual(f.get('https://example.com/start')[1], 'https://example.com/item')
        self.assertEqual(calls.count('https://example.com/robots.txt'), 1)
        self.assertEqual(sleeps, [3, 3])

    def test_missing_robots_is_distinct_from_forbidden(self):
        f, _, _ = self.client({'https://example.com/robots.txt': reply(404)})
        self.assertEqual(f.permission('https://example.com/item')['robots'], '404_no_published_rules')

    def test_robots_failures_are_not_assumed_permission(self):
        for status in [401, 403, 429, 500]:
            with self.subTest(status=status):
                f, calls, _ = self.client({'https://example.com/robots.txt': reply(status)})
                with self.assertRaisesRegex(AccessStop, 'robots_unavailable'):
                    f.get('https://example.com/item')
                self.assertEqual(len(calls), 1)

    def test_robots_html_is_not_empty_allow_list(self):
        f, _, _ = self.client({'https://example.com/robots.txt': reply(body='<html>Access check</html>')})
        with self.assertRaisesRegex(AccessStop, 'robots_html'):
            f.permission('https://example.com/item')

    def test_robots_cross_origin_redirect_stops(self):
        f, calls, _ = self.client({'https://example.com/robots.txt': reply(302, location='https://other.example/robots.txt')})
        with self.assertRaisesRegex(AccessStop, 'cross_origin'):
            f.permission('https://example.com/item')
        self.assertEqual(len(calls), 1)

    def test_same_origin_robots_redirect_and_page_are_checked(self):
        f, _, _ = self.client({'https://example.com/robots.txt': reply(302, location='/rules.txt'), 'https://example.com/rules.txt': reply(), 'https://example.com/item': reply(body='item')})
        self.assertEqual(f.get('https://example.com/item')[0], 200)

    def test_page_loop_is_bounded(self):
        f, _, _ = self.client({'https://example.com/robots.txt': reply(), 'https://example.com/start': reply(302, location='/start')})
        with self.assertRaisesRegex(AccessStop, 'page_redirect_loop'):
            f.get('https://example.com/start')

    def test_redirect_budget_never_requests_next_page(self):
        f, calls, _ = self.client({'https://example.com/robots.txt': reply(), 'https://example.com/start': reply(302, location='/other')}, max_redirects=0)
        with self.assertRaisesRegex(AccessStop, 'page_redirect_limit'):
            f.get('https://example.com/start')
        self.assertNotIn('https://example.com/other', calls)

    def test_long_delay_is_preserved_as_deferred(self):
        f, _, sleeps = self.client({'https://example.com/robots.txt': reply(body='User-agent: *\nCrawl-delay: 30')})
        with self.assertRaisesRegex(AccessStop, 'delay_exceeds'):
            f.get('https://example.com/item')
        self.assertEqual(sleeps, [])

    def test_unsafe_url_or_downgrade_is_never_requested(self):
        for url in ['file:///data', 'https://user:password@example.com/', 'http://127.0.0.1/', 'https://localhost/', 'https://example.com/\nprivate']:
            with self.subTest(url=url), self.assertRaises(AccessStop):
                validate_url(url)
        f, calls, _ = self.client({'https://example.com/robots.txt': reply(), 'https://example.com/start': reply(302, location='http://example.com/other')})
        with self.assertRaisesRegex(AccessStop, 'downgrade'):
            f.get('https://example.com/start')
        self.assertNotIn('http://example.com/other', calls)


if __name__ == '__main__':
    unittest.main()
