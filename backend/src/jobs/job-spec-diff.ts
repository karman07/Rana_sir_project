const LABELS: Record<string, string> = {
  title: 'Title', department: 'Department', location: 'Location', workMode: 'Work mode', employmentType: 'Employment type', openings: 'Openings',
  'requirements.experienceMin': 'Min experience', 'requirements.experienceMax': 'Max experience', 'requirements.education': 'Education',
  'requirements.technicalSkills': 'Technical skills', 'requirements.softSkills': 'Soft skills', 'requirements.certifications': 'Certifications', 'requirements.languages': 'Languages',
  'compensation.salaryMin': 'Pay from', 'compensation.salaryMax': 'Pay to', 'compensation.currency': 'Currency', 'compensation.payBasis': 'Pay basis', 'compensation.payFrequency': 'Paid', 'compensation.hoursPerWeek': 'Hours per week',
  'compensation.benefits': 'Benefits', 'compensation.bonus': 'Bonus',
  'contract.durationMonths': 'Duration (months)', 'contract.probationMonths': 'Probation (months)', 'contract.workingHours': 'Working hours', 'contract.noticePeriodDays': 'Notice period (days)', 'contract.renewalTerms': 'Renewal terms',
  'details.description': 'Description', 'details.responsibilities': 'Responsibilities', 'details.requirementsText': 'Requirements', 'details.specialInstructions': 'Special instructions', 'details.requiredDocuments': 'Required documents',
};

const flatten = (o: any, prefix = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    if (k === '_id' || k === '__v') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
};

const norm = (v: unknown) => (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

/** Which fields differ between two versions of an opening, with readable names. */
export function diffSpec(before: unknown, after: unknown) {
  const a = flatten(JSON.parse(JSON.stringify(before ?? {}))), b = flatten(JSON.parse(JSON.stringify(after ?? {})));
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => !same(a[k], b[k]))
    .sort()
    .map((field) => ({ field, label: LABELS[field] ?? field, from: norm(a[field]), to: norm(b[field]) }));
}
