/**
 * work-unit-prove-only.service.ts — `work prove --only=<gate>`: run one
 * gate of the project's proof, exactly as the proof runs it, in the unit's
 * own worktree.
 *
 * A gate failed minutes into a proof, and the only way to see it again was
 * the whole proof, or an approximation of it that passed while the proof
 * failed. The proof script (`prove`) owns its gates and their names; this
 * hands it `--only` and reports what it printed.
 *
 * NEVER PROOF: nothing is remembered and nothing is handed over. A partial
 * run leaves the unit unproved, so `work deliver` and `work publish` still
 * run the whole proof. The compute slot is the script's to take, and it
 * takes it only for the heavy gates it was asked to run.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICertificationCommandRunner } from '../contracts/interfaces/local-certification.interface';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { committedFileReader } from './committed-file-reader.helper';
import { scalarArg } from './command-args.helper';
import { runCertificationCommand } from './local-certification.service';
import { candidateProofSteps } from './work-unit-proof.service';
import {
	integrationBase,
	mainWorktreeOf,
	openWork,
	readGit,
	refused,
} from './work-unit-shared.service';

/** How many trailing lines of the run a result keeps. */
const OUTPUT_TAIL_LINES = 40;

/** Gate names are slugs: the value reaches a shell, so nothing else does. */
const GATE_LIST = /^[a-z0-9][a-z0-9-]*(,[a-z0-9][a-z0-9-]*)*$/u;

/** Whether the call asks for one gate instead of the whole proof. */
export const asksForOneGate = (args: readonly string[]): boolean =>
	args.some((arg) => arg.startsWith('--only='));

export const provedOnly = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
	run: ICertificationCommandRunner = runCertificationCommand,
): Promise<IWorkUnitResult> => {
	const only = scalarArg(args, 'only') ?? '';
	if (!GATE_LIST.test(only)) {
		return {
			code: EXIT_CODE.USAGE,
			error: 'work prove --only=<gate>[,<gate>...] names gates as kebab-case slugs; a failed proof prints each gate it failed.',
		};
	}
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const here = readGit(opened.root, ['rev-parse', '--show-toplevel']);
	const shared = mainWorktreeOf(opened.root);
	if (here === undefined || here === shared) {
		return refused(
			'A partial proof runs in a unit worktree, never in the shared checkout.',
			'Run it from the worktree `work enter` printed (or pass --workspace=<that path>).',
		);
	}
	const base = integrationBase(shared, opened.policy);
	if (base === undefined) {
		return refused(
			`${opened.policy.branches.integration} resolves to no commit in this clone.`,
			'Fetch the integration branch.',
		);
	}
	return partialProofOf({
		only,
		steps: candidateProofSteps(committedFileReader(shared, base)),
		cwd: here,
		run,
	});
};

/**
 * The partial run itself: the project's one `prove` command with `--only`,
 * in the unit's worktree. Never recorded as a proof.
 */
export const partialProofOf = (request: {
	readonly only: string;
	readonly steps: readonly {
		readonly scope: string;
		readonly command: string;
	}[];
	readonly cwd: string;
	readonly run: ICertificationCommandRunner;
}): IWorkUnitResult => {
	const { only, steps, cwd, run } = request;
	const [proof] = steps;
	if (steps.length !== 1 || proof?.scope !== 'prove') {
		return refused(
			'This project declares no `prove` script, so it has no gates to run one at a time.',
			'Add a `prove` script to package.json that accepts `--only=<gate>`.',
		);
	}
	const outcome = run(`${proof.command} -- --only=${only}`, cwd);
	const output = outcome.output
		.trimEnd()
		.split('\n')
		.slice(-OUTPUT_TAIL_LINES)
		.join('\n');
	if (outcome.code === 0) {
		return {
			code: EXIT_CODE.OK,
			data: { only, partial: true, proved: false, output },
		};
	}
	return {
		code:
			outcome.code === EXIT_CODE.USAGE
				? EXIT_CODE.USAGE
				: EXIT_CODE.VALIDATION,
		error: `${output}\npartial: the unit is not proved`,
	};
};
