export interface ICursorPage<TCursor extends number | string = number> {
	readonly cursor: TCursor;
	readonly nextCursor: TCursor | null;
	readonly hasMore: boolean;
}

export interface IPaginatedItems<T, TCursor extends number | string = number> {
	readonly items: readonly T[];
	readonly page: ICursorPage<TCursor>;
}

export interface IExcerptRange {
	readonly startLine: number;
	readonly endLine: number;
	readonly excerpt: string;
}
