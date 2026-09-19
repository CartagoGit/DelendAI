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

/** Configure the driver for this clone. Idempotent. */
export const installGeneratedMergeDriver = (
	workspaceRoot: string,
	invocation: IGeneratedMergeDriverInvocation,
): IGeneratedMergeDriverReport => {
	const command = driverCommand(invocation);
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
