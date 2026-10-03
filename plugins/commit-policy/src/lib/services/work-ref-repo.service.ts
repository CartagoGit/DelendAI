// effect-boundary-authorized: the checkout adapter for commit_policy_work_ref — it reads git objects and writes them back into the working tree, and every target path is containment-checked before any filesystem call.
/**
 * work-ref.tool.ts — `commit_policy_work_ref`.
 *
 * The shared-checkout-pr model has one safe persistence primitive: a WIP ref
 * built by the core WIP engine. This tool is the host-neutral bridge to that
 * primitive. It deliberately accepts only policy-derived ref identities and
 * never exposes a branch, checkout or generic git command escape hatch.
 */

import { execFile } from 'node:child_process';
import {
	chmod,
	lstat,
	mkdir,
	readdir,
	rm,
	symlink,
	unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
	type IResolvedDevelopmentPolicy,
	writeFileAtomic,
} from '@delendai/core/public';
import type {
	IBaseEntry,
	ICleanPlan,
	IRepoSnapshot,
	IWipEngine,
} from '../contracts/interfaces/work-ref-tool.interface';
import {
	GIT_BLOB_MAX_BUFFER_BYTES,
	GIT_EXECUTABLE_MODE_SUFFIX,
	GIT_SYMLINK_MODE,
} from '../contracts/constants/work-ref.constant';

export const runOutput = async (
	run: IWipEngine['context']['run'],
	args: readonly string[],
): Promise<string | undefined> => {
	const result = await run(args);
	return result.ok ? result.output.trim() : undefined;
};

export const readIndex = async (
	root: string,
	run: IWipEngine['context']['run'],
): Promise<string | null> => {
	const indexPath = await runOutput(run, [
		'rev-parse',
		'--git-path',
		'index',
	]);
	if (indexPath === undefined || indexPath.length === 0) return null;
	// Hash the index through git rather than reading it: the guard only
	// needs to know the bytes did not change, and a content hash proves
	// that exactly without this plugin opening a file outside the
	// SafeWorkspaceReader boundary. A missing index hashes to null.
	const digest = await runOutput(run, [
		'hash-object',
		'--no-filters',
		isAbsolute(indexPath) ? indexPath : resolve(root, indexPath),
	]);
	return digest === undefined || digest.length === 0 ? null : digest;
};

export const snapshot = async (engine: IWipEngine): Promise<IRepoSnapshot> => ({
	head: await runOutput(engine.context.run, ['rev-parse', 'HEAD']),
	branch: await runOutput(engine.context.run, [
		'symbolic-ref',
		'--quiet',
		'--short',
		'HEAD',
	]),
	index: await readIndex(engine.context.root, engine.context.run),
});

export const snapshotUnchanged = (
	before: IRepoSnapshot,
	after: IRepoSnapshot,
): boolean =>
	before.head === after.head &&
	before.branch === after.branch &&
	before.index === after.index;

export const integrationBase = async (
	engine: IWipEngine,
	policy: IResolvedDevelopmentPolicy,
): Promise<string | undefined> =>
	runOutput(engine.context.run, [
		'rev-parse',
		'--verify',
		`${policy.branches.integration}^{commit}`,
	]);

export const readBaseEntry = async (
	run: IWipEngine['context']['run'],
	baseSha: string,
	path: string,
): Promise<IBaseEntry | undefined> => {
	const result = await run([
		'--literal-pathspecs',
		'ls-tree',
		'-z',
		baseSha,
		'--',
		path,
	]);
	if (!result.ok) return undefined;
	const line = result.output.split('\0')[0] ?? '';
	const match = /^(\d+)\s+(\w+)\s+[0-9a-f]+\t/u.exec(line);
	return match?.[1] !== undefined && match[2] !== undefined
		? { mode: match[1], type: match[2] }
		: undefined;
};

export const readBaseBlob = async (
	root: string,
	baseSha: string,
	path: string,
): Promise<Uint8Array> =>
	new Promise((resolveBlob, rejectBlob) => {
		execFile(
			'git',
			['show', `${baseSha}:${path}`],
			{
				cwd: root,
				encoding: 'buffer',
				maxBuffer: GIT_BLOB_MAX_BUFFER_BYTES,
			},
			(error, stdout) => {
				if (error !== null) {
					rejectBlob(error);
					return;
				}
				resolveBlob(stdout as Uint8Array);
			},
		);
	});

export const removeDeclaredPath = async (
	absolute: string,
): Promise<boolean> => {
	let info: Awaited<ReturnType<typeof lstat>>;
	try {
		info = await lstat(absolute);
	} catch {
		return false;
	}
	if (info.isDirectory() && !info.isSymbolicLink()) {
		const children = await readdir(absolute);
		if (children.length > 0) {
			throw new Error(
				`refusing to remove non-empty directory ${absolute}`,
			);
		}
		await rm(absolute, { recursive: false });
		return true;
	}
	await unlink(absolute);
	return true;
};

export const cleanToBase = async (
	engine: IWipEngine,
	baseSha: string,
	paths: readonly string[],
): Promise<{
	readonly cleaned: readonly string[];
	readonly deleted: readonly string[];
}> => {
	const plans: ICleanPlan[] = [];
	for (const path of paths) {
		await assertContainedParent(engine.context.root, path);
		const entry = await readBaseEntry(engine.context.run, baseSha, path);
		if (entry === undefined) {
			plans.push({ path, entry: undefined, blob: undefined });
			continue;
		}
		if (entry.type !== 'blob') {
			throw new Error(
				`cannot clean unsupported git tree entry ${path} (${entry.type})`,
			);
		}
		plans.push({
			path,
			entry,
			blob: await readBaseBlob(engine.context.root, baseSha, path),
		});
	}

	const cleaned: string[] = [];
	const deleted: string[] = [];
	for (const plan of plans) {
		const absolute = join(engine.context.root, plan.path);
		await assertContainedParent(engine.context.root, plan.path);
		if (plan.entry === undefined) {
			if (await removeDeclaredPath(absolute)) deleted.push(plan.path);
			continue;
		}
		let info: Awaited<ReturnType<typeof lstat>> | undefined;
		try {
			info = await lstat(absolute);
		} catch {
			info = undefined;
		}
		if (info?.isDirectory() && !info.isSymbolicLink()) {
			throw new Error(
				`refusing to replace directory ${plan.path} with a base file`,
			);
		}
		await mkdir(dirname(absolute), { recursive: true });
		if (info?.isSymbolicLink()) await unlink(absolute);
		if (plan.entry.mode === GIT_SYMLINK_MODE) {
			await symlink(
				Buffer.from(plan.blob ?? []).toString('utf8'),
				absolute,
			);
		} else {
			// writeFileAtomic, not writeFile: a torn checkout file is a
			// worse failure than a slow one, and it takes `Uint8Array`
			// verbatim so a binary blob survives the round trip.
			await writeFileAtomic(absolute, plan.blob ?? new Uint8Array());
			await chmod(
				absolute,
				plan.entry.mode.endsWith(GIT_EXECUTABLE_MODE_SUFFIX)
					? 0o755
					: 0o644,
			);
		}
		cleaned.push(plan.path);
	}
	return { cleaned, deleted };
};

/**
 * Verify that every existing parent is a real directory, never a symlink.
 * `join(root, path)` is lexically contained but would still escape through a
 * symlinked parent. Missing parents are safe: `mkdir` creates them below the
 * already-validated prefix.
 */
export const assertContainedParent = async (
	root: string,
	path: string,
): Promise<void> => {
	let current = root;
	const parent = dirname(path);
	for (const component of parent.split('/').filter(Boolean)) {
		current = join(current, component);
		try {
			const info = await lstat(current);
			if (info.isSymbolicLink() || !info.isDirectory()) {
				throw new Error(`path parent is not a real directory: ${path}`);
			}
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				'code' in error &&
				(error as NodeJS.ErrnoException).code === 'ENOENT'
			) {
				return;
			}
			throw error;
		}
	}
};

export const assertContainedPath = async (
	root: string,
	path: string,
): Promise<void> => {
	await assertContainedParent(root, path);
	try {
		if ((await lstat(join(root, path))).isSymbolicLink()) {
			throw new Error(`symlinked scope path is not claimable: ${path}`);
		}
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code === 'ENOENT'
		) {
			return;
		}
		throw error;
	}
};

/** Expand a claim before checkpointing so clean-up can be preflighted. */
export const expandClaimedScope = async (
	engine: IWipEngine,
	baseSha: string,
	paths: readonly string[],
): Promise<readonly string[]> => {
	const files = new Set<string>();
	const visit = async (path: string): Promise<void> => {
		const absolute = join(engine.context.root, path);
		try {
			const info = await lstat(absolute);
			if (info.isSymbolicLink()) {
				throw new Error(
					`symlinked scope path is not claimable: ${path}`,
				);
			}
			if (info.isDirectory() && !info.isSymbolicLink()) {
				for (const child of await readdir(absolute)) {
					await visit(`${path}/${child}`);
				}
				return;
			}
		} catch (error: unknown) {
			if (
				!(error instanceof Error) ||
				!('code' in error) ||
				(error as NodeJS.ErrnoException).code !== 'ENOENT'
			) {
				throw error;
			}
			// A missing path may still be a tracked deletion in the base.
		}
		files.add(path);
	};
	for (const path of paths) await visit(path);
	const tracked = await engine.context.run([
		'--literal-pathspecs',
		'ls-tree',
		'-r',
		'-z',
		'--name-only',
		baseSha,
		'--',
		...paths,
	]);
	for (const path of (tracked.ok ? tracked.output : '').split('\0')) {
		if (path.length > 0) files.add(path);
	}
	return [...files].sort();
};

/** `lstat` a claimed path under the root, or `undefined` when it does not exist. */
export const lstatUnder = async (root: string, path: string) =>
	lstat(join(root, path)).catch(() => undefined);
