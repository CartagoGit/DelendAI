import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	resolveWorkspaceContained,
	toolError,
	toolOk,
} from '@mcp-vertex/core/public';

import { analyzeProposals, type IScanEntry } from '../proposals/adopt';
import type { IAuthoringToolOptions } from './authoring.tool';

// l125 s4 — mirrors `PROPOSALS_LAYOUT` (proposals/adopt.ts): a static
// documentation object, not the runtime `IHostPathLayout`. `files`/
// `folders` are label → human-readable-description maps.
const ADOPT_LAYOUT_SCHEMA = z.object({
	root: z.string(),
	files: z.record(z.string(), z.string()),
	folders: z.record(z.string(), z.string()),
});

type ILightFrontmatter = { id?: string; status?: string; type?: string } | null;

/** Extract id/status/type from a markdown file's leading frontmatter block. */
const lightFrontmatter = (text: string): ILightFrontmatter => {
	const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
	if (block === undefined) return null;
	const field = (key: string): string | undefined =>
		block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
	const fm: { id?: string; status?: string; type?: string } = {};
	const id = field('id');
	const status = field('status');
	const type = field('type');
	if (id !== undefined) fm.id = id;
	if (status !== undefined) fm.status = status;
	if (type !== undefined) fm.type = type;
	return fm;
};

/** Read a proposals directory into scan entries (dirs + .md frontmatter). */
const scanDir = async (dirAbs: string): Promise<IScanEntry[]> => {
	const names = await readdir(dirAbs).catch(() => [] as string[]);
	const entries: IScanEntry[] = [];
	for (const name of names) {
		const isDir = await stat(join(dirAbs, name))
			.then((s) => s.isDirectory())
			.catch(() => false);
		if (!isDir && name.toLowerCase().endsWith('.md')) {
			const text = await readFile(join(dirAbs, name), 'utf8').catch(
				() => '',
			);
			entries.push({
				name,
				isDir: false,
				frontmatter: lightFrontmatter(text),
			});
		} else {
			entries.push({ name, isDir });
		}
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * `proposal_adopt` — make an existing proposals folder followable. Returns the
 * canonical layout (so the agent knows the convention) plus a scan of the real
 * folder (which files are proposals/fixes, which are done, what's missing) and
 * an actionable plan to bring it in line. Read-only: it advises; the agent acts.
 */
export const buildAdoptRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => ({
	id: 'proposal_adopt',
	summary:
		'Analyze an existing proposals folder: canonical layout + scan + a plan to organize it for mcp-vertex.',
	tags: ['proposals', 'orientation'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_adopt`,
			{
				description:
					'Make a proposals folder followable. Returns the canonical layout (index.json, README, p<N>/f<N> files, done/ + host buckets), a scan of the actual folder (proposals/fixes with status, subfolders, files without proposal frontmatter, missing index/README) and an ordered plan to organize it for mcp-vertex. Read-only — it advises; you run the steps. Pass `dir` (workspace-relative) to analyze a folder other than the configured proposals dir.',
				inputSchema: z.object({ dir: z.string().optional() }),
				outputSchema: z.object({
					ok: z.literal(true),
					root: z.string(),
					layout: ADOPT_LAYOUT_SCHEMA,
					scan: z.object({
						proposals: z.array(
							z.object({
								file: z.string(),
								id: z.string(),
								kind: z.enum(['proposal', 'fix']),
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
				}),
			},
			async (args: { dir?: string | undefined }) => {
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
				const entries = await scanDir(dirAbs);
				const report = analyzeProposals(root, entries);
				return toolOk({ ...report });
			},
		);
	},
});
