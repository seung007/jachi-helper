import fs from 'node:fs';
const root = 'data/exports/ui-review-2026-10-19/';
const index = JSON.parse(fs.readFileSync(root + 'rendered-index.json'));
const audit = { checkedAt: new Date().toISOString(), cachedCaptures: index.results.length,
  unversionedGeometry: index.results.filter(r => !r.geometryVersion).length,
  unversionedNavigationPolicy: index.results.filter(r => !r.policyVersion).length,
  findings: ['Legacy firstViewport values are not evidence for precise exposure rates', 'Legacy redirects are not certified by the new policy', 'Screenshots remain historical layout observations, not current task or business validation'] };
index.evidenceQualification = audit;
const flowFolder = root + 'followup-validation/';
audit.unversionedFlowReports = [];
for (const file of fs.readdirSync(flowFolder).filter(n => /^navigation.*\.json$/.test(n))) {
  const value = JSON.parse(fs.readFileSync(flowFolder + file));
  if (!value.policyVersion) {
    value.evidenceQualification = { deprecatedForRedirectVerification: true, reason: 'Initial redirects were not independently checked; retain as historical observations only' };
    fs.writeFileSync(flowFolder + file, JSON.stringify(value, null, 2));
    audit.unversionedFlowReports.push(file);
  }
}
fs.writeFileSync(root + 'rendered-index.json', JSON.stringify(index, null, 2));
fs.writeFileSync(root + 'followup-validation/legacy-evidence-audit.json', JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit));
