const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Replaces {{var}} with the variable; missing ones render empty. `html` escapes values (templates may contain markup, values may not). */
export function fill(template: string, vars: Record<string, string | undefined>, html: boolean): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k] ?? '';
    return html ? esc(String(v)) : String(v);
  });
}

export const stripHtml = (h: string) =>
  h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();

/** The branded wrapper: cream background, forest-green button, gold accent. Inline styles only (email clients). */
export function layout(opts: { heading: string; bodyHtml: string; ctaLabel?: string; link?: string; preheader?: string }) {
  const cta = opts.ctaLabel && opts.link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="background:#173B2F;border-radius:10px"><a href="${esc(opts.link)}" style="display:inline-block;padding:13px 26px;color:#FFFDF8;font-weight:600;font-size:15px;text-decoration:none">${esc(opts.ctaLabel)}</a></td></tr></table>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F7F4EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18211D">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader ?? opts.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EC"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="padding:0 4px 18px"><span style="display:inline-block;background:#173B2F;color:#FFFDF8;font-weight:700;border-radius:8px;padding:6px 10px;font-size:15px">T<span style="color:#B89A5A">.</span></span> <span style="font-weight:600;font-size:16px;vertical-align:middle;margin-left:6px">Talentbridge</span></td></tr>
<tr><td style="background:#FFFDF8;border:1px solid #E4DED1;border-radius:16px;padding:36px 32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;letter-spacing:-0.01em">${esc(opts.heading)}</h1>
<div style="font-size:15px;line-height:1.65;color:#59635D">${opts.bodyHtml.replace(/<p>/g, '<p style="margin:0 0 14px">')}</div>${cta}
</td></tr>
<tr><td style="padding:20px 8px;font-size:12px;color:#6F766F;line-height:1.6">You are receiving this because of activity on your Talentbridge account.<br/>Connecting exceptional talent with exceptional companies.</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderEmail(tpl: { subject: string; heading: string; body: string; ctaLabel?: string }, vars: Record<string, string | undefined>) {
  const subject = fill(tpl.subject, vars, false).replace(/\s+/g, ' ').trim();
  const heading = fill(tpl.heading, vars, false);
  const bodyHtml = fill(tpl.body, vars, true);
  const html = layout({ heading, bodyHtml, ctaLabel: tpl.ctaLabel, link: vars.link, preheader: stripHtml(bodyHtml).slice(0, 110) });
  const text = `${heading}\n\n${stripHtml(bodyHtml)}${tpl.ctaLabel && vars.link ? `\n\n${tpl.ctaLabel}: ${vars.link}` : ''}\n\n— Talentbridge`;
  return { subject, html, text };
}
