import type {
	ICursorPage,
	IExcerptRange,
	IPaginatedItems,
} from '../contracts/interfaces/pagination.interface';

interface IPaginateArgs {
	readonly cursor?: number;
	readonly limit: number;
}

const normalizeCursor = (cursor: number | undefined, total: number): number => {
	if (cursor === undefined || !Number.isFinite(cursor) || cursor < 0)
		return 0;
	return Math.min(Math.trunc(cursor), total);
};

const normalizeLimit = (limit: number): number => {
	if (!Number.isFinite(limit) || limit < 0) return 0;
	return Math.trunc(limit);
};

const buildPage = (
	cursor: number,
	end: number,
	total: number,
): ICursorPage<number> => ({
	cursor,
	nextCursor: end < total ? end : null,
	hasMore: end < total,
});

export function paginateItems<T>(
	items: readonly T[],
	args: IPaginateArgs,
): IPaginatedItems<T, number> {
	const safeCursor = normalizeCursor(args.cursor, items.length);
	const safeLimit = normalizeLimit(args.limit);
	const end = Math.min(safeCursor + safeLimit, items.length);
	return {
		items: items.slice(safeCursor, end),
		page: buildPage(safeCursor, end, items.length),
	};
}

export function paginateFileExcerpt(
	input: string | readonly string[],
	args: IPaginateArgs,
): IPaginatedItems<IExcerptRange, number> {
	const lines = typeof input === 'string' ? input.split(/\r?\n/) : [...input];
	const safeCursor = normalizeCursor(args.cursor, lines.length);
	const safeLimit = normalizeLimit(args.limit);
	const end = Math.min(safeCursor + safeLimit, lines.length);
	return {
		items:
			safeCursor >= end
				? []
				: [
						{
							startLine: safeCursor + 1,
							endLine: end,
							excerpt: lines.slice(safeCursor, end).join('\n'),
						},
					],
		page: buildPage(safeCursor, end, lines.length),
	};
}
