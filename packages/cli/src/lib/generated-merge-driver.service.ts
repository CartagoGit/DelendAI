/**
 * generated-merge-driver.service.ts — teach this clone how to merge the
 * files it generates.
 *
 * WHY it is configured per clone and not committed: `.gitattributes` can
 * name a merge driver, but the driver's command lives in git config,
 * which git deliberately never takes from the repository — a repository
 * that could run arbitrary commands on clone would be a supply-chain
 * hole. So the attribute ships with the project and the command is
 * configured by the installer that already runs at boot.
 *
 * WHY a clone without it is no worse off: an unconfigured driver makes
 * git fall back to the normal merge, which is exactly today's behaviour.
 * Nothing breaks; the conflicts simply come back.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join as joinPath } from 'node:path';

import type {
	IGeneratedMergeDriverReport,
	IGeneratedMergeDriverInvocation,
} from '../contracts/interfaces/generated-merge-driver.interface';
import { GENERATED_MERGE_DRIVER } from '../contracts/constants/generated-merge-driver.constant';

export type {
	IGeneratedMergeDriverReport,
	IGeneratedMergeDriverInvocation,
} from '../contracts/interfaces/generated-merge-driver.interface';
export { GENERATED_MERGE_DRIVER } from '../contracts/constants/generated-merge-driver.constant';

const git = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly out: string } => {
	try {
		return {
			ok: true,
			out: execFileSync('git', args, {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			}).trim(),
		};
	} catch (error) {
		return {
			ok: false,
			out:
				typeof error === 'object' && error !== null && 'stderr' in error
					? String(
							(error as { stderr?: unknown }).stderr ?? '',
						).trim()
					: '',
		};
	}
};

/** The command git will run for a conflict in a generated file. */
export const driverCommand = (
	invocation: IGeneratedMergeDriverInvocation,
): string => `${invocation.runner} ${invocation.script} %O %A %B %P`;

/**
 * A runtime that can actually execute the driver script, or `undefined`.
 *
 * The driver is TypeScript with extensionless imports, which Bun runs and
 * Node does not. Every caller defaulted the runner to `process.execPath`
 * — whatever happened to be running the installer — so the command git
 * ended up with depended on the host: a terminal using Bun configured a
 * working driver, and an editor extension, an `npx` invocation or an
 * agent running the CLI under Node configured one that cannot start.
 *
 * That failure is SILENT in the worst way: git calls the driver, the
 * driver cannot load, git keeps the conflict, and the repository looks
 * exactly like one with no driver at all — which is the stall this whole
 * mechanism exists to remove.
 *
 * So the runtime is resolved rather than assumed, and when none can be
 * found nothing is configured: git's own merge is a correct fallback,
 * and a broken driver is not.
 */
export const resolveDriverRuntime = (
	workspaceRoot: string,
	preferred?: string,
	host: {
		readonly isBun?: boolean;
		readonly execPath?: string;
		readonly onPath?: (cwd: string) => string | undefined;
	} = {},
): string | undefined => {
	if (preferred !== undefined && preferred.length > 0) return preferred;
	// The process running this, but only if it is Bun. Injectable, because
	// the host is exactly the variable under test: the same code must
	// answer differently in a Bun terminal and in a Node-hosted editor.
	const isBun = host.isBun ?? process.versions.bun !== undefined;
	if (isBun) return host.execPath ?? process.execPath;
	const candidates = [
		joinPath(workspaceRoot, 'node_modules', '.bin', 'bun'),
		joinPath(workspaceRoot, 'node_modules', '.bin', 'bun.exe'),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	// Last resort: whatever `bun` resolves to on PATH.
	return (host.onPath ?? whichBun)(workspaceRoot);
};

/** `bun` as PATH resolves it, or `undefined` when it is not there. */
const whichBun = (cwd: string): string | undefined => {
	try {
		const found = execFileSync(
			process.platform === 'win32' ? 'where' : 'which',
			['bun'],
			{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
		)
			.split('\n')[0]
			?.trim();
		return found === undefined || found.length === 0 ? undefined : found;
	} catch {
		return undefined;
	}
};

/** Configure the driver for this clone. Idempotent. */
export const installGeneratedMergeDriver = (
	workspaceRoot: string,
	invocation: IGeneratedMergeDriverInvocation,
): IGeneratedMergeDriverReport => {
	const runtime = resolveDriverRuntime(
		workspaceRoot,
		invocation.explicitRunner,
	);
	if (runtime === undefined) {
		// Configure NOTHING. An unconfigured driver falls back to git's
		// normal merge, which is exactly today's behaviour; a configured
		// one that cannot start looks identical and is a lie.
		return {
			name: GENERATED_MERGE_DRIVER,
			state: 'unsupported',
			command: '',
			reason: 'no runtime on this host can run the driver script (it is TypeScript; Bun runs it, Node does not)',
		};
	}
	const command = driverCommand({ ...invocation, runner: runtime });
	const current = git(workspaceRoot, [
		'config',
		'--get',
		`merge.${GENERATED_MERGE_DRIVER}.driver`,
	]);
	if (current.ok && current.out === command) {
		return { name: GENERATED_MERGE_DRIVER, state: 'unchanged', command };
	}
	const named = git(workspaceRoot, [
		'config',
		`merge.${GENERATED_MERGE_DRIVER}.name`,
		'regenerate a delendai-generated file instead of merging it',
	]);
	const set = git(workspaceRoot, [
		'config',
		`merge.${GENERATED_MERGE_DRIVER}.driver`,
		command,
	]);
	if (!named.ok || !set.ok) {
		return {
			name: GENERATED_MERGE_DRIVER,
			state: 'unsupported',
			command,
			reason: `git config refused: ${[named.out, set.out].filter(Boolean).join('; ')}`,
		};
	}
	return {
		name: GENERATED_MERGE_DRIVER,
		state: current.ok && current.out.length > 0 ? 'updated' : 'configured',
		command,
	};
};

/** Remove the driver from this clone, leaving normal merges behind. */
export const uninstallGeneratedMergeDriver = (
	workspaceRoot: string,
): IGeneratedMergeDriverReport => {
	const removed = git(workspaceRoot, [
		'config',
		'--remove-section',
		`merge.${GENERATED_MERGE_DRIVER}`,
	]);
	return {
		name: GENERATED_MERGE_DRIVER,
		state: removed.ok ? 'removed' : 'absent',
		command: '',
	};
};

/** What this clone currently does with a conflicted generated file. */
export const inspectGeneratedMergeDriver = (
	workspaceRoot: string,
): IGeneratedMergeDriverReport => {
	const current = git(workspaceRoot, [
		'config',
		'--get',
		`merge.${GENERATED_MERGE_DRIVER}.driver`,
	]);
	return current.ok && current.out.length > 0
		? {
				name: GENERATED_MERGE_DRIVER,
				state: 'configured',
				command: current.out,
			}
		: {
				name: GENERATED_MERGE_DRIVER,
				state: 'absent',
				command: '',
				reason: 'generated files merge line by line, as they did before',
			};
};
