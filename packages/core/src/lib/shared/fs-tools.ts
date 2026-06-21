import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolError, toolJson } from './tool-response';
import { resolveWorkspaceContained } from './contain-path';
import { writeFileAtomic } from './atomic-write';
import { withFileMutex } from './with-file-mutex';

/**
 * Generic workspace filesystem primitives — `fs_read`/`fs_write` — kept in
 * core (not a plugin) because reading/writing a workspace-contained file is
 * a domain-agnostic capability every plugin can reuse, not a piece of any
 * single domain's logic. Path containment via {@link resolveWorkspaceContained}
 * is mandatory: every path argument is resolved against the workspace root
 * and any `../` escape or absolute path is rejected before touching disk.
 */

export interface IFsReadResult {
	readonly path: string;
	readonly found: boolean;
	readonly content: string | null;
	readonly totalLines: number | null;
	readonly range: readonly [number, number] | null;
}

/**
 * Read a workspace-contained file, optionally a 1-indexed inclusive line
 * range `[start, end]`. Returns `found:false` (never throws) when the path
 * escapes the workspace or the file doesn't exist/can't be read.
 */
export const fsRead = async (
	workspaceRootAbs: string,
	relativePath: string,
	range?: readonly [number, number],
): Promise<IFsReadResult> => {
	const contained = resolveWorkspaceContained(workspaceRootAbs, relativePath);
	if (!contained.ok) {
		return {
			path: relativePath,
			found: false,
			content: null,
			totalLines: null,
			range: null,
		};
	}
	try {
		const raw = await readFile(contained.abs, 'utf8');
		const lines = raw.split('\n');
		if (range === undefined) {
			return {
				path: contained.rel,
				found: true,
				content: raw,
				totalLines: lines.length,
				range: null,
			};
		}
		const [start, end] = range;
		const lo = Math.max(1, start);
		const hi = Math.min(lines.length, end);
		const slice = lo <= hi ? lines.slice(lo - 1, hi) : [];
		return {
			path: contained.rel,
			found: true,
			content: slice.join('\n'),
			totalLines: lines.length,
			range: [lo, hi],
		};
	} catch {
		return {
			path: contained.rel,
			found: false,
			content: null,
			totalLines: null,
			range: null,
		};
	}
};

export interface IFsWriteResult {
	readonly path: string;
	readonly ok: boolean;
	readonly bytesWritten: number;
	readonly error?: string;
}

export interface IFsWriteOptions {
	/** Create parent directories if missing. Default false. */
	readonly createDirs?: boolean;
	/**
	 * Use `writeFileAtomic` guarded by `withFileMutex` (crash-safe,
	 * concurrency-safe). Default true — set false only when the caller
	 * already holds an equivalent guarantee and wants a plain write.
	 */
	readonly atomic?: boolean;
}

/**
 * Write a workspace-contained file. Path containment is checked first and
 * unconditionally — a `../` or absolute path is rejected before any I/O,
 * `createDirs`/`atomic` notwithstanding. `atomic:true` (default) routes the
 * write through `withFileMutex` + `writeFileAtomic` so concurrent writers
 * can't tear or lose each other's update; `atomic:false` writes directly
 * (still after containment + optional `mkdir`).
 */
export const fsWrite = async (
	workspaceRootAbs: string,
	relativePath: string,
	content: string,
	options: IFsWriteOptions = {},
): Promise<IFsWriteResult> => {
	const contained = resolveWorkspaceContained(workspaceRootAbs, relativePath);
	if (!contained.ok) {
		return {
			path: relativePath,
			ok: false,
			bytesWritten: 0,
			error: contained.reason ?? 'path escapes workspace',
		};
	}
	const atomic = options.atomic ?? true;
	try {
		if (options.createDirs === true) {
			await mkdir(dirname(contained.abs), { recursive: true });
		}
		if (atomic) {
			await withFileMutex(contained.abs, () =>
				writeFileAtomic(contained.abs, content),
			);
		} else {
			await writeFile(contained.abs, content, 'utf8');
		}
		return {
			path: contained.rel,
			ok: true,
			bytesWritten: Buffer.byteLength(content, 'utf8'),
		};
	} catch (error) {
		return {
			path: contained.rel,
			ok: false,
			bytesWritten: 0,
			error: String(error),
		};
	}
};

export interface IFsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
}

/**
 * `fs_read` (effects: none — read-only) and `fs_write` (effects: ['write']).
 * Both validate `path` via `resolveWorkspaceContained`; neither ever throws
 * out of the tool handler — failures come back as a structured `found:false`
 * / `ok:false` result.
 */
export const buildFsToolRegistrations = (
	options: IFsToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'fs_read',
			summary:
				'Read a workspace-contained file, optionally a 1-indexed line range.',
			tags: ['fs', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_fs_read`,
					{
						description:
							'Read a file inside the workspace. `path` is workspace-relative; `../` or absolute paths are rejected. Optional `range: [start, end]` (1-indexed, inclusive) returns only those lines. Read-only.',
						inputSchema: z.object({
							path: z.string(),
							range: z.tuple([z.number(), z.number()]).optional(),
						}),
						outputSchema: z.object({
							path: z.string(),
							found: z.boolean(),
							content: z.string().nullable(),
							totalLines: z.number().nullable(),
							range: z.tuple([z.number(), z.number()]).nullable(),
						}),
					},
					async (args: {
						path: string;
						range?: readonly [number, number] | undefined;
					}) => {
						const result = await fsRead(
							options.workspaceRootAbs,
							args.path,
							args.range,
						);
						if (!result.found) {
							return toolError(
								`unreadable path "${args.path}"`,
								'Check the path is workspace-relative and exists.',
							);
						}
						return toolJson(result);
					},
				);
			},
		},
		{
			id: 'fs_write',
			effects: ['write'],
			summary:
				'Write a workspace-contained file (optionally creating parent dirs, atomically).',
			tags: ['fs'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_fs_write`,
					{
						description:
							'Write a file inside the workspace. `path` is workspace-relative; `../` or absolute paths are rejected. `createDirs:true` makes missing parent directories; `atomic` (default true) routes the write through a crash-safe, concurrency-safe mutex+rename. This DOES mutate the workspace.',
						inputSchema: z.object({
							path: z.string(),
							content: z.string(),
							createDirs: z.boolean().optional(),
							atomic: z.boolean().optional(),
						}),
						outputSchema: z.object({
							path: z.string(),
							ok: z.boolean(),
							bytesWritten: z.number(),
							error: z.string().optional(),
						}),
					},
					async (args: {
						path: string;
						content: string;
						createDirs?: boolean | undefined;
						atomic?: boolean | undefined;
					}) => {
						const result = await fsWrite(
							options.workspaceRootAbs,
							args.path,
							args.content,
							{
								...(args.createDirs !== undefined
									? { createDirs: args.createDirs }
									: {}),
								...(args.atomic !== undefined
									? { atomic: args.atomic }
									: {}),
							},
						);
						if (!result.ok) {
							return toolError(
								result.error ??
									`failed to write "${args.path}"`,
								'Check the path stays inside the workspace.',
							);
						}
						return toolJson(result);
					},
				);
			},
		},
	];
};
