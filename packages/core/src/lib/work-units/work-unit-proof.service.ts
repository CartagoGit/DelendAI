/**
 * work-unit-proof.service.ts — prove a unit before it is published as a
 * pull request.
 *
 * Every agent is told "Prove the candidate in isolation BEFORE you publish
 * it", and on the pull-request route nothing ran a proof: an agent that
 * skipped the sentence published red work, and the forge spent a full run
 * finding out. Publishing now runs the proof itself.
 *
 * WHICH PROOF: the project's `prove` script — the fast pre-flight — else
 * the gate it declares for certification (`validation-gate-steps`). Read
 * from the integration head, never from the unit, so a unit cannot pass by
 * weakening the proof it carries.
 *
 * WHAT IT IS NOT: a certification. Nothing recorded here reaches the
 * forge, and the forge's checks run in full regardless; the proof only
 * spares the author a run that was going to fail.
 *
 * REMEMBERED: a passing proof is recorded under the git directory by the
 * tree it proved and the steps it ran. The same tree with the same proof
 * is not proved twice — which is also what lets an agent prove first
 * (`work prove`) and hand over through a tool call that returns at once.
 */
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IDeclarationReader } from '../contracts/interfaces/local-certification.interface';
import type {
	IProveUnitRequest,
	IUnitProofReport,
} from '../contracts/interfaces/unit-proof.interface';
import { commitSubjectFor } from '../shared/commit-call-writes';
import { readWorkspaceDocsDir } from './development-policy.service';
import { runGitCommand } from '../shared/git-command.helper';
import { runCertificationCommand } from './local-certification.service';
import {
	packageManagerFrom,
	validationGateSteps,
} from './validation-gate-steps.service';

/** How many trailing lines of a failed step's output a report keeps. */
const OUTPUT_TAIL_LINES = 20;

/**
 * The proof a project declares: its `prove` script, else its gate. Empty
 * when it declares neither.
 */
export const candidateProofSteps = (
	read: IDeclarationReader,
): readonly { readonly scope: string; readonly command: string }[] => {
	const text = read('package.json');
	if (text !== undefined) {
		try {
			const scripts = (JSON.parse(text) as { scripts?: unknown }).scripts;
			if (
				typeof scripts === 'object' &&
				scripts !== null &&
				typeof (scripts as Record<string, unknown>).prove === 'string'
			) {
				return [
					{
						scope: 'prove',
						command: `${packageManagerFrom(read)} run prove`,
					},
				];
			}
		} catch {
			// A package.json that does not parse declares no script.
		}
	}
	return validationGateSteps(read);
};

/** The key a proof is remembered by: the tree, and the steps run on it. */
export const proofKey = (
	tree: string,
	steps: readonly { readonly command: string }[],
): string =>
	createHash('sha256')
		.update(tree)
		.update('\0')
		.update(steps.map((step) => step.command).join('\n'))
		.digest('hex');

const git = (cwd: string, args: readonly string[]) => runGitCommand(cwd, args);

const exists = async (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

/** How far back a proof is looked for across tool document commits above it. */
const TOOL_COMMIT_HOPS = 8;

/** The subject every commit a product tool makes for its writes starts with. */
const TOOL_COMMIT_SUBJECT = commitSubjectFor('', {}).trimEnd();

/**
 * Whether `sha` only records documents a product tool wrote: a commit the
 * tool-call writer made, changing nothing but Markdown under the docs
 * directory. Moving a proposal to review is one such commit; without this
 * the hand-over re-ran a proof the same code had just passed, inside the
 * tool call that moved it.
 */
const isToolDocumentCommit = (
	root: string,
	sha: string,
	docsDir: string,
): boolean => {
	const subject = git(root, ['log', '-1', '--format=%s', sha]);
	if (!subject.ok || !subject.out.startsWith(TOOL_COMMIT_SUBJECT)) {
		return false;
	}
	const changed = git(root, ['diff', '--name-only', `${sha}^`, sha]);
	const prefix = `${docsDir.replace(/\/+$/u, '')}/`;
	return (
		changed.ok &&
		changed.out
			.split('\n')
			.filter(Boolean)
			.every((path) => path.startsWith(prefix) && path.endsWith('.md'))
	);
};

const tailOf = (output: string): string =>
	output.trimEnd().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');

/** Prove a unit's tip with the proof the integration head declares. */
export const proveUnit = async (
	request: IProveUnitRequest,
): Promise<IUnitProofReport> => {
	const { root, tipSha, integrationSha } = request;
	const steps = candidateProofSteps((path) => {
		const shown = git(root, ['show', `${integrationSha}:${path}`]);
		return shown.ok ? shown.out : undefined;
	});
	if (steps.length === 0) return { declared: false, passed: true, steps: [] };
	const tree = git(root, ['rev-parse', `${tipSha}^{tree}`]);
	const gitDir = git(root, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	if (!tree.ok || !gitDir.ok) {
		return {
			declared: true,
			passed: false,
			steps,
			setupFailure: `could not read the unit's tree: ${tree.ok ? gitDir.out : tree.out}`,
		};
	}
	const proofs = join(gitDir.out, 'delendai-proofs');
	const docsDir = await readWorkspaceDocsDir(root);
	const record = join(proofs, proofKey(tree.out, steps));
	// The tip's own tree, else the tree before the transitions on top of it.
	for (let sha = tipSha, hop = 0; hop <= TOOL_COMMIT_HOPS; hop += 1) {
		const proved = git(root, ['rev-parse', `${sha}^{tree}`]);
		if (
			proved.ok &&
			(await exists(join(proofs, proofKey(proved.out, steps))))
		) {
			return { declared: true, passed: true, steps, remembered: true };
		}
		if (!isToolDocumentCommit(root, sha, docsDir)) break;
		sha = git(root, ['rev-parse', `${sha}^`]).out;
	}

	// The unit's own worktree, when it stands on the tip with nothing
	// uncommitted: what runs there is exactly what would be published.
	const own =
		request.worktree !== undefined &&
		git(request.worktree, ['rev-parse', 'HEAD']).out === tipSha &&
		git(request.worktree, ['status', '--porcelain']).out.length === 0
			? request.worktree
			: undefined;
	if (request.worktree !== undefined && own === undefined) {
		return {
			declared: true,
			passed: false,
			steps,
			setupFailure: `${request.worktree} is not on the unit's tip with a clean tree: commit (or drop) what is uncommitted, then publish again — the proof covers what is published, nothing else.`,
		};
	}
	const temporary =
		own === undefined
			? join(
					gitDir.out,
					'delendai-prove',
					`${tipSha.slice(0, 12)}-${String(process.pid)}-${String(Date.now())}`,
				)
			: undefined;
	if (temporary !== undefined) {
		await mkdir(join(gitDir.out, 'delendai-prove'), { recursive: true });
		const added = git(root, [
			'worktree',
			'add',
			'--detach',
			'-q',
			temporary,
			tipSha,
		]);
		if (!added.ok) {
			return {
				declared: true,
				passed: false,
				steps,
				setupFailure: `could not put ${tipSha.slice(0, 12)} on disk to prove it: ${added.out}`,
			};
		}
	}
	const dir = own ?? temporary ?? root;
	const inTip = (path: string): boolean =>
		git(root, ['cat-file', '-e', `${tipSha}:${path}`]).ok;
	const run = request.run ?? runCertificationCommand;
	try {
		// A fresh checkout has no dependencies; a project with no package
		// manifest has none to install (its proof is `make test`, say).
		if (
			temporary !== undefined &&
			(await exists(join(dir, 'package.json')))
		) {
			const install = run(
				`${packageManagerFrom((path) => (inTip(path) ? '' : undefined))} install`,
				dir,
			);
			if (install.code !== 0) {
				return {
					declared: true,
					passed: false,
					steps,
					setupFailure: `could not install the unit's dependencies to prove it:\n${tailOf(install.output)}`,
				};
			}
		}
		// Every step runs: one blocker found per attempt costs an attempt
		// per blocker.
		const results = steps.map((step) => {
			const outcome = run(step.command, dir);
			if (outcome.code === 0) return { ...step, passed: true };
			const tail = tailOf(outcome.output);
			return tail.length === 0
				? { ...step, passed: false }
				: { ...step, passed: false, outputTail: tail };
		});
		const passed = results.every((step) => step.passed);
		if (passed) {
			await mkdir(join(gitDir.out, 'delendai-proofs'), {
				recursive: true,
			});
			await writeFile(
				record,
				`${JSON.stringify({ tree: tree.out, tip: tipSha, steps: steps.map((step) => step.command), at: new Date().toISOString() })}\n`,
			);
		}
		return { declared: true, passed, steps: results };
	} finally {
		if (temporary !== undefined) {
			git(root, ['worktree', 'remove', '--force', temporary]);
			git(root, ['worktree', 'prune']);
		}
	}
};

/** The refusal a failed proof publishes nothing with, naming each failure. */
export const describeFailedProof = (report: IUnitProofReport): string =>
	report.setupFailure !== undefined
		? `The unit could not be proved: ${report.setupFailure}`
		: [
				'The unit was NOT published: its proof failed.',
				...report.steps.flatMap((step) =>
					'passed' in step && !step.passed
						? [
								`- ${step.command} failed${'outputTail' in step && step.outputTail !== undefined ? `:\n${step.outputTail}` : ''}`,
							]
						: [],
				),
			].join('\n');

/** Whether the policy proves a unit before publishing it as a pull request. */
export const provesBeforePublishing = (policy: {
	readonly integration: {
		readonly requiresPullRequest: boolean;
		readonly requiresLocalCertification: boolean;
	};
}): boolean =>
	policy.integration.requiresPullRequest &&
	policy.integration.requiresLocalCertification;

/** What a publication says about the proof it ran. */
export const proofSummary = (report: IUnitProofReport) =>
	report.declared
		? { declared: true, remembered: report.remembered === true }
		: {
				declared: false,
				nextAction:
					'Declare how a unit is proved before it is published: a `prove` script in package.json, or `validationMatrix.scopes` in delendai.config.json.',
			};
