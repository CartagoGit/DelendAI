/**
 * scan-host-instructions.tool.ts — f00094 S2.
 *
 * `scanHostInstructions` reads the current host-instruction files and
 * returns a deterministic {@link IHostInstructionsInventory}. It is the
 * read half of f00094: the write half (`inherit_host_instructions`)
 * turns the inventory into a `ready` proposal for review.
 *
 * Invariants (AGENTS.md):
 *   - No `process.cwd()`, no direct `node:fs` in the scanner. IO is the
 *     injected `IFileReader` (in-repo) + optional `IUserHomeReader`
 *     (user-home). The real filesystem adapters live at the composition
 *     edge (`createUserHomeReader` + `createWorkspaceFileReader`).
 *   - Pure data shaping on top of the readers: deterministic given the
 *     same readers + scope.
 *   - Never throws on a missing file — a missing target is `present:
 *     false`, not an error (mirrors `IFileReader.readFile`'s catch-all).
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, normalize, resolve, sep } from 'node:path';

import type { IFileReader } from '@delendai/core/public';

import {
	IN_REPO_HOST_FILES,
	USER_HOME_HOST_FILES,
} from '../contracts/constants/host-instruction-files.constant';
import type {
	IHostInstructionFile,
	IHostInstructionsInventory,
	IUserHomeReader,
	THostInstructionScope,
} from '../contracts/interfaces/host-instructions-inventory.interface';

/**
 * A host file is "canonical" (already delendai-managed) when it
 * carries BOTH the begin and end markers f00092 writes. Canonical
 * in-repo files have nothing foreign left to audit, so the scan marks
 * them and the tool skips them. Deliberately looser than f00093's
 * byte-for-byte block comparison: for the audit decision "is this file
 * already ours?" the marker presence is the signal that matters, and it
 * avoids coupling this plugin to the CLI's exact canonical block.
 */
const MCP_BEGIN_MARKER = '<!-- delendai:begin -->';
const MCP_END_MARKER = '<!-- delendai:end -->';

const isCanonicalHostBlock = (body: string): boolean =>
	body.includes(MCP_BEGIN_MARKER) && body.includes(MCP_END_MARKER);

/**
 * Read the in-repo host files via the workspace reader. Always runs,
 * regardless of scope.
 */
const scanInRepo = async (
	reader: IFileReader,
): Promise<IHostInstructionFile[]> => {
	const out: IHostInstructionFile[] = [];
	for (const target of IN_REPO_HOST_FILES) {
		const raw = await reader.readFile(target.path);
		const present = raw !== undefined;
		const content = raw ?? '';
		out.push({
			path: target.path,
			surface: 'in-repo',
			present,
			canonical: present && isCanonicalHostBlock(content),
			content,
		});
	}
	return out;
};

/**
 * Read the user-home host files via the injected home reader. Only runs
 * on `scope: 'all'`. When no home reader is wired the files degrade to
 * `present: false` (the scanner never invents a filesystem).
 *
 * User-home files are never `canonical`: they are foreign config, so
 * whenever present they are worth surfacing to the reviewer.
 */
const scanUserHome = async (
	home: IUserHomeReader | undefined,
): Promise<IHostInstructionFile[]> => {
	const out: IHostInstructionFile[] = [];
	for (const target of USER_HOME_HOST_FILES) {
		const raw = home ? await home.readHome(target.path) : undefined;
		const present = raw !== undefined;
		out.push({
			path: `~/${target.path}`,
			surface: 'user-home',
			present,
			canonical: false,
			content: raw ?? '',
		});
	}
	return out;
};

/**
 * Scan the host-instruction surface and return a deterministic
 * inventory. With `scope: 'repo'` (default) only the three in-repo
 * files are read; with `scope: 'all'` the opt-in user-home files are
 * additionally read through the containment-bounded home reader.
 */
export const scanHostInstructions = async (
	readers: {
		readonly repo: IFileReader;
		readonly home?: IUserHomeReader | undefined;
	},
	options: { readonly scope: THostInstructionScope },
): Promise<IHostInstructionsInventory> => {
	const inRepo = await scanInRepo(readers.repo);
	const userHome =
		options.scope === 'all' ? await scanUserHome(readers.home) : [];
	const files = [...inRepo, ...userHome];
	const totalNonCanonical = files.filter(
		(f) => f.present && !f.canonical,
	).length;
	return { scope: options.scope, files, totalNonCanonical };
};

/**
 * Real-filesystem adapter for {@link IUserHomeReader}. Reads a file
 * relative to the user's home directory with a containment guard: the
 * resolved absolute path MUST stay under the home root, so a symlinked
 * or `..`-laden path can never escape the boundary (defense in depth —
 * the caller only ever passes literals from the host-file table).
 *
 * Lives here, at the composition edge, so the scanner above stays pure.
 */
export const createUserHomeReader = (
	home: string = homedir(),
): IUserHomeReader => {
	const homeRoot = resolve(home);
	return {
		readHome: async (relativeToHome) => {
			// Reject absolute inputs outright: the table is home-relative.
			if (isAbsolute(relativeToHome)) return undefined;
			const abs = resolve(homeRoot, normalize(relativeToHome));
			// Containment: `abs` must be the home root or a descendant.
			if (abs !== homeRoot && !abs.startsWith(homeRoot + sep)) {
				return undefined;
			}
			try {
				const [realHomeRoot, realPath] = await Promise.all([
					fs.realpath(homeRoot),
					fs.realpath(abs),
				]);
				if (
					realPath !== realHomeRoot &&
					!realPath.startsWith(realHomeRoot + sep)
				) {
					return undefined;
				}
				return await fs.readFile(realPath, 'utf8');
			} catch {
				return undefined;
			}
		},
	};
};
