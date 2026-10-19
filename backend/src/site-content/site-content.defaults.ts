export interface SiteContent {
  announcement: { enabled: boolean; text: string; linkLabel: string; linkUrl: string };
  hero: { headline: string; subheadline: string; searchPlaceholder: string; backgroundImage: string; backgroundVideo: string; overlayStrength: number };
  quickLinks: { label: string; query: string }[];
  trustedBy: { enabled: boolean; label: string; companies: { name: string; logo: string; url: string }[] };
  categories: { enabled: boolean; title: string; items: { label: string; query: string; description: string }[] };
  featuredJobs: { title: string; subtitle: string; count: number };
  stats: { show: boolean };
  testimonials: { enabled: boolean; title: string; items: { quote: string; name: string; role: string; company: string }[] };
  faqs: { q: string; a: string }[];
  contact: { email: string; phone: string; address: string; hours: string };
  footer: { tagline: string };
  seo: { title: string; description: string };
}

/** What the public site shows until Admin changes it. Nothing here claims customers, numbers or logos we do not have. */
export const DEFAULT_SITE_CONTENT: SiteContent = {
  announcement: { enabled: false, text: '', linkLabel: '', linkUrl: '' },
  hero: {
    headline: 'Find flexible work that fits your life.',
    subheadline: 'Part-time, hourly and monthly roles from verified companies. Every opening is reviewed, and the pay is shown up front.',
    searchPlaceholder: 'Search jobs by title, skill or city',
    backgroundImage: '', backgroundVideo: '', overlayStrength: 60,
  },
  quickLinks: [
    { label: 'Software Engineering', query: 'Engineer' }, { label: 'Design', query: 'Design' }, { label: 'Data & Analytics', query: 'Data' },
    { label: 'Operations', query: 'Operations' }, { label: 'Marketing', query: 'Marketing' },
  ],
  trustedBy: { enabled: false, label: 'Trusted by:', companies: [] },
  categories: {
    enabled: true, title: 'Explore by category',
    items: [
      { label: 'Engineering', query: 'Engineering', description: 'Backend, frontend, mobile and cloud roles' },
      { label: 'Design', query: 'Design', description: 'Product, UX and brand design' },
      { label: 'Data & Analytics', query: 'Analytics', description: 'Analysts, scientists and engineers' },
      { label: 'Operations', query: 'Operations', description: 'Logistics, supply chain and delivery' },
      { label: 'Marketing', query: 'Marketing', description: 'Growth, content and performance' },
      { label: 'Finance', query: 'Finance', description: 'Accounting, audit and reporting' },
    ],
  },
  featuredJobs: { title: 'Roles open right now', subtitle: 'Every job is reviewed and approved by our team before it appears here.', count: 10 },
  stats: { show: true },
  testimonials: { enabled: false, title: 'What people say', items: [] },
  faqs: [
    { q: 'How does Talentbridge work?', a: 'Companies (or their recruiters) submit a hiring requirement. Our team reviews it and publishes it. Candidates apply, we screen and shortlist, and only the strongest candidates are sent to the company for review, interview and selection.' },
    { q: 'Does it cost anything for candidates?', a: 'No. Candidates never pay to apply, be screened or be placed.' },
    { q: 'How do you decide who is sent to the company?', a: "A member of our team reviews each application against the role's requirements, scores it, and compares candidates side by side before shortlisting. The company only sees candidates we recommend." },
    { q: 'How is pay handled?', a: 'Each job shows whether it pays by the hour or by the month. Pay is calculated and recorded on the platform, so every amount is traceable, and payslips are generated for each pay period.' },
    { q: 'Can a contract change after it is signed?', a: 'Yes — a change is requested, reviewed and, if approved, becomes a new version of the contract. Earlier versions and past payslips are never altered.' },
    { q: "I'm a recruiter. Can I post for several companies?", a: 'Yes. Apply for a recruiter account; once our team approves you, add each client company (also reviewed) and post openings for any of them.' },
  ],
  contact: { email: '', phone: '', address: '', hours: 'Usually within one business day' },
  footer: { tagline: 'Connecting exceptional talent with exceptional companies — with every step, contract and payment kept transparent.' },
  seo: { title: 'Talentbridge — Connecting exceptional talent with exceptional companies', description: 'Talentbridge reviews every opening, screens every applicant and sends companies only the candidates worth interviewing.' },
};
