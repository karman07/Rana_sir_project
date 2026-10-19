import { sanitize } from './sanitize.middleware';

describe('sanitize', () => {
  it('strips operator and dotted keys recursively', () => {
    const input = { email: { $ne: null }, ok: 'x', nested: [{ $where: '1', fine: 1, 'a.b': 2 }] };
    expect(sanitize(input)).toEqual({ email: {}, ok: 'x', nested: [{ fine: 1 }] });
  });
});
