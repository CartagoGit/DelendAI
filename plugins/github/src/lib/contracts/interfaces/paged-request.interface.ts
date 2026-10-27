/**
 * paged-request.interface.ts — what gathering a paged collection needs of
 * the GitHub client: one request, and whether the forge says more follow.
 */
import type z from 'zod';

export interface IPagedRequester {
	readonly request: (request: {
		readonly path: string;
		readonly query: Readonly<Record<string, number>>;
		readonly responseSchema: z.ZodType<Record<string, unknown>>;
	}) => Promise<{
		readonly data: unknown;
		readonly meta: {
			readonly pagination?: { readonly hasMore?: boolean } | null;
		};
	}>;
}
