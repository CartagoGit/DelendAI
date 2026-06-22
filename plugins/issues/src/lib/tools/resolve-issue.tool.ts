/**
 * `<prefix>_issues_resolve` — mutates a scaffold's frontmatter to record
 * the host's decision (`resolution`, `proposals`, `dismiss_reason`).
 *
 * Single Responsibility: this tool only mutates an *existing* scaffold
 * — it never creates one (use `issues_ingest`/`issues_analyze` first;
 * a missing scaffold is a hard error here, not an auto-ingest, since
 * resolving an issue that was never analysed is almost certainly a
 * caller mistake). Reuses `findExistingScaffoldFile`/`readScaffoldFile`
 * from `ingest-issue.tool.ts` so the "look up the scaffold file for
 * issue #n" logic is never duplicated.
 *
 * `resolution: 'dismissed'` requires a non-empty `dismissReason` —
 * rejected with a clear error otherwise, so a dismissal always leaves
 * a reason a human can read back later.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { parseScaffold, serializeScaffold } from '../issue-scaffold';
import { findExistingScaffoldFile } from './ingest-issue.tool';

export interface IResolveIssueToolOptions {
	readonly namespacePrefix: string;
	readonly scaffoldDirAbs: string;
}

export type IIssueResolution = 'promoted' | 'promoted-multiple' | 'dismissed';

export interface IResolveIssueArgs {
	readonly number: number;
	readonly resolution: IIssueResolution;
	readonly proposalIds?: readonly string[] | undefined;
	readonly dismissReason?: string | undefined;
}

const SCAFFOLD_FRONTMATTER_SCHEMA = z.object({
	source: z.literal('github'),
	source_id: z.number(),
	source_url: z.string(),
	source_author: z.string(),
	ingested_at: z.string(),
	status: z.enum(['ingested', 'analyzed']),
	resolution: z.enum([
		'pending',
		'promoted',
		'promoted-multiple',
		'dismissed',
	]),
	proposals: z.array(z.string()),
	dismiss_reason: z.string().optional(),
	comments: z.array(
		z.object({
			author: z.string(),
			body: z.string(),
			createdAt: z.string(),
			url: z.string(),
		}),
	),
});

const SCAFFOLD_REF_SCHEMA = z.object({
	filePath: z.string(),
	frontmatter: SCAFFOLD_FRONTMATTER_SCHEMA,
});

const RESOLVE_ISSUE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	filePath: z.string().optional(),
	scaffold: SCAFFOLD_REF_SCHEMA.optional(),
});

export const runResolveIssue = async (
	args: IResolveIssueArgs,
	options: IResolveIssueToolOptions,
) => {
	if (args.resolution === 'dismissed') {
		const reason = (args.dismissReason ?? '').trim();
		if (reason === '') {
			return toolError(
				'resolution "dismissed" requires a non-empty dismissReason',
				'Call issues_resolve again with a dismissReason explaining why.',
			);
		}
	}

	try {
		const fileName = await findExistingScaffoldFile(
			options.scaffoldDirAbs,
			args.number,
		);
		if (fileName === null) {
			return toolError(
				`no scaffold found for issue #${args.number}`,
				'Call issues_ingest or issues_analyze first.',
			);
		}
		const filePath = join(options.scaffoldDirAbs, fileName);

		let updatedFrontmatter:
			| ReturnType<typeof parseScaffold>['frontmatter']
			| undefined;
		await withFileMutex(filePath, async () => {
			const raw = await readFile(filePath, 'utf8');
			const scaffold = parseScaffold(raw);
			const dismissReason = args.dismissReason?.trim();
			const frontmatter = {
				...scaffold.frontmatter,
				resolution: args.resolution,
				proposals: args.proposalIds ?? [],
				...(dismissReason !== undefined && dismissReason !== ''
					? { dismiss_reason: dismissReason }
					: {}),
			};
			const updated = { ...scaffold, frontmatter };
			await writeFileAtomic(filePath, serializeScaffold(updated));
			updatedFrontmatter = frontmatter;
		});

		if (updatedFrontmatter === undefined) {
			// Unreachable: `withFileMutex` either assigns it or throws, and a
			// throw is caught below. Guard kept so the type stays non-optional
			// for the schema-shaped return below (no `as` cast needed).
			return toolError('internal error: scaffold was not updated');
		}

		return toolOk({
			filePath,
			scaffold: { filePath, frontmatter: updatedFrontmatter },
		});
	} catch (error) {
		return toolError(
			error instanceof Error ? error.message : String(error),
			'Check the issue number and that a scaffold already exists.',
		);
	}
};

/** Registration for `<prefix>_issues_resolve`. */
export const buildResolveIssueRegistration = (
	options: IResolveIssueToolOptions,
): IToolRegistration => ({
	id: 'issues_resolve',
	effects: ['write'],
	tags: ['issues'],
	summary:
		"Mutate a scaffold's frontmatter to record the host's promote/dismiss decision.",
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_resolve`,
			{
				outputSchema: RESOLVE_ISSUE_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Mutates an existing scaffold\'s frontmatter (resolution, proposals, dismiss_reason). resolution:"dismissed" requires dismissReason.',
				inputSchema: z.object({
					number: z.number(),
					resolution: z.enum([
						'promoted',
						'promoted-multiple',
						'dismissed',
					]),
					proposalIds: z.array(z.string()).optional(),
					dismissReason: z.string().optional(),
				}),
			},
			async (args: IResolveIssueArgs) => runResolveIssue(args, options),
		);
	},
});
