import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { realResolvePath } from '../shared/contain-realpath';
import { resolveWorkspaceContained } from '../shared/contain-path';

import { WorkspaceContainmentError } from './safe-workspace-reader.errors';
import type {
	ContainedPathResult,
	ISafeWorkspaceReader,
	SafeListEntry,
	SafeListResult,
	SafeReadResult,
	SafeStatResult,
} from './safe-workspace-reader.types';

/**
 * Default reserved paths.
 *
 * d00008 / FS-005 (q00005): explicit `.env*` policy.
 * - `.env`, `.env.local`, `.env.production`, `.env.development`,
 *   `.env.secret` are **blocked** — they are secrets by convention
 *   (Next.js, Astro, Vite, SvelteKit, etc.).
 * - `.env.example` and `.env.test` are **allowed** — they are
 *   metadata (onboarding placeholders, test fixtures), not secrets.
 *   Hosts that need to block these too must pass `reservedPaths`
 *   explicitly to the constructor.
 * - `.git` and `node_modules` remain reserved as before.
 *
 * @see ADR-0015
 * @see d00008
 */
const DEFAULT_RESERVED_PATHS = [
	'.git',
	'.env',
	'.env.local',
	'.env.production',
	'.env.development',
	'.env.secret',
	'node_modules',
] as const;

const toForwardSlashes = (pathValue: string): string =>
	pathValue.split(sep).join('/');

const isRelativeEscape = (relativePath: string): boolean =>
	relativePath === '..' || relativePath.startsWith(`..${sep}`);

const normalizeRelativePath = (relativePath: string): string => {
	const normalized = toForwardSlashes(relativePath);
	return normalized.length === 0 ? '.' : normalized;
};

const normalizeReservedPath = (pathValue: string): string =>
	pathValue.replace(/^\.\//u, '').replace(/^\/+|\/+$/gu, '');

export interface ISafeWorkspaceReaderOptions {
	readonly reservedPaths?: readonly string[];
}

export class SafeWorkspaceReader implements ISafeWorkspaceReader {
	readonly #workspaceRootAbs: string;
	readonly #reservedPaths: readonly string[];
	#workspaceRootRealPromise: Promise<string> | undefined;

	constructor(
		workspaceRootAbs: string,
		options: ISafeWorkspaceReaderOptions = {},
	) {
		if (!isAbsolute(workspaceRootAbs)) {
			throw new Error('workspaceRootAbs must be absolute');
		}
		this.#workspaceRootAbs = resolve(workspaceRootAbs);
		this.#reservedPaths = (options.reservedPaths ?? DEFAULT_RESERVED_PATHS)
			.map(normalizeReservedPath)
			.filter((value) => value.length > 0);
	}

	/**
	 * Resolve an input path to a contained absolute path after LEXICAL
	 * containment only (no filesystem call, no symlink resolution).
	 *
	 * @deprecated Prefer {@link resolveLexical} (lexical-only, same
	 *   semantics but explicit name) or {@link resolveExistingContained}
	 *   (realpath-validated). Removal is scheduled for a future plan
	 *   once all in-repo callers have migrated; see ADR-0014 (FS-004).
	 *
	 * @param inputPath — the user-supplied relative or absolute path
	 * @returns the contained absolute/relative pair, or throws
	 *   {@link WorkspaceContainmentError} on escape / reserved.
	 */
	resolve(inputPath: string): ContainedPathResult {
		return this.resolveLexical(inputPath);
	}

	/**
	 * Resolve an input path to a contained absolute path after LEXICAL
	 * containment only (no filesystem call, no symlink resolution).
	 *
	 * Use this when you want to validate a path string WITHOUT
	 * touching the filesystem — for example, to render a path or
	 * decide which API to call next. Safe by construction: it cannot
	 * follow symlinks because it never opens anything.
	 *
	 * For paths that will subsequently be opened with `readFile`,
	 * `readdir`, or `stat`, prefer
	 * {@link resolveExistingContained} instead.
	 *
	 * @see ADR-0014 — `resolveLexical` vs `resolveExistingContained`
	 * @see d00007 — proposal that introduced this split
	 */
	resolveLexical(inputPath: string): ContainedPathResult {
		this.#assertValidInput(inputPath);
		const wasAbsolute = isAbsolute(inputPath);
		const contained = wasAbsolute
			? this.#resolveAbsoluteInput(inputPath)
			: this.#resolveRelativeInput(inputPath);
		this.#assertNotReserved(contained.relativePath, inputPath);
		return contained;
	}

	/**
	 * Resolve an input path to a contained absolute path after FULL
	 * REALPATH VALIDATION: lexical containment + existence check +
	 * symlink walk. Returns `null` if the target does not exist or if
	 * any level of the realpath escapes the workspace.
	 *
	 * This is the ONLY API that should be used immediately before a
	 * `readFile` / `readdir` / `stat`. All `readText` / `stat` /
	 * `list` / `exists` methods on this class route through this
	 * validator (they reject on escape / reserved path).
	 *
	 * @see ADR-0014 — `resolveLexical` vs `resolveExistingContained`
	 * @see d00007 — proposal that introduced this split
	 */
	async resolveExistingContained(
		inputPath: string,
	): Promise<ContainedPathResult | null> {
		try {
			return await this.#resolveContainedOnDisk(inputPath);
		} catch (error) {
			if (error instanceof WorkspaceContainmentError) {
				return null;
			}
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return null;
			}
			throw error;
		}
	}

	async readText(inputPath: string): Promise<SafeReadResult> {
		const contained = await this.#resolveContainedOnDisk(inputPath);
		const [content, stats] = await Promise.all([
			readFile(contained.absolutePath, 'utf8'),
			stat(contained.absolutePath),
		]);
		return { path: contained, content, stats };
	}

	async stat(inputPath: string): Promise<SafeStatResult> {
		const contained = await this.#resolveContainedOnDisk(inputPath);
		return {
			path: contained,
			stats: await stat(contained.absolutePath),
		};
	}

	async exists(inputPath: string): Promise<ContainedPathResult | null> {
		try {
			const contained = await this.#resolveContainedOnDisk(inputPath);
			await stat(contained.absolutePath);
			return contained;
		} catch (error) {
			if (error instanceof WorkspaceContainmentError) {
				return null;
			}
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return null;
			}
			throw error;
		}
	}

	async list(
		inputPath: string,
		options: {
			readonly recursive?: boolean;
			readonly maxDepth?: number;
		} = {},
	): Promise<SafeListResult> {
		const contained = await this.#resolveContainedOnDisk(inputPath);
		const entries = await this.#listEntries(
			contained,
			options.recursive ?? false,
			Math.max(1, options.maxDepth ?? 1),
		);
		return { path: contained, entries };
	}

	#assertValidInput(inputPath: string): void {
		if (typeof inputPath !== 'string' || inputPath.length === 0) {
			throw new WorkspaceContainmentError({
				kind: 'invalid-input',
				originalPath: String(inputPath),
				workspaceRoot: this.#workspaceRootAbs,
			});
		}
		if (inputPath.includes('\u0000')) {
			throw new WorkspaceContainmentError({
				kind: 'invalid-input',
				originalPath: inputPath,
				workspaceRoot: this.#workspaceRootAbs,
			});
		}
	}

	#resolveRelativeInput(inputPath: string): ContainedPathResult {
		const contained = resolveWorkspaceContained(
			this.#workspaceRootAbs,
			inputPath,
		);
		if (!contained.ok) {
			throw new WorkspaceContainmentError({
				kind: 'outside-workspace',
				originalPath: inputPath,
				workspaceRoot: this.#workspaceRootAbs,
				resolvedAbsolute: contained.abs,
			});
		}
		return {
			absolutePath: contained.abs,
			relativePath: contained.rel,
			originalPath: inputPath,
			wasAbsolute: false,
		};
	}

	#resolveAbsoluteInput(inputPath: string): ContainedPathResult {
		const absolutePath = resolve(inputPath);
		const relativePath = relative(this.#workspaceRootAbs, absolutePath);
		if (relativePath !== '' && isRelativeEscape(relativePath)) {
			throw new WorkspaceContainmentError({
				kind: 'outside-workspace',
				originalPath: inputPath,
				workspaceRoot: this.#workspaceRootAbs,
				resolvedAbsolute: absolutePath,
			});
		}
		return {
			absolutePath,
			relativePath: normalizeRelativePath(relativePath),
			originalPath: inputPath,
			wasAbsolute: true,
		};
	}

	#assertNotReserved(relativePath: string, originalPath: string): void {
		const normalizedRelative = normalizeRelativePath(relativePath);
		for (const reservedPath of this.#reservedPaths) {
			if (
				normalizedRelative === reservedPath ||
				normalizedRelative.startsWith(`${reservedPath}/`) ||
				normalizedRelative.split('/').includes(reservedPath)
			) {
				throw new WorkspaceContainmentError({
					kind: 'reserved-path',
					originalPath,
					workspaceRoot: this.#workspaceRootAbs,
					reservedPath,
				});
			}
		}
	}

	async #workspaceRootReal(): Promise<string> {
		this.#workspaceRootRealPromise ??= realResolvePath(
			this.#workspaceRootAbs,
		);
		return this.#workspaceRootRealPromise;
	}

	async #resolveContainedOnDisk(
		inputPath: string,
	): Promise<ContainedPathResult> {
		const contained = this.resolve(inputPath);
		const [workspaceRootReal, absolutePathReal] = await Promise.all([
			this.#workspaceRootReal(),
			realResolvePath(contained.absolutePath),
		]);
		const relativePath = relative(workspaceRootReal, absolutePathReal);
		if (relativePath !== '' && isRelativeEscape(relativePath)) {
			throw new WorkspaceContainmentError({
				kind: 'symlink-outside',
				originalPath: inputPath,
				workspaceRoot: workspaceRootReal,
				resolvedAbsolute: absolutePathReal,
			});
		}
		const normalizedRelative = normalizeRelativePath(relativePath);
		this.#assertNotReserved(normalizedRelative, inputPath);
		return {
			absolutePath: absolutePathReal,
			relativePath: normalizedRelative,
			originalPath: contained.originalPath,
			wasAbsolute: contained.wasAbsolute,
		};
	}

	async #listEntries(
		containedDirectory: ContainedPathResult,
		recursive: boolean,
		maxDepth: number,
		currentDepth = 0,
	): Promise<readonly SafeListEntry[]> {
		const dirEntries = await readdir(containedDirectory.absolutePath, {
			withFileTypes: true,
		});
		const entries: SafeListEntry[] = [];
		for (const entry of dirEntries) {
			const relativeInput =
				containedDirectory.relativePath === '.'
					? entry.name
					: `${containedDirectory.relativePath}/${entry.name}`;
			let item: SafeStatResult;
			try {
				item = await this.stat(relativeInput);
			} catch (error) {
				if (error instanceof WorkspaceContainmentError) {
					continue;
				}
				throw error;
			}
			entries.push(item);
			if (
				recursive &&
				item.stats.isDirectory() &&
				currentDepth + 1 < maxDepth
			) {
				entries.push(
					...(await this.#listEntries(
						item.path,
						true,
						maxDepth,
						currentDepth + 1,
					)),
				);
			}
		}
		return entries;
	}
}
