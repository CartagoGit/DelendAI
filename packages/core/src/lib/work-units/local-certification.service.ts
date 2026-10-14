/**
 * local-certification.service.ts — the local gate that certifies a merge
 * candidate, under a profile whose forge holds no check.
 *
 * WHAT IS CERTIFIED: the candidate commit, i.e. the integration head with
 * the work merged in — exactly the tree that would land. Certifying the
 * work ref alone would answer a question about a state the branch will
 * never be in.
 *
 * WHERE: a detached worktree of that commit, added inside the git
 * directory and removed afterwards. The shared checkout is where other
 * agents are editing; running a gate there would test their loose edits
 * and could rewrite their files. Inside the git directory the worktree
 * never shows as an untracked path and dies with the repository.
 *
 * WITH WHICH GATE: the one the integration head declares, read from that
 * commit — never the candidate's own declaration, or a unit could land by
 * weakening the gate it carries.
 *
 * FAIL CLOSED: a project that declares no gate, a candidate that could not
 * be put on disk, and a step that failed all yield a report that does not
 * pass. Nothing here can turn "could not check" into "checked".
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	ICertificationCommandRunner,
	ICertificationStepResult,
	ICertifyCandidateRequest,
	ILocalCertificationReport,
} from '../contracts/interfaces/local-certification.interface';
import { validationGateSteps } from './validation-gate-steps.service';

/** How many trailing lines of a failed step's output a report keeps. */
const OUTPUT_TAIL_LINES = 20;

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
				maxBuffer: 16 * 1024 * 1024,
			}).trim(),
		};
	} catch (error) {
		const stderr =
			typeof error === 'object' && error !== null && 'stderr' in error
				? String((error as { stderr?: unknown }).stderr ?? '')
				: '';
		return { ok: false, out: stderr.trim() };
	}
};

/**
 * The default runner: a shell, output captured rather than inherited. The
 * `work` tool answers over the MCP transport on stdout, and a gate that
 * printed there would corrupt the answer.
 */
export const runCertificationCommand: ICertificationCommandRunner = (
	command,
	cwd,
) => {
	const result = spawnSync(command, {
		cwd,
		shell: true,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024,
	});
	return {
		code: result.status ?? 1,
		output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error === undefined ? '' : String(result.error)}`,
	};
};

const tailOf = (output: string): string =>
	output.trimEnd().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');

/** Run the integration head's declared gate against one candidate commit. */
export const certifyCandidate = async (
	request: ICertifyCandidateRequest,
): Promise<ILocalCertificationReport> => {
	const { root, candidateSha, integrationSha } = request;
	const base = {
		againstIntegrationSha: integrationSha,
		candidateSha,
	};
	const steps = validationGateSteps((path) => {
		const shown = git(root, ['show', `${integrationSha}:${path}`]);
		return shown.ok ? shown.out : undefined;
	});
	if (steps.length === 0) {
		return { ...base, declared: false, passed: false, steps: [] };
	}

	const gitDir = git(root, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	if (!gitDir.ok || gitDir.out.length === 0) {
		return {
			...base,
			declared: true,
			passed: false,
			steps: [],
			setupFailure: `could not locate the git directory: ${gitDir.out}`,
		};
	}
	const parent = join(gitDir.out, 'delendai-certify');
	const dir = join(
		parent,
		`${candidateSha.slice(0, 12)}-${String(process.pid)}-${String(Date.now())}`,
	);
	await mkdir(parent, { recursive: true });
	const added = git(root, [
		'worktree',
		'add',
		'--detach',
		'-q',
		dir,
		candidateSha,
	]);
	if (!added.ok) {
		return {
			...base,
			declared: true,
			passed: false,
			steps: [],
			setupFailure: `could not put ${candidateSha.slice(0, 12)} on disk to run the gate: ${added.out}`,
		};
	}
	try {
		const run = request.run ?? runCertificationCommand;
		// Every step runs: one blocker found per attempt costs an attempt
		// per blocker.
		const results: ICertificationStepResult[] = steps.map((step) => {
			const outcome = run(step.command, dir);
			if (outcome.code === 0) return { ...step, passed: true };
			const tail = tailOf(outcome.output);
			return tail.length === 0
				? { ...step, passed: false }
				: { ...step, passed: false, outputTail: tail };
		});
		return {
			...base,
			declared: true,
			passed: results.every((step) => step.passed),
			steps: results,
		};
	} finally {
		git(root, ['worktree', 'remove', '--force', dir]);
		git(root, ['worktree', 'prune']);
	}
};
