/**
 * work-unit-prove.service.ts — `work prove`: run the proof publishing
 * would run, without publishing.
 *
 * A passing proof is remembered by the tree it proved, so the publication
 * that follows — `work publish`, or the hand-over a proposal transition
 * makes over a tool call — does not run it again.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { argumentsRefused } from './work-arguments.helper';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IBaseSubtraction,
	IUnitProofReport,
} from '../contracts/interfaces/unit-proof.interface';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { publicationRefFromWorkRef } from './work-publish.service';
import { worktreeOfRef } from './unit-removal.service';
import { asksForOneGate, provedOnly } from './work-unit-prove-only.service';
import { existingWorkRef } from './work-unit-generation.service';
import { describeFailedProof, proveUnit } from './work-unit-proof.service';
import {
	agentFor,
	integrationBase,
	mainWorktreeOf,
	openWork,
	readGit,
	refused,
} from './work-unit-shared.service';

/** The spec files a failed step names in its output tail. */
const HAS_SPEC = /\.spec\.[cm]?[jt]sx?/u;
const SPEC_PATH = /[\w./@-]+\.spec\.[cm]?[jt]sx?/gu;

export const failingSpecsOf = (report: IUnitProofReport): readonly string[] =>
	report.steps.flatMap((step) =>
		'passed' in step && !step.passed
			? [...(step.outputTail ?? '').matchAll(SPEC_PATH)].map((m) => m[0])
			: [],
	);

/**
 * A failing spec in develop's known-failing set fails the proof only if the
 * unit touched its footprint (`touched`: its files and the specs that read
 * them); otherwise it is reported as a base failure. A failed step that
 * names no spec stays the unit's.
 */
export const subtractBaseFailures = (input: {
	readonly report: IUnitProofReport;
	readonly known: ReadonlySet<string>;
	readonly touched: ReadonlySet<string>;
}): IBaseSubtraction => {
	const { report, known, touched } = input;
	const failing = failingSpecsOf(report);
	const base = failing.filter((s) => known.has(s) && !touched.has(s));
	const own = failing.filter((s) => !base.includes(s));
	const everyStepNamesASpec = report.steps.every(
		(step) =>
			!('passed' in step) ||
			step.passed ||
			HAS_SPEC.test(step.outputTail ?? ''),
	);
	return {
		own,
		base,
		passed:
			report.setupFailure === undefined &&
			own.length === 0 &&
			base.length > 0 &&
			everyStepNamesASpec,
	};
};

/** develop's known-failing specs for a commit, kept under the git directory; empty when none. */
const readKnownFailing = async (
	root: string,
	commit: string,
): Promise<ReadonlySet<string>> => {
	const dir = readGit(root, ['rev-parse', '--git-common-dir']);
	if (dir === undefined) return new Set();
	try {
		const raw = await readFile(
			join(root, dir, 'delendai', 'known-failing', `${commit}.json`),
			'utf8',
		);
		const parsed: unknown = JSON.parse(raw);
		return new Set(
			Array.isArray(parsed)
				? parsed.filter((v): v is string => typeof v === 'string')
				: [],
		);
	} catch {
		return new Set();
	}
};

export const proved = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	if (asksForOneGate(args)) return provedOnly(args, ctx);
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { policy } = opened;
	const root = mainWorktreeOf(opened.root);
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const agent = agentFor(args, root, policy.identity);
	if (proposal === undefined || slice === undefined || agent.length === 0) {
		return argumentsRefused('prove');
	}
	const workRef = existingWorkRef(root, args, policy, agent, proposal, slice);
	const tip = readGit(root, ['rev-parse', '-q', '--verify', workRef]);
	const base = integrationBase(root, policy);
	if (tip === undefined || base === undefined) {
		return refused(
			`${tip === undefined ? workRef : policy.branches.integration} resolves to no commit in this clone.`,
			'Enter the unit first (`work enter`), and fetch the integration branch.',
		);
	}
	const worktree = worktreeOfRef(
		root,
		workRef.replace(/^refs\/heads\//u, ''),
	);
	const publication = publicationRefFromWorkRef(policy, workRef);
	// Where the unit stands, proved or not: `work deliver` asks this first,
	// so it works from any directory.
	if (args.includes('--locate')) {
		return {
			code: EXIT_CODE.OK,
			data: {
				workRef,
				...(worktree === undefined ? {} : { worktree }),
				...(publication === undefined ? {} : { publication }),
			},
		};
	}
	const proof = await proveUnit({
		root,
		agent,
		worktree,
		tipSha: tip,
		integrationSha: base,
		urgency: { args, proposal, policy },
	});
	const known = proof.passed
		? new Set<string>()
		: await readKnownFailing(root, base);
	const touched = new Set(
		(readGit(root, ['diff', '--name-only', `${base}...${tip}`]) ?? '')
			.split('\n')
			.filter((line) => line.length > 0),
	);
	const subtracted = subtractBaseFailures({ report: proof, known, touched });
	if (!proof.passed && !subtracted.passed) {
		return refused(
			describeFailedProof(proof).replace(
				'was NOT published',
				'was not proved',
			),
			'Fix what failed, commit it in the unit, and prove again.',
		);
	}
	return {
		code: EXIT_CODE.OK,
		data: {
			workRef,
			...(worktree === undefined ? {} : { worktree }),
			proved: proof.declared,
			...(subtracted.base.length === 0
				? {}
				: { baseFailures: subtracted.base }),
			remembered: proof.remembered === true,
			...(proof.declared
				? {}
				: {
						nextAction:
							'Nothing is declared to prove a unit: add a `prove` script to package.json, or `validationMatrix.scopes` to delendai.config.json.',
					}),
		},
	};
};
