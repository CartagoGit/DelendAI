/**
 * f00123 S2 — `refactor_rename`, `refactor_apply` tool registrations.
 *
 * `refactor_rename` plans a rename (dry-run by default) and returns a diff.
 * `refactor_apply` writes the diff via containment + consent token echo.
 *
 * x00184 (F17/F18): `root`/`scopePaths`/`file.path` used to be resolved by
 * a local `resolvePath` that passed an absolute path straight through
 * (`if (path.startsWith('/')) return path;`) — a hostile `root` (or
 * `file.path`) escaped the workspace entirely, and `isPathInRoot`'s
 * containment check ran against that already-hostile `rootAbs`. Every
 * path is now routed through the shared `resolveWorkspaceContained`,
 * which rejects absolute paths and `..`-escapes lexically.
 *
 * The write path uses `writeFileAtomic` from `@mcp-vertex/core/public`
 * (temp + rename, crash-safe) so a half-finished write never tears the
 * file. The previous raw `await writeFile(` pattern tripped the
 * plugin-drift budget lint; this is the structural fix.
 */
import z from 'zod';

import { basename, dirname } from 'node:path';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	SafeWorkspaceReader,
	resolveWorkspaceContained,
	toolError,
	toolJson,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import {
	planRename,
	type IFileReader,
	type IHunk,
	type IRenameRequest,
} from '../rename/rename-planner';

export interface IRefactorRenameToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly readFile?: IFileReader;
	/** Injectable atomic writer (only the apply tool uses it). */
	readonly writeFileAtomic?: (
		absPath: string,
		content: string,
	) => Promise<void>;
}

const hunkSchema = z.object({
	oldStart: z.number().int().positive(),
	oldLines: z.number().int().nonnegative(),
	newStart: z.number().int().positive(),
	newLines: z.number().int().nonnegative(),
	lines: z.array(
		z.object({
			kind: z.enum([' ', '-', '+']),
			text: z.string(),
		}),
	),
});

const filePlanSchema = z.object({
	path: z.string(),
	before: z.string(),
	after: z.string(),
	hunks: z.array(hunkSchema),
});

const RENAME_OUTPUT_SCHEMA = z.object({
	files: z.array(filePlanSchema),
	totalEdits: z.number().int().nonnegative(),
	ambiguous: z
		.array(
			z.object({
				path: z.string(),
				line: z.number().int().positive(),
				candidates: z.array(
					z.object({
						line: z.number().int().positive(),
						scope: z.string(),
					}),
				),
			}),
		)
		.optional(),
});

const APPLY_OUTPUT_SCHEMA = z.object({
	written: z.array(z.string()),
	gateCommand: z.string(),
	consentToken: z.string(),
});

export const buildRefactorRenameToolRegistrations = (
	options: IRefactorRenameToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const read: IFileReader =
		options.readFile ??
		(async (p: string) =>
			(await new SafeWorkspaceReader(dirname(p)).readText(basename(p)))
				.content);
	const write =
		options.writeFileAtomic ??
		((p: string, c: string) => writeFileAtomic(p, c));

	return [
		{
			id: 'refactor_rename',
			summary:
				'Scoped multi-file rename planner (AST-safe, dry-run-first).',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_rename`,
					{
						description:
							'Plan a rename of `from` → `to` across one or more files in `scopePaths` (or the entire `root` if omitted). Returns a unified diff with hunks. Pure planner — no disk writes. Set `dryRun: false` to confirm intent (still no writes here; use `refactor_apply` to write).',
						inputSchema: z.object({
							root: z.string().min(1),
							from: z.string().min(1),
							to: z.string().min(1),
							scopePaths: z.array(z.string()).optional(),
							requireKind: z
								.enum(['function', 'class', 'variable', 'type'])
								.optional(),
							dryRun: z.boolean().optional(),
						}),
						outputSchema: RENAME_OUTPUT_SCHEMA,
					},
					async (args) => {
						const containedRoot = resolveWorkspaceContained(
							options.workspaceRootAbs,
							args.root,
						);
						if (!containedRoot.ok) {
							return toolError(
								`root "${args.root}" is not allowed`,
								containedRoot.reason ??
									'root must be a workspace-relative path.',
							);
						}
						const scopePaths: string[] = [];
						if (args.scopePaths !== undefined) {
							for (const p of args.scopePaths) {
								const contained = resolveWorkspaceContained(
									options.workspaceRootAbs,
									p,
								);
								if (!contained.ok) {
									return toolError(
										`scopePaths entry "${p}" is not allowed`,
										contained.reason ??
											'scopePaths entries must be workspace-relative paths.',
									);
								}
								scopePaths.push(contained.abs);
							}
						}
						const req: IRenameRequest = {
							root: containedRoot.abs,
							from: args.from,
							to: args.to,
							...(args.scopePaths !== undefined
								? { scopePaths }
								: {}),
							...(args.requireKind !== undefined
								? { requireKind: args.requireKind }
								: {}),
							...(args.dryRun !== undefined
								? { dryRun: args.dryRun }
								: {}),
						};

						const result = await planRename(req, read);
						if (!result.ok) {
							return toolError(result.code, result.detail);
						}

						return toolJson({
							files: result.files,
							totalEdits: result.totalEdits,
							...(result.ambiguous !== undefined
								? { ambiguous: result.ambiguous }
								: {}),
						});
					},
				);
			},
		},
		{
			id: 'refactor_apply',
			summary: 'Apply a rename diff (containment-checked, gate-re-run).',
			tags: ['refactor', 'lazy'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_refactor_apply`,
					{
						description:
							'Write the files from a `refactor_rename` diff to disk. Requires `consentToken` (echoed back) and checks containment (all paths must be inside `root`). After write, the host should re-run the acceptance gate.',
						inputSchema: z.object({
							root: z.string().min(1),
							files: z.array(
								z.object({
									path: z.string(),
									hunks: z.array(hunkSchema),
								}),
							),
							consentToken: z.string().min(1),
						}),
						outputSchema: APPLY_OUTPUT_SCHEMA,
					},
					async (args) => {
						const containedRoot = resolveWorkspaceContained(
							options.workspaceRootAbs,
							args.root,
						);
						if (!containedRoot.ok) {
							return toolError(
								`root "${args.root}" is not allowed`,
								containedRoot.reason ??
									'root must be a workspace-relative path.',
							);
						}
						const rootAbs = containedRoot.abs;

						// Containment check: every file path must resolve
						// inside the (already-contained) root.
						const fileAbsByPath = new Map<string, string>();
						for (const file of args.files) {
							const contained = resolveWorkspaceContained(
								rootAbs,
								file.path,
							);
							if (!contained.ok) {
								return toolError(
									'containment-violation',
									`Path "${file.path}" is outside root "${args.root}": ${contained.reason ?? ''}`,
								);
							}
							fileAbsByPath.set(file.path, contained.abs);
						}

						// Write each file
						const written: string[] = [];
						for (const file of args.files) {
							const fileAbs = fileAbsByPath.get(file.path);
							if (fileAbs === undefined) continue;
							try {
								// Read the current content (we need the full file to apply hunks)
								const before = await read(fileAbs);
								// Apply hunks to reconstruct the after state
								const after = applyHunks(before, file.hunks);
								await write(fileAbs, after);
								written.push(file.path);
							} catch (err) {
								return toolError(
									'write-failed',
									`Cannot write "${file.path}": ${(err as Error).message}`,
								);
							}
						}

						return toolJson({
							written,
							gateCommand: 'bun run validate',
							consentToken: args.consentToken,
						});
					},
				);
			},
		},
	];
};

/**
 * Apply hunks to a source file (reconstruct the "after" state from hunks).
 */
const applyHunks = (before: string, hunks: readonly IHunk[]): string => {
	const lines = before.split('\n');
	// For simplicity, we'll reconstruct by applying each hunk's changes
	// This is a simplified implementation — real unified diff application is more complex
	for (const hunk of hunks) {
		let lineIdx = hunk.oldStart - 1;
		for (const hunkLine of hunk.lines) {
			if (hunkLine.kind === ' ') {
				lineIdx++;
			} else if (hunkLine.kind === '-') {
				lines.splice(lineIdx, 1);
			} else if (hunkLine.kind === '+') {
				lines.splice(lineIdx, 0, hunkLine.text);
				lineIdx++;
			}
		}
	}
	return lines.join('\n');
};
