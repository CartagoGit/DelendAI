#!/usr/bin/env bun
/**
 * proposal-review.script.ts — record ONE peer-review verdict from the
 * terminal, against the same log the transition gate reads
 * (`.cache/delendai/proposals/peer-review.jsonl`).
 *
 * This is not a bypass: it drives the same `buildReviewRegistration`
 * handler the MCP tool exposes, with the same independence rule
 * (reviewer ≠ implementer) and the same evidence fields. It exists
 * because the running MCP host caches plugin code across fixes, and
 * because eight one-off `proposal-review-<id>.script.ts` files had
 * accumulated for what is a single parameterised operation.
 *
 * Usage:
 *   bun tools/scripts/review/proposal-review.script.ts \
 *     --id=f00307 --slice=S1 --agent=<reviewer> --action=approve \
 *     --note="what you actually checked, and how" \
 *     [--commit=<sha>] [--tests-passing=N --tests-total=N] \
 *     [--validate-exit=0]
 *
 * `--action` accepts the verdicts the review tool accepts (approve,
 * request_changes, submit …); it defaults to `approve`.
 *
 * Exit codes:
 *   0 — the verdict was recorded.
 *   1 — the review tool refused it (envelope printed verbatim).
 *   2 — bad invocation.
 */
import { join } from 'node:path';

import { buildReviewRegistration } from '@delendai/proposals/lib/tools/authoring.tool';
import type { IAuthoringToolOptions } from '@delendai/proposals/lib/tools/authoring.tool';

export interface IReviewCliArgs {
	readonly proposalId: string;
	readonly sliceId: string;
	readonly agent: string;
	readonly action: string;
	readonly note: string;
	readonly commitHash?: string | undefined;
	readonly testsPassing?: number | undefined;
	readonly testsTotal?: number | undefined;
	readonly validateExitCode?: number | undefined;
}

const flag = (argv: readonly string[], name: string): string | undefined => {
	const prefix = `--${name}=`;
	const hit = argv.find((entry) => entry.startsWith(prefix));
	return hit === undefined ? undefined : hit.slice(prefix.length);
};

const numberFlag = (
	argv: readonly string[],
	name: string,
): number | undefined => {
	const raw = flag(argv, name);
	if (raw === undefined) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
};

/** Pure: argv -> the fields the review tool needs, or a usage error. */
export const parseReviewCliArgs = (
	argv: readonly string[],
): IReviewCliArgs | { readonly error: string } => {
	const proposalId = flag(argv, 'id');
	const sliceId = flag(argv, 'slice');
	const agent = flag(argv, 'agent');
	const note = flag(argv, 'note');
	if (proposalId === undefined) return { error: 'missing --id=<proposalId>' };
	if (sliceId === undefined) return { error: 'missing --slice=<sliceId>' };
	if (agent === undefined) return { error: 'missing --agent=<reviewer>' };
	if (note === undefined || note.trim().length === 0) {
		return {
			error: 'missing --note="what you checked" — a verdict with no stated evidence is not a review',
		};
	}
	return {
		proposalId,
		sliceId,
		agent,
		note,
		action: flag(argv, 'action') ?? 'approve',
		commitHash: flag(argv, 'commit'),
		testsPassing: numberFlag(argv, 'tests-passing'),
		testsTotal: numberFlag(argv, 'tests-total'),
		validateExitCode: numberFlag(argv, 'validate-exit'),
	};
};

const main = async (argv = process.argv.slice(2)): Promise<number> => {
	const parsed = parseReviewCliArgs(argv);
	if ('error' in parsed) {
		process.stderr.write(`${parsed.error}\n`);
		return 2;
	}
	const workspaceRoot = process.cwd();
	const options: IAuthoringToolOptions = {
		namespacePrefix: 'proposals',
		workspaceRoot,
		proposalsDirAbs: join(workspaceRoot, 'docs/delendai/proposals'),
		indexPathAbs: join(
			workspaceRoot,
			'.cache/delendai/proposals/index.json',
		),
		lockPathAbs: join(workspaceRoot, '.cache/delendai/agents.lock.json'),
		peerReviewLogPathAbs: join(
			workspaceRoot,
			'.cache/delendai/proposals/peer-review.jsonl',
		),
		counterPathAbs: join(
			workspaceRoot,
			'.cache/delendai/proposals/proposal-id-counters.json',
		),
		layout: {
			proposalsDir: 'docs/delendai/proposals',
			proposalIndexFile: '.cache/delendai/proposals/index.json',
		},
		extraFolders: [],
		validationCommand: 'bun run validate',
	};
	const registration = buildReviewRegistration(options);
	let handler:
		| ((args: unknown) => Promise<{ content?: Array<{ text: string }> }>)
		| undefined;
	await registration.register({
		registerTool: (
			_name: string,
			_schema: unknown,
			fn: (args: unknown) => Promise<{
				content?: Array<{ text: string }>;
			}>,
		) => {
			handler = fn;
		},
	} as never);
	if (handler === undefined) {
		process.stderr.write('review tool did not register a handler\n');
		return 2;
	}
	const evidence = {
		...(parsed.commitHash !== undefined
			? { commitHash: parsed.commitHash }
			: {}),
		...(parsed.validateExitCode !== undefined
			? { validateExitCode: parsed.validateExitCode }
			: {}),
		...(parsed.testsPassing !== undefined
			? { testsPassing: parsed.testsPassing }
			: {}),
		...(parsed.testsTotal !== undefined
			? { testsTotal: parsed.testsTotal }
			: {}),
	};
	const result = await handler({
		proposalId: parsed.proposalId,
		sliceId: parsed.sliceId,
		action: parsed.action,
		agent: parsed.agent,
		note: parsed.note,
		...(Object.keys(evidence).length > 0 ? { evidence } : {}),
	});
	const text = result.content?.[0]?.text ?? '';
	process.stdout.write(`${text}\n`);
	return text.includes('"ok":false') ? 1 : 0;
};

if (import.meta.main) {
	process.exit(await main());
}
