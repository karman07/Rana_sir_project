import { parseSort, searchFilter } from './paginate';

const opts = { sortable: ['name', 'createdAt'] };

describe('paginate helpers', () => {
  it('parses whitelisted sort and falls back for unknown fields', () => {
    expect(parseSort('-name', opts)).toEqual({ name: -1 });
    expect(parseSort('name', opts)).toEqual({ name: 1 });
    expect(parseSort('passwordHash', opts)).toEqual({ createdAt: -1 });
    expect(parseSort(undefined, opts)).toEqual({ createdAt: -1 });
  });

  it('escapes regex input in search', () => {
    const f = searchFilter('a.*(b', ['name']) as { $or: { name: RegExp }[] };
    expect(f.$or[0].name.test('a.*(b')).toBe(true);
    expect(f.$or[0].name.test('aXXXb')).toBe(false);
    expect(searchFilter('  ', ['name'])).toEqual({});
  });
});
