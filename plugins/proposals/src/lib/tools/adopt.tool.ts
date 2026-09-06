import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import {
	resolveWorkspaceContained,
	SafeWorkspaceReader,
	safeListDirNames,
	toolError,
	toolOk,
	writeFileAtomic,
} from '@delendai/core/public';

import {
	analyzeProposals,
	buildBootstrapActions,
	type IScanEntry,
} from '../proposals/adopt';
import { PROPOSAL_KINDS } from '../contracts/constants/proposal-glossary.constant';
import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import { migrateForeign } from '../proposals/migrate-foreign';
import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import type { IAuthoringToolOptions } from './authoring.tool';
import {
	proposalFoldersForPolicy,
	type IProposalFolderPolicy,
} from '../contracts/proposal-folder-policy';

// l00008 s4 — mirrors `PROPOSALS_LAYOUT` (proposals/adopt.ts): a static
// documentation object, not the runtime `IHostPathLayout`. `files`/
// `folders` are label → human-readable-description maps.
const ADOPT_LAYOUT_SCHEMA = z.object({
	root: z.string(),
	files: z.record(z.string(), z.string()),
	folders: z.record(z.string(), z.string()),
});

type ILightFrontmatter = {
	id?: string;
	status?: string;
	type?: string;
	kind?: string;
} | null;

/** Extract id/status/type/kind from a markdown file's leading frontmatter block. */
const lightFrontmatter = (text: string): ILightFrontmatter => {
	const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
	if (block === undefined) return null;
	const field = (key: string): string | undefined =>
		block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
	const fm: {
		id?: string;
		status?: string;
		type?: string;
		kind?: string;
	} = {};
	const id = field('id');
	const status = field('status');
	const type = field('type');
	const kind = field('kind');
	if (id !== undefined) fm.id = id;
	if (status !== undefined) fm.status = status;
	if (type !== undefined) fm.type = type;
	if (kind !== undefined) fm.kind = kind;
	return fm;
};

/**
 * Recursively read a proposals directory into scan entries. Top-level
 * directories become `folders`; `.md` files nested under status folders
 * surface with their proposals-root-relative path (e.g. `done/f00100-x.md`)
 * so the analysis can classify them by folder (x00209 — the old scan only
 * saw the top level and misread every canonical store).
 */
const scanDir = async (dirAbs: string): Promise<IScanEntry[]> => {
	const entries: IScanEntry[] = [];
	const reader = new SafeWorkspaceReader(dirAbs);
	const walk = async (abs: string, relPrefix: string): Promise<void> => {
		// x00509 / B19: distinguish "empty directory" from "couldn't
		// read it" so an EACCES on the legacy workspace during
		// `delendai_adopt` no longer produces an empty bootstrap.
		const { names } = await safeListDirNames(abs);
		for (const name of names) {
			const absPath = join(abs, name);
			const rel = relPrefix === '' ? name : `${relPrefix}/${name}`;
			const isDir = await stat(absPath)
				.then((s) => s.isDirectory())
				.catch(() => false);
			if (isDir) {
				if (relPrefix === '') entries.push({ name: rel, isDir: true });
				await walk(absPath, rel);
			} else if (name.toLowerCase().endsWith('.md')) {
				const text = await reader
					.readText(rel)
					.then((v) => v.content)
					.catch(() => '');
				entries.push({
					name: rel,
					isDir: false,
					frontmatter: lightFrontmatter(text),
				});
			} else if (relPrefix === '') {
				// Top-level non-markdown files are "other"; nested ones
				// (e.g. `.gitkeep` inside status folders) are noise.
				entries.push({ name: rel, isDir: false });
			}
		}
	};
	await walk(dirAbs, '');
	return entries.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * f00116 S1: execute the bootstrap actions against `dirAbs`. Existing
 * files are skipped (a hand-rolled README wins); missing ones are
 * written atomically. Returns what happened, path by path.
 */
export const bootstrapProposalsStore = async (
	dirAbs: string,
	folderPolicy?: IProposalFolderPolicy,
): Promise<{ created: string[]; skipped: string[] }> => {
	const created: string[] = [];
	const skipped: string[] = [];
	for (const action of buildBootstrapActions(
		proposalFoldersForPolicy(folderPolicy),
	)) {
		const abs = join(dirAbs, ...action.rel.split('/'));
		const exists = await access(abs).then(
			() => true,
			() => false,
		);
		if (exists) {
			skipped.push(action.rel);
			continue;
		}
		// writeFileAtomic creates the parent folder itself.
		await writeFileAtomic(abs, action.content);
		created.push(action.rel);
	}
	return { created, skipped };
};

/**
 * `proposal_adopt` — make an existing proposals folder followable. Returns the
 * canonical layout (so the agent knows the convention) plus a scan of the real
 * folder (which files are proposals/fixes, which are done, what's missing) and
 * an actionable plan to bring it in line. Analysis-only by default; with
 * `apply: true` it EXECUTES the bootstrap (f00116 S1).
 */
export const buildAdoptRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'proposal_adopt',
	summary:
		'Analyze an existing proposals folder — and with apply:true, bootstrap the canonical store (folders + README + index).',
	tags: ['proposals', 'orientation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_adopt`,
			{
				description:
					'Make a proposals folder followable. Returns the canonical layout (index.json, README, status folders), a scan of the actual folder (proposals/fixes with status, subfolders, files without proposal frontmatter, missing index/README) and an ordered plan to organize it for delendai. Analysis-only by default; pass `apply: true` to EXECUTE the bootstrap: create the 7 status folders (+.gitkeep), seed a README (existing files are never overwritten) and rebuild the index — idempotent, atomic. Pass `dir` (workspace-relative) to target a folder other than the configured proposals dir.',
				inputSchema: z.object({
					dir: z.string().optional(),
					apply: z.boolean().optional(),
					// f00116 S3: convert foreign schemes (rfc docs, TODO
					// checklists, ad-hoc frontmatter) from these
					// workspace-relative roots into canonical proposals.
					migrate: z
						.object({ roots: z.array(z.string()).min(1) })
						.optional(),
				}),
				outputSchema: z.object({
					ok: z.literal(true),
					root: z.string(),
					layout: ADOPT_LAYOUT_SCHEMA,
					scan: z.object({
						proposals: z.array(
							z.object({
								file: z.string(),
								id: z.string(),
								kind: z.enum(
									Object.keys(PROPOSAL_KINDS) as [
										string,
										...string[],
									],
								),
								status: z.string(),
							}),
						),
						folders: z.array(z.string()),
						hasIndex: z.boolean(),
						hasReadme: z.boolean(),
						unrecognized: z.array(z.string()),
						other: z.array(z.string()),
					}),
					plan: z.array(z.string()),
					ready: z.boolean(),
					applied: z.boolean(),
					created: z.array(z.string()),
					skipped: z.array(z.string()),
					migration: z
						.object({
							migrated: z.array(
								z.object({
									source: z.string(),
									target: z.string(),
									id: z.string(),
									title: z.string(),
								}),
							),
							skipped: z.array(
								z.object({
									source: z.string(),
									reason: z.string(),
								}),
							),
						})
						.optional(),
				}),
			},
			async (args: {
				dir?: string | undefined;
				apply?: boolean | undefined;
				migrate?: { roots: string[] } | undefined;
			}) => {
				let dirAbs = options.proposalsDirAbs;
				let root = options.proposalsDirAbs;
				if (args.dir !== undefined && args.dir.length > 0) {
					const contained = resolveWorkspaceContained(
						options.workspaceRoot,
						args.dir,
					);
					if (!contained.ok) {
						return toolError(
							contained.reason ?? 'dir escapes the workspace',
						);
					}
					dirAbs = contained.abs;
					root = args.dir;
				}
				// x00209: a custom `dir` must drive migration AND the index
				// sync too — the old code always wrote to the configured
				// proposals dir, leaving a custom-dir adoption half-done.
				const customDir =
					args.dir !== undefined && args.dir.length > 0
						? args.dir
						: undefined;
				const syncLayout:
					| Pick<
							IHostPathLayout,
							'proposalsDir' | 'proposalIndexFile'
					  >
					| undefined =
					customDir !== undefined
						? {
								proposalsDir: customDir,
								proposalIndexFile:
									options.layout?.proposalIndexFile ??
									DEFAULT_PATH_LAYOUT.proposalIndexFile,
							}
						: options.layout;

				let created: string[] = [];
				let skipped: string[] = [];
				if (args.apply === true) {
					({ created, skipped } = await bootstrapProposalsStore(
						dirAbs,
						options.folderPolicy,
					));
				}

				// f00116 S3: apply + migrate compose in one call — the
				// bootstrap guarantees the folders the migration writes to.
				let migration:
					| Awaited<ReturnType<typeof migrateForeign>>
					| undefined;
				if (args.migrate !== undefined) {
					migration = await migrateForeign({
						workspaceRoot: options.workspaceRoot,
						proposalsDirAbs: dirAbs,
						counterPathAbs: options.counterPathAbs,
						roots: args.migrate.roots,
						removeMigratedSources: args.migrate.roots.some((root) =>
							/(?:^|\/)audits(?:\/|$)/u.test(root),
						),
					});
				}

				if (args.apply === true || migration !== undefined) {
					// The index is part of the canonical store — rebuild it
					// as the last mutating step (idempotent by design).
					await syncProposalRegistry(
						options.workspaceRoot,
						syncLayout,
						options.extraFolders ?? [],
						undefined,
						options.folderPolicy,
					);
				}

				// x00209: the registry index is a cache artefact
				// (<cacheDir>/proposals/index.json), not a file in this
				// folder — probe the real absolute location (x00052).
				const indexPresent = await access(options.indexPathAbs).then(
					() => true,
					() => false,
				);

				const entries = await scanDir(dirAbs);
				const report = analyzeProposals(root, entries, indexPresent);
				return toolOk({
					...report,
					applied: args.apply === true,
					created,
					skipped,
					...(migration !== undefined ? { migration } : {}),
				});
			},
		);
	},
});
