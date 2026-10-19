import type { QueryFilter, Model, SortOrder } from 'mongoose';
import type { PageMeta, PaginationQueryDto } from '../dto/pagination-query.dto';

export interface PaginateOptions {
  /** Fields a client may sort by. Anything else falls back to `defaultSort`. */
  sortable: string[];
  defaultSort?: string;
  /** Mongoose fields included in free-text search (case-insensitive prefix/contains match). */
  searchFields?: string[];
  select?: string;
  populate?: string | string[];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseSort(sort: string | undefined, o: PaginateOptions): Record<string, SortOrder> {
  const raw = sort ?? o.defaultSort ?? '-createdAt';
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  if (!o.sortable.includes(field)) return { createdAt: -1 };
  return { [field]: desc ? -1 : 1 };
}

export function searchFilter(search: string | undefined, fields: string[] = []) {
  if (!search?.trim() || fields.length === 0) return {};
  const rx = new RegExp(escapeRegex(search.trim()), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

export async function paginate<T>(
  model: Model<T>,
  filter: QueryFilter<T>,
  query: PaginationQueryDto,
  options: PaginateOptions,
): Promise<{ items: T[]; meta: PageMeta }> {
  const where = { ...filter, ...searchFilter(query.search, options.searchFields) } as QueryFilter<T>;
  const sort = parseSort(query.sort, options);
  const skip = (query.page - 1) * query.limit;

  let q = model.find(where).sort(sort).skip(skip).limit(query.limit);
  if (options.select) q = q.select(options.select);
  if (options.populate) q = q.populate(options.populate as string);

  const [items, total] = await Promise.all([q.lean().exec(), model.countDocuments(where).exec()]);
  return {
    items: items as T[],
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}
