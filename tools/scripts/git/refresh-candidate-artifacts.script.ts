#!/usr/bin/env bun
/**
 * refresh-candidate-artifacts — a candidate that is behind is brought up
 * to the integration branch WITH its derived files recomputed.
 *
 * WHY the existing refresh is not enough: `forge:refresh` merges the
 * integration branch into a candidate through a throwaway index, which
 * is what lets it run without moving the shared checkout. A textual
 * merge is the right answer for authored files and the wrong one for
 * derived files — the agent catalog is rendered from the proposals on
 * disk, so merging two versions of it produces a file neither generator
 * would produce, and `catalog:check` fails on the merge result.
 *
 * Measured over one session: six candidates went red on exactly that,
 * and the fix each time was a person running two generators and pushing.
 * That is the definition of work that should not need a person.
 *
 * So this does what the person did: one throwaway worktree per candidate
 * that is behind, merge, regenerate, push. It never touches the shared
 * checkout, never force-pushes, and a candidate whose merge conflicts is
 * reported and left exactly as it was — resolving somebody's conflict is
 * a decision about intent.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import {
	candidateDispositions,
	toBringForward,
} from '../forge/candidate-disposition';
import {
	currentQueueFacts,
	currentQueueOrder,
} from '../forge/keep-the-queue-moving.script';
import { repoRoot } from '../lib/repo-root';
import {
	GENERATED_REFRESH_COMMANDS,
	REGENERATED_PROJECTIONS,
} from './refresh-candidate-artifacts.constant';

import type { ICandidateRefresh } from './refresh-candidate-artifacts.interface';

export type { ICandidateRefresh } from './refresh-candidate-artifacts.interface';
export { GENERATED_REFRESH_COMMANDS } from './refresh-candidate-artifacts.constant';

const cleanEnvironment = (): NodeJS.ProcessEnv => {
	const environment = { ...process.env };
	for (const name of [
		'GIT_DIR',
		'GIT_WORK_TREE',
		'GIT_INDEX_FILE',
		'GIT_PREFIX',
		'GIT_COMMON_DIR',
	]) {
		delete environment[name];
	}
	return environment;
};

const git = (cwd: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: cleanEnvironment(),
		}).trim();
	} catch {
		return undefined;
	}
};

/** Publication refs the integration branch has moved past. */
export const staleCandidates = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	remote: string,
): readonly string[] => {
	const prefix = policy.branches.publicationRefPrefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '');
	if (prefix.length === 0) return [];
	const integration = `refs/remotes/${remote}/${policy.branches.integration}`;
	const listed =
		git(root, [
			'for-each-ref',
			'--format=%(refname:short)',
			`refs/remotes/${remote}/${prefix}**`,
		]) ?? '';
	return listed
		.split('\n')
		.map((name) => name.replace(new RegExp(`^${remote}/`, 'u'), ''))
		.filter((name) => name.length > 0)
		.filter((name) => {
			const behind = git(root, [
				'rev-list',
				'--count',
				`${remote}/${name}..${integration}`,
			]);
			return behind !== undefined && Number(behind) > 0;
		});
};

/**
 * Why a push was refused, from its output: the lines a hook or the remote
 * marks as a failure, else the last line. The refresh used to report only
 * "push refused", so a candidate the hydrator could not bring forward
 * stayed behind with no way to learn why short of redoing it by hand.
 */
export const pushRefusalReason = (output: string): string => {
	const lines = output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const marked = lines.filter((line) =>
		/✖|\berror\b|\bFAIL\b|rejected|refused|denied/iu.test(line),
	);
	const chosen = (marked.length > 0 ? marked : lines).slice(-3).join(' | ');
	return chosen.length > 0 ? chosen.slice(0, 500) : 'no output';
};

/** Push the candidate; the refusal reason, or undefined once pushed. */
const pushCandidate = (
	dir: string,
	remote: string,
	candidate: string,
): string | undefined => {
	try {
		execFileSync('git', ['push', remote, `HEAD:refs/heads/${candidate}`], {
			cwd: dir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: cleanEnvironment(),
		});
		return undefined;
	} catch (error) {
		const failed = error as { stdout?: string; stderr?: string };
		return pushRefusalReason(
			`${failed.stdout ?? ''}\n${failed.stderr ?? ''}`,
		);
	}
};

/**
 * Finish a merge whose every conflict is in a regenerated file, taking
 * the integration branch's side (the generator rewrites it next). Any
 * other conflict aborts the merge and returns false.
 */
const takeRegeneratedSide = (
	dir: string,
	regenerated: ReadonlySet<string>,
): boolean => {
	const conflicted = (
		git(dir, ['diff', '--name-only', '--diff-filter=U']) ?? ''
	)
		.split('\n')
		.filter((path) => path.length > 0);
	if (
		conflicted.length === 0 ||
		conflicted.some((path) => !regenerated.has(path))
	) {
		git(dir, ['merge', '--abort']);
		return false;
	}
	git(dir, ['checkout', '--theirs', '--', ...conflicted]);
	git(dir, ['add', '--', ...conflicted]);
	return (
		git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '--no-edit']) !==
		undefined
	);
};

/**
 * Merge, regenerate, push — in a throwaway worktree, so the shared
 * checkout never moves and a failure leaves nothing behind.
 */
export const refreshCandidate = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly candidate: string;
	readonly run?: (command: string, cwd: string) => boolean;
	/** Files a conflict may be resolved in; the declared projections by default. */
	readonly regenerated?: ReadonlySet<string>;
}): ICandidateRefresh => {
	const { root, policy, remote, candidate } = input;
	const dir = mkdtempSync(join(tmpdir(), 'candidate-refresh-'));
	const run =
		input.run ??
		((command: string, cwd: string): boolean => {
			try {
				execFileSync('bun', command.split(' '), {
					cwd,
					stdio: ['ignore', 'ignore', 'pipe'],
					env: cleanEnvironment(),
					timeout: 600_000,
				});
				return true;
			} catch {
				return false;
			}
		});
	try {
		if (
			git(root, [
				'worktree',
				'add',
				'--quiet',
				'--detach',
				dir,
				`${remote}/${candidate}`,
			]) === undefined
		) {
			return { candidate, state: 'failed', detail: 'no worktree' };
		}
		const merged = git(dir, [
			'merge',
			'--no-edit',
			`${remote}/${policy.branches.integration}`,
		]);
		if (
			merged === undefined &&
			!takeRegeneratedSide(
				dir,
				input.regenerated ?? REGENERATED_PROJECTIONS,
			)
		) {
			return {
				candidate,
				state: 'conflicted',
				detail: 'does not merge trivially; its author decides',
			};
		}
		const failed = GENERATED_REFRESH_COMMANDS.filter(
			(command) => !run(command, dir),
		);
		if (failed.length > 0) {
			return {
				candidate,
				state: 'failed',
				detail: `generators failed: ${failed.join(', ')}`,
			};
		}
		if ((git(dir, ['status', '--porcelain']) ?? '').length > 0) {
			git(dir, ['add', '-A']);
			git(dir, [
				'-c',
				'core.hooksPath=/dev/null',
				'commit',
				'-m',
				'chore(generated): recompute after refreshing the candidate',
			]);
		}
		const pushed = pushCandidate(dir, remote, candidate);
		return pushed !== undefined
			? { candidate, state: 'failed', detail: `push refused: ${pushed}` }
			: {
					candidate,
					state: 'refreshed',
					detail: 'merged and regenerated',
				};
	} finally {
		git(root, ['worktree', 'remove', '--force', dir]);
		rmSync(dir, { recursive: true, force: true });
	}
};

/**
 * Whether to ask the queue job to run now. After a refresh, so it arms
 * the head it just made level; and whenever the head is level but not
 * armed, because the job only runs on its own when the integration
 * branch moves. A head made level any other way (by its author, or by an
 * earlier pass whose dispatch failed) otherwise waited for a scheduled
 * run that does not come.
 */
export const shouldAskQueueToRun = (input: {
	readonly apply: boolean;
	readonly head: string | undefined;
	readonly refreshed: boolean;
	readonly headArmed: boolean;
}): boolean =>
	input.apply &&
	input.head !== undefined &&
	(input.refreshed || !input.headArmed);

const main = (): void => {
	const root = repoRoot();
	const config = JSON.parse(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	if (config.development === undefined) return;
	const policy = resolveDevelopmentPolicy({
		development: config.development,
	});
	const remote = process.env.DELENDAI_REMOTE ?? 'origin';
	const apply = process.argv.includes('--apply');
	// Only one candidate is brought forward: the oldest in the queue that
	// can be. Bringing every candidate forward on every merge put a merge
	// commit on each of them per merge, and the next merge made each one
	// obsolete. A candidate whose conflict is its author's to resolve is
	// passed over rather than holding the queue: the forge-side head skips
	// conflicting candidates too, so when every candidate conflicted in a
	// generated file there was no head and nothing ever moved.
	let queue: ReturnType<typeof currentQueueOrder>;
	try {
		queue = currentQueueOrder();
	} catch (error) {
		console.log(
			`refresh-candidate-artifacts: the queue could not be read (${error instanceof Error ? error.message : String(error)}); nothing was brought forward.`,
		);
		return;
	}
	const order = queue.map((entry) => entry.branch);
	const behind = new Set(staleCandidates(root, policy, remote));
	let head: string | undefined;
	const stale: string[] = [];
	for (const candidate of order) {
		if (!behind.has(candidate)) {
			head = candidate;
			break;
		}
		if (!apply) {
			console.log(
				`refresh-candidate-artifacts: ${candidate} is behind ${policy.branches.integration} (read-only)`,
			);
			head = candidate;
			stale.push(candidate);
			break;
		}
		const outcome = refreshCandidate({ root, policy, remote, candidate });
		console.log(
			`refresh-candidate-artifacts: ${outcome.candidate} — ${outcome.state}: ${outcome.detail}`,
		);
		// A conflict its author must resolve, a generator that failed or a
		// refused push: this candidate cannot be brought forward now, and
		// retrying it on every pass held back every candidate behind it.
		if (outcome.state !== 'refreshed') continue;
		head = candidate;
		stale.push(candidate);
		break;
	}
	console.log(
		`refresh-candidate-artifacts: head of the queue ${head ?? '(none)'}; ${stale.length === 0 ? 'already level' : 'behind'}${apply ? '' : ' — read-only; pass --apply'}.`,
	);
	bringForwardOthers(root, policy, remote, behind, apply, new Set(stale));
	// The queue arms the head once it is level. It runs on pushes to the
	// integration branch, not to a candidate, so it is asked to run now.
	if (
		shouldAskQueueToRun({
			apply,
			head,
			refreshed: stale.length > 0,
			headArmed: queue.some(
				(entry) => entry.branch === head && entry.armed,
			),
		})
	) {
		try {
			execFileSync(
				'gh',
				[
					'workflow',
					'run',
					'keep-the-queue-moving.yml',
					'--ref',
					policy.branches.integration,
				],
				{ stdio: 'ignore' },
			);
		} catch {
			console.log(
				'refresh-candidate-artifacts: could not ask the queue to run; it arms the head on its next run.',
			);
		}
	}
};

/**
 * Whether a candidate's head merges the integration branch: it was
 * brought forward already and judged against it.
 */
const headIsIntegrationMerge = (
	root: string,
	remote: string,
	integration: string,
	branch: string,
): boolean => {
	const second = git(root, [
		'rev-parse',
		'--verify',
		'-q',
		`${remote}/${branch}^2`,
	]);
	if (second === undefined || second.length === 0) return false;
	return (
		git(root, [
			'merge-base',
			'--is-ancestor',
			second,
			`refs/remotes/${remote}/${integration}`,
		]) !== undefined
	);
};

/**
 * The authored files a candidate and the integration branch both changed
 * since their merge base. Generated projections are left out: they are
 * regenerated on every refresh, so both sides touching them says nothing.
 */
export const overlappingFiles = (
	root: string,
	remote: string,
	integration: string,
	branch: string,
): readonly string[] => {
	const head = `refs/remotes/${remote}/${integration}`;
	const base = git(root, ['merge-base', `${remote}/${branch}`, head]);
	if (base === undefined || base.length === 0) return [];
	const changed = (tip: string): readonly string[] =>
		(git(root, ['diff', '--name-only', base, tip]) ?? '')
			.split('\n')
			.filter((path) => path.length > 0);
	const mine = new Set(changed(`${remote}/${branch}`));
	return changed(head).filter(
		(path) => mine.has(path) && !REGENERATED_PROJECTIONS.has(path),
	);
};

/**
 * Say what happens to every candidate, and bring forward the red ones
 * whose verdict is older than the integration branch (see
 * candidate-disposition.ts, the one statement of those rules).
 */
const bringForwardOthers = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	remote: string,
	behind: ReadonlySet<string>,
	apply: boolean,
	alreadyRefreshed: ReadonlySet<string>,
): void => {
	let facts: ReturnType<typeof currentQueueFacts>;
	try {
		facts = currentQueueFacts();
	} catch (error) {
		console.log(
			`refresh-candidate-artifacts: the candidates could not be read (${error instanceof Error ? error.message : String(error)}); no red candidate was brought forward.`,
		);
		return;
	}
	const verdicts = candidateDispositions(
		facts.facts.map((fact) => ({
			...fact,
			behind: behind.has(fact.headRef),
			headIsIntegrationMerge: headIsIntegrationMerge(
				root,
				remote,
				policy.branches.integration,
				fact.headRef,
			),
			overlapping: behind.has(fact.headRef)
				? overlappingFiles(
						root,
						remote,
						policy.branches.integration,
						fact.headRef,
					)
				: [],
		})),
		facts.publicationPrefix,
	);
	for (const verdict of verdicts) {
		console.log(
			`refresh-candidate-artifacts: #${String(verdict.number)} ${verdict.disposition} — ${verdict.why}.`,
		);
	}
	for (const candidate of toBringForward(verdicts)) {
		if (!apply || alreadyRefreshed.has(candidate)) continue;
		const outcome = refreshCandidate({ root, policy, remote, candidate });
		console.log(
			`refresh-candidate-artifacts: ${outcome.candidate} — ${outcome.state} (brought forward): ${outcome.detail}`,
		);
	}
};

if (import.meta.main) main();
