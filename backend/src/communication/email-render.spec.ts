import { DEFAULT_TEMPLATES } from './email-templates.defaults';
import { fill, renderEmail } from './email-render';

describe('email rendering', () => {
  it('fills variables and escapes values in HTML only', () => {
    expect(fill('Hi {{name}}', { name: '<b>Eve</b>' }, true)).toBe('Hi &lt;b&gt;Eve&lt;/b&gt;');
    expect(fill('Hi {{name}}', { name: '<b>Eve</b>' }, false)).toBe('Hi <b>Eve</b>');
    expect(fill('Hi {{ name }}{{missing}}!', { name: 'Eve' }, true)).toBe('Hi Eve!');
  });

  it('wraps the body in the branded layout with a button, and a plain-text alternative', () => {
    const r = renderEmail({ subject: 'Hello {{name}}', heading: 'Hi {{name}}', body: '<p>Welcome <strong>{{name}}</strong></p>', ctaLabel: 'Open' }, { name: 'Eve', link: 'https://x.test/a?b=1&c=2' });
    expect(r.subject).toBe('Hello Eve');
    expect(r.html).toContain('#173B2F');
    expect(r.html).toContain('href="https://x.test/a?b=1&amp;c=2"');
    expect(r.text).toContain('Welcome Eve');
    expect(r.text).toContain('Open: https://x.test/a?b=1&c=2');
  });

  it('cannot inject markup through variables', () => {
    const r = renderEmail({ subject: 's', heading: 'h', body: '<p>{{reason}}</p>' }, { reason: '<script>alert(1)</script>' });
    expect(r.html).not.toContain('<script>');
  });

  it('ships every template the spec asks for, with unique keys', () => {
    const keys = DEFAULT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ['welcome', 'account-verification', 'job-submitted', 'job-approved', 'job-changes-requested', 'application-received', 'application-shortlisted', 'candidate-sent-to-recruiter', 'recruiter-approved-candidate', 'recruiter-rejected-candidate', 'interview-scheduled', 'interview-rescheduled', 'interview-cancelled', 'candidate-selected', 'candidate-rejected', 'contract-created', 'contract-updated', 'payment-received', 'payment-pending', 'salary-delayed', 'salary-paid', 'payslip-generated', 'general-announcement']) {
      expect(keys).toContain(k);
    }
  });

  it('only uses variables each template declares', () => {
    for (const t of DEFAULT_TEMPLATES) {
      const used = [...(t.subject + t.heading + t.body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
      for (const v of used) expect({ key: t.key, v, declared: t.variables.includes(v) }).toEqual({ key: t.key, v, declared: true });
    }
  });
});
