#!/usr/bin/env bun
/**
 * derived-resolve.script.ts — a derived-file conflict, in the two jobs the
 * land workflow runs.
 *
 *   --phase=prepare --pr=<n> --out=<dir>   holds no token. Merges the
 *     integration branch into the pull request's head in a throwaway
 *     worktree, runs the project's `derived.command`, and writes the
 *     result as a git bundle. It runs the pull request's code, so nothing
 *     it writes is trusted.
 *   --phase=push --pr=<n> --in=<dir>       holds the identity (GH_TOKEN).
 *     Rebuilds the plain merge itself, refuses any difference from it
 *     outside `derived.paths`, and pushes without force; nothing is pushed
 *     if the head moved.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { prepareDerived, pushDerived } from '@delendai/core/cli';

import {
	GENERATED_REFRESH_COMMANDS,
	REGENERATED_PROJECTIONS,
} from './land-derived.constant';
import { readDevelopmentConfig } from './land-policy';
import {
	discardTrain,
	assembleTrain,
	regenerateWith,
	TRAIN_REGENERATION_SUBJECT,
} from './train-assembly';
import { identityPushEnv, runGit } from './land-forward';

const flag = (name: string): string | undefined =>
	process.argv
		.find((a) => a.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const gh = (args: readonly string[]): string =>
	execFileSync('gh', [...args], { encoding: 'utf8' }).trim();

interface IMeta {
	readonly sha: string;
	readonly head: string;
	readonly tip: string;
}

const prepare = (
	pr: number,
	out: string,
	commands: readonly string[],
	derived: readonly string[],
): number => {
	const root = process.cwd();
	runGit(root, ['fetch', '-q', 'origin', `refs/pull/${String(pr)}/head`]);
	const head = runGit(root, ['rev-parse', 'FETCH_HEAD']);
	const integration = resolveDevelopmentPolicy(readDevelopmentConfig())
		.branches.integration;
	runGit(root, ['fetch', '-q', 'origin', integration]);
	const tip = runGit(root, ['rev-parse', `origin/${integration}`]);
	const built = assembleTrain({
		root,
		remote: root,
		tipSha: tip,
		ref: `derived/${String(pr)}`,
		members: [{ number: pr, headRef: `pull/${String(pr)}`, headSha: head }],
		derived: new Set(derived),
		regenerate: regenerateWith(commands),
		rehearsal: true,
	});
	if (built.scratch === undefined || built.conflicting.length > 0) {
		console.error(
			`derived-resolve: #${String(pr)} conflicts in authored code: its author updates it.`,
		);
		if (built.scratch !== undefined) discardTrain(root, built.scratch);
		return 1;
	}
	const sha = runGit(built.scratch, ['rev-parse', 'HEAD']);
	const changed =
		runGit(built.scratch, ['log', '-1', '--format=%s', 'HEAD']) ===
		TRAIN_REGENERATION_SUBJECT
			? runGit(built.scratch, ['diff', '--name-only', 'HEAD~1', 'HEAD'])
					.split('\n')
					.filter((p) => p !== '')
			: [];
	const verdict = prepareDerived({
		derivedPaths: derived,
		base: tip,
		ports: {
			merge: () => 'merged',
			regenerate: () => true,
			result: () => ({ sha, changed }),
		},
	});
	if (verdict.kind !== 'ready') {
		console.error(`derived-resolve: refused: ${JSON.stringify(verdict)}`);
		discardTrain(root, built.scratch);
		return 1;
	}
	runGit(built.scratch, ['branch', '-f', 'derived-result', 'HEAD']);
	runGit(built.scratch, [
		'bundle',
		'create',
		join(out, 'result.bundle'),
		'derived-result',
		`^${head}`,
		`^${tip}`,
	]);
	writeFileSync(
		join(out, 'meta.json'),
		JSON.stringify({ sha, head, tip } satisfies IMeta),
	);
	discardTrain(root, built.scratch);
	console.log(`derived-resolve: #${String(pr)} prepared ${sha.slice(0, 12)}`);
	return 0;
};

const push = (pr: number, from: string, derived: readonly string[]): number => {
	const root = process.cwd();
	const token = process.env.GH_TOKEN ?? '';
	const meta = JSON.parse(
		readFileSync(join(from, 'meta.json'), 'utf8'),
	) as IMeta;
	const info = JSON.parse(
		gh([
			'api',
			`repos/${process.env.GITHUB_REPOSITORY ?? ''}/pulls/${String(pr)}`,
		]),
	) as {
		head: {
			ref: string;
			sha: string;
			repo?: { full_name?: string } | null;
		};
		base: { repo: { full_name: string } };
	};
	if (info.head.repo?.full_name !== info.base.repo.full_name) {
		console.error(
			'derived-resolve: a cross-repository head is never pushed.',
		);
		return 1;
	}
	runGit(root, ['fetch', '-q', 'origin', info.head.sha, meta.tip]);
	runGit(root, [
		'fetch',
		'-q',
		join(from, 'result.bundle'),
		'derived-result:refs/derived/result',
	]);
	const result = runGit(root, ['rev-parse', 'refs/derived/result']);
	if (result !== meta.sha) {
		console.error(
			'derived-resolve: the artifact is not the commit it names.',
		);
		return 1;
	}
	// The plain merge, rebuilt here: nothing differs from it outside the derived paths.
	const plain = assembleTrain({
		root,
		remote: root,
		tipSha: meta.tip,
		ref: 'derived/plain',
		members: [{ number: pr, headRef: info.head.ref, headSha: meta.head }],
		derived: new Set(derived),
		regenerate: () => true,
		linkDependencies: () => true,
		rehearsal: true,
	});
	if (plain.scratch === undefined || plain.conflicting.length > 0) return 1;
	try {
		const verdict = pushDerived({
			derivedPaths: derived,
			expectedHead: meta.head,
			prepared: { kind: 'ready', sha: meta.sha, base: meta.tip },
			ports: {
				headNow: () => info.head.sha,
				changedBy: (sha) =>
					runGit(plain.scratch as string, [
						'diff',
						'--name-only',
						'HEAD',
						sha,
					])
						.split('\n')
						.filter((p) => p !== ''),
				push: (sha) => {
					try {
						runGit(
							root,
							[
								'push',
								'-q',
								'origin',
								`${sha}:refs/heads/${info.head.ref}`,
							],
							identityPushEnv(token),
						);
						return true;
					} catch {
						return false;
					}
				},
			},
		});
		console.log(`derived-resolve: #${String(pr)} ${verdict}`);
		return verdict === 'pushed' || verdict === 'head-moved' ? 0 : 1;
	} finally {
		discardTrain(root, plain.scratch);
	}
};

if (import.meta.main) {
	const integration = resolveDevelopmentPolicy(
		readDevelopmentConfig(),
	).integration;
	const pr = Number(flag('pr'));
	const phase = flag('phase');
	const dir = flag('out') ?? flag('in') ?? '';
	if (!Number.isInteger(pr) || dir === '') {
		console.error(
			'derived-resolve: --pr=<n> and --out=<dir> (prepare) or --in=<dir> (push) are required.',
		);
		process.exit(2);
	}
	// The policy's declaration wins; this repository's own list is the default.
	const paths =
		integration.derived.paths.length > 0
			? integration.derived.paths
			: [...REGENERATED_PROJECTIONS];
	const commands =
		integration.derived.command === ''
			? GENERATED_REFRESH_COMMANDS
			: integration.derived.command
					.split('\n')
					.filter((c) => c.trim() !== '');
	process.exit(
		phase === 'prepare'
			? prepare(pr, dir, commands, paths)
			: phase === 'push'
				? push(pr, dir, paths)
				: 2,
	);
}
