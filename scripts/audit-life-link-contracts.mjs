import fs from 'node:fs';
import path from 'node:path';

const dataset = JSON.parse(fs.readFileSync('data/life-services.json', 'utf8'));
const rows = dataset.services;
const links = rows.flatMap(row => [
  ['web', row.web?.url], ['android', row.androidUrl], ['ios', row.iosUrl],
].filter(([, url]) => url).map(([platform, url]) => ({
  id: row.id, platform, url, heldFromDefault: row.reviewRequired,
  evidenceState: row.linkEvidence?.find(e => e.platform === platform)?.state || 'missing_evidence_record',
})));
const report = {
  checkedAt: new Date().toISOString(), scope: 'Existing evidence-state inventory, not live link or installation validation',
  records: rows.length, heldFromDefault: rows.filter(r => r.reviewRequired).length,
  linkFields: Object.fromEntries(['web', 'android', 'ios'].map(p => [p, links.filter(l => l.platform === p).length])),
  individuallyPending: links.filter(l => l.evidenceState === 'imported_link_individual_verification_pending'),
  missingEvidence: links.filter(l => l.evidenceState === 'missing_evidence_record'),
  flags: rows.filter(r => r.id === 'bbegi').map(row => ({ id: row.id, currentUrl: row.web.url, currentLabel: row.web.label,
    reason: 'This URL is a Gangbuk municipal guide, not the provider homepage; keep guide and provider actions distinct',
    sourceUrl: row.web.url, providerCandidate: 'https://bbegi.com/', changesApplied: false })),
};
const out = 'data/exports/ui-review-2026-10-19/followup-validation/life-link-contracts.json';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ records: report.records, heldFromDefault: report.heldFromDefault, linkFields: report.linkFields,
  individuallyPending: report.individuallyPending.length, missingEvidence: report.missingEvidence.length, flags: report.flags.length, output: out }));
