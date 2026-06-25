/**
 * f00046 S6 — docs search command. Delegates 1:1 to `mcp-vertex_docs_docs_search`.
 * (`docs list` / `docs read` remain inline in the registry; this group
 * adds the free-text search verb.)
 *
 * Tools mapped:
 *   - `mcp-vertex_docs_docs_search` ({ query, include?, limit? })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	listArg,
	numberArg,
	positionalArg,
	request,
	usage,
} from './group-helpers';

const docsSearchCommand: ICliCommand = {
	name: 'docs search',
	summary: 'Search project documentation by free text (ranked hits).',
	async run(args, ctx) {
		const query = positionalArg(args);
		if (query === undefined) {
			return usage(
				'docs search <query> [--include=glob,glob] [--limit=N]',
			);
		}
		const include = listArg(args, 'include');
		const limit = numberArg(args, 'limit') ?? numberArg(args, 'max');
		return data(
			await request(ctx, 'mcp-vertex_docs_docs_search', {
				query,
				...(include !== undefined ? { include } : {}),
				...(limit !== undefined ? { limit } : {}),
			}),
		);
	},
};

export const docsCommands: readonly ICliCommand[] = [docsSearchCommand];
