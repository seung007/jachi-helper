import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../life-services-core.js');
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data = read('../data/life-services.json');
const regions = read('../data/life-regions.json');

test('pagination exposes numbered destinations without thousands of controls', () => {
  assert.deepEqual(C.pageNumbers(1, 12), [1, 2, 3, 4, 5, null, 12]);
  assert.deepEqual(C.pageNumbers(5, 100, true), [4, 5, 6, null]);
  for (const page of [1, 2, 50, 100]) {
    assert(C.pageNumbers(page, 100).includes(page));
    assert(C.pageNumbers(page, 100).length <= 9);
    assert(C.pageNumbers(page, 100, true).filter(Boolean).length <= 3);
  }
});
test('map links use name and coordinates, never a concatenated address query', () => {
  const place = { name: '(리치월드트레이딩;', address: '서울특별시 강남구 도산대로1길 63', latitude: 37.51, longitude: 127.02 };
  const link = C.placeLink(place);
  assert.equal(link.kind, 'coordinate');
  assert.match(decodeURIComponent(link.url), /리치월드트레이딩,37.51,127.02$/);
  assert(!link.url.includes('q=')); assert(!decodeURIComponent(link.url).includes('도산대로'));
  assert.equal(C.placeLink({ ...place, latitude: null }).kind, 'search');
  assert.equal(C.placeLink({ ...place, longitude: Infinity }).kind, 'search');
  assert.equal(C.displayName('(강남서초)해피케어'), '(강남서초)해피케어');
  assert.equal(C.displayName("n'hairshop"), "n'hairshop");
});

test('public directory preserves purposes, subtopics, official links and review boundaries', () => {
  assert.equal(C.validate(data), data);
  assert.equal(data.categories.length, 18);
  assert.equal(data.categories.flatMap(c => c.subtopics).length, 106);
  assert(data.services.length >= 86);
  const visible = C.filterServices(data, {});
  assert(visible.every(s => !s.reviewRequired));
  for (const id of ['ddangyo', 'yeogiro', 'epost', 'sssd']) assert(visible.some(s => s.id === id), 'readable official app description remains usable when web body is unavailable: ' + id);
  for (const id of ['peopet', 'holiday-pharmacy', 'smartchoice']) assert(!visible.some(s => s.id === id), 'unverified target feature remains held: ' + id);
  assert.equal(C.filterServices(data, { review: true }).length, data.services.length);
  for (const c of data.categories) for (const subtopic of c.subtopics) {
    const matches = C.filterServices(data, { category: c.id, subtopic: subtopic.id, review: true });
    assert(matches.every(s => s.categoryIds.includes(c.id) && s.subtopicIds.includes(subtopic.id)));
  }
  assert(!C.safeUrl('javascript:alert(1)'));
  assert(!C.safeUrl('https://name:secret@example.com'));
  assert(!C.safeUrl('https://example.com:8080'));
});
test('problem search, synonyms, saved intersection and sparse results are deterministic', () => {
  for (const q of ['이불 세탁', '빨래', '음쓰', '편의점택배']) assert(C.filterServices(data, { q }).length, q);
  assert.deepEqual(C.filterServices(data, { q: '없는검색어zqx' }), []);
  const id = C.filterServices(data, { problem: 'laundry' })[0].id;
  assert.deepEqual(C.filterServices(data, { savedIds: new Set([id]) }).map(s => s.id), [id]);
  assert(data.services.some(s => !s.androidUrl || !s.iosUrl));
  assert(data.services.every(s => s.linkNotes.includes('미확인') || s.linkNotes.length > 0));
});
test('URL state rejects unknown region pairs, categories, pages and oversized queries', () => {
  const district = regions.districts[0], other = regions.districts[1];
  const state = C.readState(new URLSearchParams({ view: 'places', district: district.code, dong: other.legal[0].code, page: '-2', q: 'x'.repeat(100), category: 'bad' }), data, regions);
  assert.equal(state.district, district.code); assert.equal(state.dong, '');
  assert.equal(state.page, 1); assert.equal(state.q.length, 80); assert.equal(state.category, '');
  assert.equal(C.readState(new URLSearchParams({ view: 'invalid' }), data, regions).view, 'services');
});
test('local saves expire, reject corruption, separate place IDs and remove extra private fields', () => {
  const now = Date.now(), record = (kind, id, savedAt = now) => ({ kind, id, savedAt, place: { name: '가게', address: '서울', phone: 'private' } });
  const raw = JSON.stringify({ version: 1, entries: [record('service', 'a'), record('service', 'a'), record('place', 'a'), record('service', 'expired', now - C.TTL), record('service', 'future', now + 1), record('place', 'invalid/id')] });
  const saved = C.readSaved(raw, now);
  assert.equal(saved.length, 2); assert(!JSON.stringify(saved).includes('private'));
  assert.deepEqual(C.readSaved('{'), []); assert.deepEqual(C.readSaved('{}'), []);
  assert.equal(C.readRegion(JSON.stringify({ district: regions.districts[0].code, savedAt: now }), regions, now).district, regions.districts[0].code);
  assert.equal(C.readRegion(JSON.stringify({ savedAt: now - C.TTL }), regions, now), null);
});
