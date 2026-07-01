/**
 * Eviction registry implementation — f00068 slice A.
 *
 * Pure over its inputs: every dependency is either `node:fs/promises`
 * (async, per the AGENTS hard rule on no `*Sync` in tool/registry
 * handlers) or injected via the constructor. Tests inject a temp root
 * and a fake clock; production wires the resolved workspace root and
 * `new Date()`.
 *
 * The four strategies in `applyRule` are deliberately small — there
 * is no glob library, no fancy LRU, no compression. TTL eviction is
 * what every plugin actually needs today; size-based caps are
 * explicitly out of scope (see proposal f00068 §"Out of scope").
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

import type {
	ICacheEvictionCustom,
	ICacheEvictionErrored,
	ICacheEvictionKeepLastN,
	ICacheEvictionOlderThan,
	ICacheEvictionOlderThanMtime,
	ICacheEvictionRegistry,
	ICacheEvictionRemoved,
	ICacheEvictionReport,
	ICacheEvictionRule,
	ICacheEvictionRunOptions,
	ICacheEvictionSkipped,
	ICacheEvictionWhen,
} from '../contracts/interfaces/cache-eviction.interface';
import { resolveWorkspaceContained } from '../shared/contain-path';

/** Date-shaped names (`YYYY-MM-DD`, optionally with `.ext`) let us
 *  pin TTLs on the filename itself, more robust than mtime for files
 *  written by clock-skewed systems. We accept any YYYY-MM-DD prefix,
 *  regardless of extension. */
const DATE_NAME_RE = /^(\d{4}-\d{2}-\d{2})/;

/** Single-`*` glob: `dir/*` expands to every direct child of `dir`.
 *  Matches the existing convention (`handoff/*`). No `**`, `[...]`,
 *  `?` — anything richer belongs in a `custom` strategy. */
const SINGLE_STAR_RE = /^(?<base>[^*]+)\/\*$/;

interface ITarget {
	readonly rel: string;
	readonly abs: string;
}

export interface IEvictionRegistryDeps {
	/** Absolute path of the workspace root. */
	readonly workspaceRootAbs: string;
	/** Resolved cacheDir absolute path. The boot wiring passes the
	 *  absolute, contained form so the registry never has to resolve
	 *  relative paths itself. */
	readonly cacheDirAbs: string;
}

export const createCacheEvictionRegistry = (
	deps: IEvictionRegistryDeps,
): ICacheEvictionRegistry => {
	const rules = new Map<string, ICacheEvictionRule>();

	const validateRule = (rule: ICacheEvictionRule): void => {
		if (rule.id.length === 0) {
			throw new Error('cache eviction rule: id is required');
		}
		if (rule.owner.length === 0) {
			throw new Error(
				`cache eviction rule '${rule.id}': owner is required`,
			);
		}
		if (rule.path.length === 0) {
			throw new Error(
				`cache eviction rule '${rule.id}': path is required`,
			);
		}
		if (isAbsolute(rule.path)) {
			throw new Error(
				`cache eviction rule '${rule.id}': path must be cache-relative, got absolute: ${rule.path}`,
			);
		}
		// Containment: the rule's path is resolved under cacheDir, so
		// we verify the result stays inside the workspace. `dir/*` is
		// normalised to `dir` for the check.
		const checkPath =
			SINGLE_STAR_RE.exec(rule.path)?.groups?.base ?? rule.path;
		const tentativeAbs = join(deps.cacheDirAbs, checkPath);
		const contained = resolveWorkspaceContained(
			deps.workspaceRootAbs,
			relative(deps.workspaceRootAbs, tentativeAbs),
		);
		if (!contained.ok) {
			throw new Error(
				`cache eviction rule '${rule.id}': path escapes workspace: ${rule.path} (${contained.reason})`,
			);
		}
		if (deps.cacheDirAbs.length === 0) {
			throw new Error('cache eviction registry: cacheDirAbs is empty');
		}
	};

	const resolveTargetAbs = (relPath: string): string =>
		isAbsolute(relPath) ? relPath : join(deps.cacheDirAbs, relPath);

	const resolveTargets = async (
		rule: ICacheEvictionRule,
	): Promise<readonly ITarget[]> => {
		const starMatch = SINGLE_STAR_RE.exec(rule.path);
		const base = starMatch?.groups?.base ?? rule.path;
		const baseAbs = resolveTargetAbs(base);
		if (starMatch === null) {
			return [{ rel: rule.path, abs: baseAbs }];
		}
		try {
			const entries = await readdir(baseAbs);
			return entries.map((name) => ({
				rel: `${base}/${name}`,
				abs: join(baseAbs, name),
			}));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
	};

	const sizeOf = async (absPath: string): Promise<number> => {
		try {
			const info = await stat(absPath);
			if (!info.isDirectory()) return info.size;
			const children = await readdir(absPath, { withFileTypes: true });
			let total = 0;
			for (const child of children) {
				try {
					const childInfo = await stat(join(absPath, child.name));
					total += childInfo.size;
				} catch {
					// ignore — the directory itself will still be removed
				}
			}
			return total;
		} catch {
			return 0;
		}
	};

	const removeAbs = async (abs: string): Promise<void> => {
		await rm(abs, { recursive: true, force: true });
	};

	const toRel = (abs: string): string => {
		if (!abs.startsWith(deps.cacheDirAbs)) return abs;
		const rel = abs
			.slice(deps.cacheDirAbs.length)
			.split(sep)
			.join('/')
			.replace(/^\//, '');
		return rel === '' ? '.' : rel;
	};

	// --- strategies --------------------------------------------------------
	// Each strategy returns the entries it removed (or WOULD remove on
	// dry-run). `dryRun` is the single switch — same predicate logic,
	// same report shape. This is what makes "second-run-is-noop"
	// idempotency trivial to test.

	const runOlderThanDays = async (
		rule: ICacheEvictionRule,
		target: ITarget,
		now: Date,
		when: ICacheEvictionOlderThan,
		dryRun: boolean,
	): Promise<readonly ICacheEvictionRemoved[]> => {
		const fileName = target.abs.split(sep).pop() ?? target.abs;
		const nameMatch = DATE_NAME_RE.exec(fileName);
		const timestamp =
			nameMatch?.[1] !== undefined
				? new Date(nameMatch[1]).getTime()
				: (await stat(target.abs)).mtimeMs;
		const threshold = now.getTime() - when.days * 24 * 60 * 60 * 1000;
		if (timestamp >= threshold) return [];
		const bytes = await sizeOf(target.abs);
		if (!dryRun) await removeAbs(target.abs);
		return [{ id: rule.id, path: target.rel, bytes }];
	};

	const runOlderThanMtimeDays = async (
		rule: ICacheEvictionRule,
		target: ITarget,
		now: Date,
		when: ICacheEvictionOlderThanMtime,
		dryRun: boolean,
	): Promise<readonly ICacheEvictionRemoved[]> => {
		const threshold = now.getTime() - when.days * 24 * 60 * 60 * 1000;
		const info = await stat(target.abs);
		if (info.mtimeMs >= threshold) return [];
		const bytes = await sizeOf(target.abs);
		if (!dryRun) await removeAbs(target.abs);
		return [{ id: rule.id, path: target.rel, bytes }];
	};

	const runKeepLastN = async (
		rule: ICacheEvictionRule,
		target: ITarget,
		when: ICacheEvictionKeepLastN,
		dryRun: boolean,
	): Promise<readonly ICacheEvictionRemoved[]> => {
		let info: Awaited<ReturnType<typeof stat>>;
		try {
			info = await stat(target.abs);
		} catch (error) {
			// A keepLastN rule whose directory does not exist yet (e.g.
			// `.worktrees/` before any agent worktree was created) is a
			// no-op, not an error — same forgiving posture the glob
			// expansion takes for ENOENT.
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
		if (!info.isDirectory()) return [];
		const entries = await readdir(target.abs);
		const statByName = await Promise.all(
			entries.map(async (name) => {
				const abs = join(target.abs, name);
				try {
					const s = await stat(abs);
					return { name, abs, mtimeMs: s.mtimeMs };
				} catch {
					return null;
				}
			}),
		);
		const sortable = statByName.filter(
			(entry): entry is { name: string; abs: string; mtimeMs: number } =>
				entry !== null,
		);
		sortable.sort((a, b) => b.mtimeMs - a.mtimeMs);
		const survivors = new Set(sortable.slice(0, when.n).map((e) => e.abs));
		const out: ICacheEvictionRemoved[] = [];
		for (const entry of sortable) {
			if (survivors.has(entry.abs)) continue;
			const bytes = await sizeOf(entry.abs);
			if (!dryRun) await removeAbs(entry.abs);
			out.push({
				id: rule.id,
				path: `${target.rel}/${entry.name}`,
				bytes,
			});
		}
		return out;
	};

	const runCustom = async (
		rule: ICacheEvictionRule,
		target: ITarget,
		dryRun: boolean,
		when: ICacheEvictionCustom,
	): Promise<readonly ICacheEvictionRemoved[]> => {
		const removedAbs = await when.run(target.abs, dryRun);
		const out: ICacheEvictionRemoved[] = [];
		for (const abs of removedAbs) {
			out.push({
				id: rule.id,
				path: toRel(abs),
				bytes: await sizeOf(abs),
			});
		}
		return out;
	};

	const runStrategy = (
		rule: ICacheEvictionRule,
		target: ITarget,
		now: Date,
		dryRun: boolean,
		when: ICacheEvictionWhen,
	): Promise<readonly ICacheEvictionRemoved[]> => {
		switch (when.kind) {
			case 'olderThanDays':
				return runOlderThanDays(rule, target, now, when, dryRun);
			case 'olderThanMtimeDays':
				return runOlderThanMtimeDays(rule, target, now, when, dryRun);
			case 'keepLastN':
				return runKeepLastN(rule, target, when, dryRun);
			case 'custom':
				return runCustom(rule, target, dryRun, when);
		}
	};

	// --- per-rule orchestration -------------------------------------------

	const applyRule = async (
		rule: ICacheEvictionRule,
		dryRun: boolean,
		now: Date,
	): Promise<{
		readonly removed: readonly ICacheEvictionRemoved[];
		readonly skipped: readonly ICacheEvictionSkipped[];
		readonly errors: readonly ICacheEvictionErrored[];
	}> => {
		const removed: ICacheEvictionRemoved[] = [];
		const skipped: ICacheEvictionSkipped[] = [];
		const errors: ICacheEvictionErrored[] = [];

		if (rule.enabled === false) {
			skipped.push({ id: rule.id, reason: 'rule disabled' });
			return { removed, skipped, errors };
		}

		let targets: readonly ITarget[];
		try {
			targets = await resolveTargets(rule);
		} catch (error) {
			errors.push({
				id: rule.id,
				path: rule.path,
				error: error instanceof Error ? error.message : String(error),
			});
			return { removed, skipped, errors };
		}

		if (targets.length === 0) {
			skipped.push({
				id: rule.id,
				reason: `no targets under '${rule.path}'`,
			});
			return { removed, skipped, errors };
		}

		for (const target of targets) {
			try {
				const result = await runStrategy(
					rule,
					target,
					now,
					dryRun,
					rule.when,
				);
				removed.push(...result);
			} catch (error) {
				errors.push({
					id: rule.id,
					path: target.rel,
					error:
						error instanceof Error ? error.message : String(error),
				});
			}
		}
		return { removed, skipped, errors };
	};

	return {
		register(rule) {
			validateRule(rule);
			rules.set(rule.id, rule);
		},
		unregister(id) {
			return rules.delete(id);
		},
		list() {
			return [...rules.values()];
		},
		async run(options: ICacheEvictionRunOptions = {}) {
			const dryRun = options.dryRun ?? true;
			const now = options.now ?? new Date();
			const allRules = [...rules.values()];
			const filtered =
				options.onlyOwner !== undefined
					? allRules.filter((r) => r.owner === options.onlyOwner)
					: allRules;

			const settled = await Promise.all(
				filtered.map((rule) => applyRule(rule, dryRun, now)),
			);

			const removed: ICacheEvictionRemoved[] = [];
			const skipped: ICacheEvictionSkipped[] = [];
			const errors: ICacheEvictionErrored[] = [];
			for (const result of settled) {
				removed.push(...result.removed);
				skipped.push(...result.skipped);
				errors.push(...result.errors);
			}
			const totalBytes = removed.reduce((sum, r) => sum + r.bytes, 0);
			return {
				dryRun,
				appliedAt: now.toISOString(),
				totalBytes,
				removed,
				skipped,
				errors,
				rulesEvaluated: filtered.length,
			} satisfies ICacheEvictionReport;
		},
	};
};
