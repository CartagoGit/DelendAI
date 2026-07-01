/**
 * `<prefix>_issues_ingest` — idempotently persists a GitHub issue as a
 * scaffold file under `scaffoldDirAbs`
 * (`docs/mcp-vertex/proposals/retired/issues/github#<n>-<slug>.md`).
 *
 * Single Responsibility: this is the only tool module that *writes* a
 * fresh scaffold from GitHub data. `issues_analyze` and `issues_resolve`
 * never duplicate this write path — they import
 * {@link findExistingScaffoldFile}, {@link readScaffoldFile} and
 * {@link ingestIssue} from here.
 *
 * Idempotency: when a scaffold for `number` already exists and
 * `force` is not `true`, the existing file is returned untouched
 * (`alreadyExisted: true`). `force: true` always re-fetches from
 * GitHub and rewrites — useful when the issue was edited upstream.
 *
 * Workspace/path safety: the on-disk file name is always derived via
 * `buildScaffoldFileName` (S2), whose `slugify` strips everything but
 * `[a-z0-9-]` from the issue title — so even an adversarial title
 * (e.g. containing `../../etc/passwd`) can never produce a path that
 * escapes `scaffoldDirAbs`. The file name is joined with `node:path`'s
 * `join`, never string concatenation. `scaffoldDirAbs` itself is
 * resolved once, workspace-contained, by the plugin's `register()`
 * (see `src/index.ts`) before being threaded down to this module.
 */
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type { IGithubIssueDetail, IIssueScaffold } from '../contracts';
import {
	buildScaffold,
	buildScaffoldFileName,
	parseScaffold,
	serializeScaffold,
} from '../issue-scaffold';
import type { IGithubClient } from './list-issues.tool';

export interface IIngestIssueToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
	readonly scaffoldDirAbs: string;
}

export interface IIngestIssueArgs {
	readonly number: number;
	readonly force?: boolean | undefined;
}

export interface IScaffoldFileRef {
	readonly filePath: string;
	readonly fileName: string;
	readonly scaffold: IIssueScaffold;
}

export interface IIngestResult extends IScaffoldFileRef {
	readonly alreadyExisted: boolean;
}

/** Lists existing scaffold file names already on disk (collision-avoidance + lookup). */
const listExistingFileNames = async (
	scaffoldDirAbs: string,
): Promise<ReadonlySet<string>> => {
	const entries = await readdir(scaffoldDirAbs, {
		withFileTypes: true,
	}).catch(() => []);
	return new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
};

/** Finds the existing scaffold file for issue `number`, if any (`github#<n>-*.md` prefix match). */
export const findExistingScaffoldFile = async (
	scaffoldDirAbs: string,
	number: number,
): Promise<string | null> => {
	const existing = await listExistingFileNames(scaffoldDirAbs);
	const prefix = `github#${number}-`;
	for (const name of existing) {
		if (name.startsWith(prefix) && name.endsWith('.md')) return name;
	}
	return null;
};

/** Reads + parses an existing scaffold file by file name (already validated to live under `scaffoldDirAbs`). */
export const readScaffoldFile = async (
	scaffoldDirAbs: string,
	fileName: string,
): Promise<IScaffoldFileRef> => {
	const filePath = join(scaffoldDirAbs, fileName);
	const raw = await readFile(filePath, 'utf8');
	return { filePath, fileName, scaffold: parseScaffold(raw) };
};

/**
 * Writes a fresh scaffold for `issueDetail`, guarded by `withFileMutex`
 * + `writeFileAtomic` so concurrent ingests of the same issue cannot
 * corrupt the file. The file name is computed fresh (collision-checked
 * against the directory's current contents).
 */
export const writeNewScaffold = async (
	scaffoldDirAbs: string,
	issueDetail: IGithubIssueDetail,
): Promise<IScaffoldFileRef> => {
	await mkdir(scaffoldDirAbs, { recursive: true });
	const existing = await listExistingFileNames(scaffoldDirAbs);
	const fileName = buildScaffoldFileName(
		issueDetail.number,
		issueDetail.title,
		existing,
	);
	const filePath = join(scaffoldDirAbs, fileName);
	const scaffold = buildScaffold(issueDetail, issueDetail.comments);
	await withFileMutex(filePath, async () => {
		await writeFileAtomic(filePath, serializeScaffold(scaffold));
	});
	return { filePath, fileName, scaffold };
};

/**
 * Idempotent ingest: returns the existing scaffold for `number` unless
 * `force` is `true` or none exists yet, in which case it fetches via
 * `githubClient` and writes a fresh one. This is the single write path
 * shared by `issues_ingest` and `issues_analyze`'s auto-ingest fallback
 * (see `loadOrIngestScaffold`).
 */
export const ingestIssue = async (
	scaffoldDirAbs: string,
	githubClient: IGithubClient,
	number: number,
	force: boolean,
): Promise<IIngestResult> => {
	if (!force) {
		const existingFileName = await findExistingScaffoldFile(
			scaffoldDirAbs,
			number,
		);
		if (existingFileName !== null) {
			const ref = await readScaffoldFile(
				scaffoldDirAbs,
				existingFileName,
			);
			return { ...ref, alreadyExisted: true };
		}
	}
	const { data } = await githubClient.fetchIssue(number);
	const ref = await writeNewScaffold(scaffoldDirAbs, data);
	return { ...ref, alreadyExisted: false };
};

/**
 * Loads the scaffold for `number`, auto-ingesting (force: false) if none
 * exists yet. Used by `issues_analyze`, which never writes a *new*
 * ingest itself — it only reads or delegates to `ingestIssue`.
 */
export const loadOrIngestScaffold = async (
	scaffoldDirAbs: string,
	githubClient: IGithubClient,
	number: number,
): Promise<IIngestResult> =>
	ingestIssue(scaffoldDirAbs, githubClient, number, false);

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

const INGEST_ISSUE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	filePath: z.string().optional(),
	scaffold: SCAFFOLD_REF_SCHEMA.optional(),
	alreadyExisted: z.boolean().optional(),
});

export const runIngestIssue = async (
	args: IIngestIssueArgs,
	options: IIngestIssueToolOptions,
) => {
	try {
		const result = await ingestIssue(
			options.scaffoldDirAbs,
			options.githubClient,
			args.number,
			args.force ?? false,
		);
		return toolOk({
			filePath: result.filePath,
			scaffold: {
				filePath: result.filePath,
				frontmatter: result.scaffold.frontmatter,
			},
			alreadyExisted: result.alreadyExisted,
		});
	} catch (error) {
		return toolError(
			error instanceof Error ? error.message : String(error),
			'Check the issue number / repo configuration / gh auth status.',
		);
	}
};

/** Registration for `<prefix>_issues_ingest`. */
export const buildIngestIssueRegistration = (
	options: IIngestIssueToolOptions,
): IToolRegistration => ({
	id: 'issues_ingest',
	effects: ['write'],
	tags: ['issues'],
	summary: 'Idempotently persist a GitHub issue as a durable scaffold file.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_ingest`,
			{
				outputSchema: INGEST_ISSUE_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Idempotently persists a GitHub issue as a scaffold file under docs/mcp-vertex/proposals/retired/issues/. force:true re-fetches and rewrites.',
				inputSchema: z.object({
					number: z.number(),
					force: z.boolean().optional(),
				}),
			},
			async (args: IIngestIssueArgs) => runIngestIssue(args, options),
		);
	},
});
