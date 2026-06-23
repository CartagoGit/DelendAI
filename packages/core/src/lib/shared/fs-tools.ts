/**
 * fs-tools.ts — public barrel for the workspace filesystem
 * primitives (`fs_read` / `fs_write`).
 *
 * The original implementation lived in this 262-line file. The
 * SOLID refactor split the responsibility into three single-purpose
 * modules:
 *
 *   - `fs-tools-options.ts` — the option / result shapes
 *                              (`IFsReadResult`, `IFsWriteResult`,
 *                              `IFsWriteOptions`, `IFsToolOptions`).
 *   - `fs-read.ts`          — the `fsRead` primitive.
 *   - `fs-write.ts`         — the `fsWrite` primitive.
 *
 * This barrel re-exports the two primitives under their original
 * names so the `core/public` barrel (and every plugin that imports
 * `fsRead` / `fsWrite`) keeps working without an import edit.
 * `buildFsToolRegistrations` stays here because it composes the
 * two primitives into a single `readonly IToolRegistration[]` —
 * the tool-builder concern doesn't belong to either primitive.
 *
 * SOLID summary:
 *   - SRP — each primitive lives in its own file; each option shape
 *          lives in its own typed module.
 *   - OCP — adding a third primitive (e.g. `fs_stat`) is a new file
 *          + a single re-export line here, no edit to the
 *          implementation files.
 *   - LSP — every re-export preserves the original type.
 *   - ISP — callers needing only the read can import `fs-read.ts`
 *          directly and skip the write primitive.
 *   - DIP — both primitives depend on the `resolveWorkspaceContained`
 *          port (containment) plus the `writeFileAtomic` and
 *          `withFileMutex` ports; tests can swap the port
 *          implementations.
 */
import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolError, toolJson } from './tool-response';
import { fsRead } from './fs-read';
import { fsWrite } from './fs-write';
import type { IFsToolOptions } from './fs-tools-options';

export { fsRead } from './fs-read';
export { fsWrite } from './fs-write';
export type {
	IFsReadResult,
	IFsToolOptions,
	IFsWriteOptions,
	IFsWriteResult,
} from './fs-tools-options';

/**
 * `fs_read` (effects: none — read-only) and `fs_write`
 * (effects: ['write']). Both validate `path` via
 * `resolveWorkspaceContained`; neither ever throws out of the
 * tool handler — failures come back as a structured
 * `found:false` / `ok:false` result that the tool handler turns
 * into a `toolError` envelope.
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
								'file not found or path escapes workspace',
								'Pass a workspace-relative path; absolute paths and `..` are rejected.',
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
				'Write a workspace-contained file (path containment + optional atomic+create-dirs).',
			tags: ['fs'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_fs_write`,
					{
						description:
							'Write a file inside the workspace. `path` is workspace-relative; `../` or absolute paths are rejected before any I/O. `createDirs:true` creates parent directories. Writes are always durable (atomic + per-path mutex).',
						inputSchema: z.object({
							path: z.string(),
							content: z.string(),
							createDirs: z.boolean().optional(),
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
					}) => {
						// r00003 S3 (F-003): reject a stray `atomic`
						// argument explicitly rather than silently
						// dropping it. A caller passing `atomic:false`
						// expects a non-durable write; surfacing a
						// structured invalid-argument error is honest,
						// whereas writing atomically anyway would be a
						// silent contract change.
						if (
							Object.hasOwn(
								args as Record<string, unknown>,
								'atomic',
							)
						) {
							return toolError(
								'invalid-argument: `atomic` is not a valid option for fs_write',
								'Remove `atomic` from the input. fs_write is always durable (atomic + per-path mutex); there is no non-atomic public write.',
							);
						}
						return toolJson(
							await fsWrite(
								options.workspaceRootAbs,
								args.path,
								args.content,
								{
									...(args.createDirs !== undefined
										? { createDirs: args.createDirs }
										: {}),
								},
							),
						);
					},
				);
			},
		},
	];
};
