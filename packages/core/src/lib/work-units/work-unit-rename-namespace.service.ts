/**
 * work-unit-rename-namespace.service.ts — `delendai work rename-namespace
 * [--apply]`, the explicit end of a namespace transition (f00808 S7).
 * A dry run unless `--apply`.
 */
import { execFileSync } from 'node:child_process';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import {
	applyNamespaceRename,
	planNamespaceRename,
} from './namespace-rename.service';
import {
	integrationRemote,
	openWork,
	readGit,
	refused,
} from './work-unit-shared.service';

/** The open pull requests' heads, or `undefined` when the forge cannot say. */
const openHeadsOf = (root: string) => (): readonly string[] | undefined => {
	try {
		return execFileSync(
			'gh',
			[
				'pr',
				'list',
				'--state',
				'open',
				'--limit',
				'1000',
				'--json',
				'headRefName',
				'--jq',
				'.[].headRefName',
			],
			{
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			},
		)
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	} catch {
		return undefined;
	}
};

export const namespaceRenamed = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy } = opened;
	const remote = integrationRemote(root, policy);
	const listed = readGit(root, ['ls-remote', '--heads', remote]);
	if (listed === undefined) {
		return refused(
			`The branches on \`${remote}\` could not be listed.`,
			'Check the remote and try again; nothing was renamed.',
		);
	}
	const branches = listed
		.split('\n')
		.map((line) => line.split('\t'))
		.filter(([sha, ref]) => sha !== undefined && ref !== undefined)
		.map(([sha = '', ref = '']) => ({
			sha,
			name: ref.replace(/^refs\/heads\//u, ''),
		}));
	const openHeads = openHeadsOf(root);
	const plan = planNamespaceRename({
		policy,
		branches,
		openHeads: openHeads(),
	});
	if (plan.refusal !== undefined) {
		return refused(plan.refusal, 'Run it again once that has changed.');
	}
	if (plan.moves.length === 0) {
		return {
			code: EXIT_CODE.OK,
			text: 'No ref is left under a former namespace. Remove development.branches.formerNamespacePrefixes from delendai.config.json.',
			data: { moves: [] },
		};
	}
	if (!args.includes('--apply')) {
		return {
			code: EXIT_CODE.OK,
			text: `Would rename ${String(plan.moves.length)} ref(s), keeping each tip:\n${plan.moves.map((move) => `  ${move.from} -> ${move.to}`).join('\n')}\nRun with --apply to rename them.`,
			data: { moves: plan.moves, applied: false },
		};
	}
	const result = applyNamespaceRename({
		git: (gitArgs) => ({ ok: readGit(root, gitArgs) !== undefined }),
		remote,
		moves: plan.moves,
		openHeads,
	});
	return {
		code:
			result.stopped === undefined ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		text: [
			`Renamed ${String(result.moved.length)} ref(s).`,
			...(result.stopped === undefined ? [] : [result.stopped]),
		].join('\n'),
		data: { moves: plan.moves, applied: true, ...result },
	};
};
