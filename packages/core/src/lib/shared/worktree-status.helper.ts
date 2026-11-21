/**
 * worktree-status.helper.ts — the one `git status` a worktree's dirty-state
 * readers share.
 *
 * Each reader used to ask git its own way (`--porcelain`, `--porcelain=v1
 * -z`, with or without `--untracked-files=all`, with or without a
 * pathspec), so one work invocation listed the same tree two or three
 * times and the invocation memo could answer none of the repeats. They
 * now ask the same question, which the memo answers once per worktree
 * until git writes something.
 */
import type {
	IWorktreeBranchStatus,
	IWorktreeStatus,
	IWorktreeStatusEntry,
} from '../contracts/interfaces/worktree-status.interface';
import { WORKTREE_STATUS_ARGS } from '../contracts/constants/worktree-status.constant';
import { gitVerbatim } from './git-read.helper';

export { WORKTREE_STATUS_ARGS } from '../contracts/constants/worktree-status.constant';

export type {
	IWorktreeBranchStatus,
	IWorktreeStatus,
	IWorktreeStatusEntry,
} from '../contracts/interfaces/worktree-status.interface';

/** Fields before the path: `1 XY sub mH mI mW hH hI <path>`, and so on. */
const FIELDS_BEFORE_PATH: Readonly<Record<string, number>> = {
	'1': 8,
	'2': 9,
	u: 10,
};

/** `text` after its first `count` space-separated fields. */
const afterFields = (text: string, count: number): string => {
	let at = 0;
	for (let field = 0; field < count; field += 1) {
		at = text.indexOf(' ', at) + 1;
		if (at === 0) return '';
	}
	return text.slice(at);
};

const readBranchHeader = (
	branch: Record<string, string | number>,
	header: string,
): void => {
	const [name = '', ...rest] = header.split(' ');
	const value = rest.join(' ');
	if (name === 'branch.oid') branch.oid = value;
	else if (name === 'branch.head') branch.head = value;
	else if (name === 'branch.upstream') branch.upstream = value;
	else if (name === 'branch.ab') {
		const [ahead = '', behind = ''] = rest;
		branch.ahead = Number(ahead.replace('+', ''));
		branch.behind = Number(behind.replace('-', ''));
	}
};

/** Parse `git status --porcelain=v2 --branch -z` output. */
export const parseWorktreeStatus = (output: string): IWorktreeStatus => {
	const fields = output.split('\0');
	const branch: Record<string, string | number> = {};
	const entries: IWorktreeStatusEntry[] = [];
	for (let index = 0; index < fields.length; index += 1) {
		const field = fields[index] ?? '';
		const kind = field.charAt(0);
		if (kind === '#') readBranchHeader(branch, field.slice(2));
		else if (kind === '?' || kind === '!')
			entries.push({ code: `${kind}${kind}`, path: field.slice(2) });
		else if (FIELDS_BEFORE_PATH[kind] !== undefined) {
			const path = afterFields(field, FIELDS_BEFORE_PATH[kind]);
			const code = field.slice(2, 4).replaceAll('.', ' ');
			if (kind === '2') {
				index += 1;
				entries.push({ code, path, from: fields[index] ?? '' });
			} else entries.push({ code, path });
		}
	}
	return { branch: branch as IWorktreeBranchStatus, entries };
};

/** Every path the status names: each entry's, and each rename's source. */
export const worktreeStatusPaths = (
	status: IWorktreeStatus,
): readonly string[] => [
	...new Set(
		status.entries.flatMap((entry) =>
			entry.from === undefined || entry.from.length === 0
				? [entry.path]
				: [entry.path, entry.from],
		),
	),
];

/** The worktree's status, or `undefined` when git could not tell. */
export const readWorktreeStatus = (
	cwd: string,
): IWorktreeStatus | undefined => {
	const output = gitVerbatim(cwd, WORKTREE_STATUS_ARGS);
	return output === undefined ? undefined : parseWorktreeStatus(output);
};

/** The paths `cwd` changed, or `undefined` when git could not tell. */
export const readWorktreeChanges = (
	cwd: string,
): readonly string[] | undefined => {
	const status = readWorktreeStatus(cwd);
	return status === undefined ? undefined : worktreeStatusPaths(status);
};
