import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyIndustry,
  brandCandidateFor,
  consumerCategories,
  taxonomyVersion,
} from './seoul-life-taxonomy.mjs';

// Codes below are synthetic sentinels, not claims about official source codes.
const industry = (large, middle, small) => ({
  large,
  middle,
  small,
  middleCode: 'source-middle-001',
  smallCode: 'source-small-001',
});
const cafe = industry('음식', ' 비알코올 ', '카페');
const study = industry('예술·스포츠', '도서관·사적지', '독서실/스터디 카페');
const vet = industry('과학·기술', '수의', '동물병원');
const convenience = industry('소매', '종합 소매', '편의점');
const supermarket = industry('소매', '종합 소매', '슈퍼마켓');
const estate = industry('부동산', '부동산 서비스', '부동산 중개업');

const classificationFixtures = [
  ['food cafe with source whitespace', cafe, 'cafes-work'],
  ['study space', study, 'cafes-work'],
  ['veterinary practice', vet, 'pets'],
  ['internal medicine clinic', industry('보건의료', '의원', '내과/소아과 의원'), 'health'],
  ['pharmacy', industry('소매', '의약·화장품 소매', '약국'), 'health'],
  ['laundry shop', industry('수리·개인', '세탁', '세탁소'), 'laundry-clean'],
  ['self-service laundry', industry('수리·개인', '세탁', '셀프빨래방'), 'laundry-clean'],
  ['petrol station', industry('소매', '연료 소매', '주유소'), 'mobility'],
  ['gas filling station', industry('소매', '연료 소매', '가스 충전소'), 'mobility'],
];

test('prototype-like source labels are review candidates, not inherited category values', () => {
  for (const large of ['__proto__', 'constructor', 'toString']) {
    const result = classifyIndustry(industry(large, 'unknown', 'unknown'));
    assert.equal(result.categoryId, 'review');
    assert.equal(result.state, 'review_required');
  }
});

for (const [label, source, categoryId] of classificationFixtures) {
  test(`classifyIndustry: ${label}`, () => {
    const before = structuredClone(source);
    const result = classifyIndustry(source);
    assert.equal(result.categoryId, categoryId);
    assert.equal(result.leafCode, source.smallCode);
    assert.equal(result.leafLabel, source.small.trim());
    assert.equal(result.sectionLabel, source.middle.trim());
    assert.equal(result.sectionId, `${categoryId}:${source.middleCode}`);
    assert.equal(result.version, taxonomyVersion);
    assert.equal(result.state, 'rule_based_proposal');
    assert.deepEqual(result.purposeIds, [categoryId]);
    assert.deepEqual(source, before, 'classification must not mutate source industry');
  });
}

test('consumerCategories: unique named categories and purposes remain proposals', () => {
  assert.ok(Array.isArray(consumerCategories));
  const ids = consumerCategories.map(category => category.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['cafes-work', 'health', 'pets', 'laundry-clean', 'mobility', 'review']) {
    assert.ok(ids.includes(id), `missing category: ${id}`);
  }
  for (const category of consumerCategories) {
    assert.equal(typeof category.id, 'string');
    assert.ok(category.id.length > 0);
    assert.equal(typeof category.label, 'string');
    assert.ok(category.label.trim().length > 0);
    assert.equal(typeof category.purpose, 'string');
    assert.ok(category.purpose.trim().length > 0);
    assert.equal(category.status, 'proposed_consumer_taxonomy');
  }
});

test('taxonomyVersion: nonempty version is exposed on classification results', () => {
  assert.equal(typeof taxonomyVersion, 'string');
  assert.ok(taxonomyVersion.trim().length > 0);
  assert.equal(classifyIndustry(cafe).version, taxonomyVersion);
  assert.equal(classifyIndustry({}).version, taxonomyVersion);
});

test('classifyIndustry: study spaces retain a different leaf and rule from food cafes', () => {
  const food = classifyIndustry({ ...cafe, middleCode: 'food-middle', smallCode: 'food-cafe-source' });
  const learning = classifyIndustry({ ...study, middleCode: 'study-middle', smallCode: 'study-space-source' });
  assert.equal(food.categoryId, learning.categoryId);
  assert.notEqual(food.leafCode, learning.leafCode);
  assert.notEqual(food.leafLabel, learning.leafLabel);
  assert.notEqual(food.sectionId, learning.sectionId);
  assert.notEqual(food.ruleId, learning.ruleId);
});

test('classifyIndustry: animal medicine has no human-health purpose', () => {
  const animal = classifyIndustry(vet);
  const human = classifyIndustry(industry('보건의료', '의원', '내과/소아과 의원'));
  assert.equal(animal.categoryId, 'pets');
  assert.equal(human.categoryId, 'health');
  assert.notEqual(animal.ruleId, human.ruleId);
  assert.ok(!animal.purposeIds.includes('health'));
  assert.ok(!animal.purposeLabels.some(label => /의료기관|인간병원|사람.*병원/.test(label)));
});

test('classifyIndustry: household fuel is not relabeled as a petrol station', () => {
  const source = industry('소매', '연료 소매', '가정용 연료 소매업');
  const result = classifyIndustry(source);
  assert.equal(result.categoryId, 'shopping');
  assert.equal(result.leafLabel, source.small);
  assert.equal(result.leafCode, source.smallCode);
  assert.notEqual(result.ruleId, classifyIndustry(industry('소매', '연료 소매', '주유소')).ruleId);
});

test('classifyIndustry: opaque source smallCode is preserved without conversion', () => {
  for (const smallCode of ['00017', 'CUSTOM/source:017', 17]) {
    assert.equal(classifyIndustry({ ...cafe, smallCode }).leafCode, smallCode);
  }
});

test('classifyIndustry: absent source codes are not fabricated', () => {
  const result = classifyIndustry({ large: '음식', middle: ' 비알코올 ', small: '카페' });
  assert.equal(result.leafCode, null);
  assert.equal(result.sectionId, 'cafes-work:비알코올');
});

test('classifyIndustry: unknown source remains review_required with source leaf intact', () => {
  const source = industry('미등록 대분류', '미등록 중분류', '미등록 소분류');
  const result = classifyIndustry(source);
  assert.equal(result.categoryId, 'review');
  assert.equal(result.state, 'review_required');
  assert.equal(result.leafCode, source.smallCode);
  assert.equal(result.leafLabel, source.small);
  assert.deepEqual(result.purposeIds, ['review']);
});

test('classifyIndustry: source leaf and consumer purpose remain separate fields', () => {
  const result = classifyIndustry(cafe);
  const category = consumerCategories.find(value => value.id === result.categoryId);
  assert.equal(result.leafLabel, '카페');
  assert.deepEqual(result.purposeLabels, [category.purpose]);
  assert.notEqual(result.leafLabel, result.purposeLabels[0]);
  assert.equal(category.status, 'proposed_consumer_taxonomy');
  assert.equal(result.state, 'rule_based_proposal');
});

const malformedInputs = [
  ['undefined', undefined],
  ['null', null],
  ['empty object', {}],
  ['string', 'malformed'],
  ['number', 42],
  ['boolean', false],
  ['array', []],
  ['null fields', { large: null, middle: null, small: null }],
  ['non-string fields', { large: 42, middle: [], small: {} }],
];

for (const [label, value] of malformedInputs) {
  test(`classifyIndustry: tolerates ${label}`, () => {
    let result;
    assert.doesNotThrow(() => { result = classifyIndustry(value); });
    assert.equal(result.categoryId, 'review');
    assert.equal(result.state, 'review_required');
    assert.equal(result.version, taxonomyVersion);
  });
}

const brandFixtures = [
  ['CU 서울점', convenience, 'cu'],
  ['GS25 서울점', convenience, 'gs25'],
  ['이마트24 서울점', convenience, 'emart24'],
  ['이마트에브리데이 서울점', supermarket, 'emart-everyday'],
  ['이마트 서울점', supermarket, 'emart'],
  ['스타벅스 서울점', cafe, 'starbucks'],
  ['(주) CU 서울점', convenience, 'cu'],
  ['(주)이마트24 서울점', convenience, 'emart24'],
  ['주식회사 GS25 서울점', convenience, 'gs25'],
  ['유한회사 스타벅스 서울점', cafe, 'starbucks'],
];

function assertUnverifiedCandidate(candidate, place, id) {
  assert.ok(candidate, `expected brand candidate for ${place.name}`);
  assert.equal(candidate.id, id);
  assert.equal(candidate.state, 'unverified_name_candidate');
  assert.equal(candidate.officialMembershipVerified, false);
  assert.equal(candidate.evidenceField, 'name');
  assert.equal(candidate.evidenceValue, place.name);
  // An explicit allowlist prevents silently adding unsupported operating facts.
  assert.deepEqual(Object.keys(candidate).sort(), [
    'evidenceField', 'evidenceValue', 'id', 'label', 'officialMembershipVerified', 'state',
  ].sort());
}

for (const [name, source, id] of brandFixtures) {
  test(`brandCandidateFor: ${name}`, () => {
    const place = { name, industry: structuredClone(source) };
    const before = structuredClone(place);
    assertUnverifiedCandidate(brandCandidateFor(place), place, id);
    assert.deepEqual(place, before, 'candidate matching must not mutate place');
  });
}

test('brandCandidateFor: emart24 does not become emart or a hypermarket', () => {
  const place = { name: '이마트24 서울점', industry: convenience };
  assertUnverifiedCandidate(brandCandidateFor(place), place, 'emart24');
  assert.equal(place.industry.small, '편의점');
  assert.equal(brandCandidateFor({ name: place.name, industry: supermarket }), null);
  assert.equal(brandCandidateFor({ name: place.name, industry: { ...supermarket, small: '대형마트' } }), null);
});

test('brandCandidateFor: emart everyday returns one distinct candidate, not emart', () => {
  const candidate = brandCandidateFor({ name: '이마트에브리데이 서울점', industry: supermarket });
  assert.ok(candidate);
  assert.equal(Array.isArray(candidate), false);
  assert.equal(candidate.id, 'emart-everyday');
  assert.notEqual(candidate.id, 'emart');
});

const rejectedBrands = [
  ['CU부동산', estate],
  ['GS25부동산', estate],
  ['이마트24부동산', estate],
  ['스타벅스 동물병원', vet],
  ['스타벅스 스터디 카페', study],
  ['CU 카페', cafe],
  ['이마트에브리데이 부동산', estate],
  ['스타벅스 의원', industry('보건의료', '의원', '내과/소아과 의원')],
  ['SK 가정용연료', industry('소매', '연료 소매', '가정용 연료 소매업')],
];

for (const [name, source] of rejectedBrands) {
  test(`brandCandidateFor: rejects mismatched source for ${name}`, () => {
    assert.equal(brandCandidateFor({ name, industry: source }), null);
  });
}

test('brandCandidateFor: name claims do not establish hours, parking, prices or open status', () => {
  const place = {
    name: 'CU 24시간 무료주차 최저가 영업중 서울점',
    industry: convenience,
  };
  assertUnverifiedCandidate(brandCandidateFor(place), place, 'cu');
});

const malformedPlaces = [
  ...malformedInputs,
  ['null name', { name: null, industry: convenience }],
  ['numeric name', { name: 42, industry: convenience }],
  ['object name', { name: {}, industry: convenience }],
  ['missing industry', { name: 'CU 서울점' }],
  ['null industry', { name: 'CU 서울점', industry: null }],
  ['string industry', { name: 'CU 서울점', industry: '편의점' }],
  ['number industry', { name: 'CU 서울점', industry: 42 }],
  ['non-string industry fields', { name: '이마트 서울점', industry: { large: {}, middle: [], small: 42 } }],
];

for (const [label, value] of malformedPlaces) {
  test(`brandCandidateFor: tolerates ${label}`, () => {
    let result;
    assert.doesNotThrow(() => { result = brandCandidateFor(value); });
    assert.equal(result, null);
  });
}
