import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';

import type { IGitRunResult, IGitRunner } from '@mcp-vertex/core/public';
import { VALIDATE_LOG_RELATIVE_PATH } from '@mcp-vertex/proposals/lib/contracts/constants/proposal-paths.constant';
import * as planClosureEngine from '@mcp-vertex/proposals/lib/swarm/plan-closure.engine';
import {
	buildClosePlanRegistration,
	type IClosePlanToolOptions,
} from '@mcp-vertex/proposals/lib/tools/close-plan.tool';

const capture = async (options: IClosePlanToolOptions) => {
	let handler:
		| ((args: unknown) => Promise<{
				content: Array<{ text: string }>;
				structuredContent?: unknown;
				isError?: boolean;
		  }>)
		| undefined;
	let definition:
		| {
				dryRunSupported?: boolean;
				outputSchema?: ZodType<unknown>;
		  }
		| undefined;
	const registration = buildClosePlanRegistration(options);
	await registration.register({
		registerTool: (
			_name: string,
			registeredDefinition: unknown,
			registered: typeof handler,
		) => {
			definition = registeredDefinition as typeof definition;
			handler = registered;
		},
	} as never);
	return {
		dryRunSupported: registration.dryRunSupported,
		definition: definition!,
		handler: handler!,
	};
};

const writeIndex = async (
	options: IClosePlanToolOptions,
	file: string,
	status: string,
) =>
	writeFile(
		options.indexPathAbs,
		JSON.stringify({
			proposals: [
				{
					id: 'q99999',
					file,
					status,
					type: 'plan',
				},
			],
		}),
		'utf8',
	);

const writePlan = async (
	options: IClosePlanToolOptions,
	markdown: string,
	status = 'in-progress',
) => {
	const folder =
		status === 'done'
			? 'done/plans'
			: status === 'ready'
				? 'ready/plans'
				: status;
	const relPath = `${folder}/q99999-fixture.md`;
	await mkdir(join(options.proposalsDirAbs, folder), { recursive: true });
	await writeFile(join(options.proposalsDirAbs, relPath), markdown, 'utf8');
	await writeIndex(options, relPath, status);
	return { relPath, absPath: join(options.proposalsDirAbs, relPath) };
};

const seedRecentValidateLog = async (workspaceRoot: string) => {
	const validateLogPath = join(workspaceRoot, VALIDATE_LOG_RELATIVE_PATH);
	await mkdir(join(validateLogPath, '..'), { recursive: true });
	await writeFile(
		validateLogPath,
		`${JSON.stringify({
			ts: new Date().toISOString(),
			result: 'pass',
			exitCode: 0,
			logPath: '.cache/mcp-vertex/results/logs/validate.latest.log',
		})}\n`,
		'utf8',
	);
};

const buildPlanMarkdown = (input?: {
	readonly status?: string;
	readonly shippedIn?: string;
	readonly containsSlices?: readonly string[];
	readonly sliceStatuses?: Readonly<Record<string, string>>;
}) => {
	const status = input?.status ?? 'in-progress';
	const containsSlices = input?.containsSlices ?? [];
	const sliceStatuses = input?.sliceStatuses ?? {};
	const frontmatter = [
		'---',
		'id: q99999',
		'type: plan',
		`status: ${status}`,
		'track: plugins/proposals+tests',
		...(input?.shippedIn !== undefined
			? ['shipped-in:', `  - ${input.shippedIn}`]
			: []),
		...(containsSlices.length > 0
			? [
					'contains:',
					'  slices:',
					...containsSlices.map((sliceId) => `    - id: ${sliceId}`),
				]
			: []),
		'---',
		'',
		'# q99999',
	];
	const slicesSection = containsSlices.length
		? [
				'',
				'## Slices',
				...containsSlices.flatMap((sliceId) => [
					'',
					`### ${sliceId} - fixture`,
					`- status: ${sliceStatuses[sliceId] ?? 'done'}`,
				]),
			]
		: [];
	return [...frontmatter, ...slicesSection, ''].join('\n');
};

const parseSchemaSuccess = (
	schema: ZodType<unknown> | undefined,
	result: {
		content: Array<{ text: string }>;
		structuredContent?: unknown;
		isError?: boolean;
	},
) => {
	expect(result.isError).toBeUndefined();
	const body =
		result.structuredContent ?? JSON.parse(result.content[0]?.text ?? '{}');
	expect(schema).toBeDefined();
	return (schema as ZodType<unknown>).parse(body) as Record<string, unknown>;
};

describe('proposals_close_plan dryRun contract', () => {
	let root = '';
	let options: IClosePlanToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'close-plan-'));
		const proposalsDirAbs = join(root, 'docs/mcp-vertex/proposals');
		const indexPathAbs = join(
			root,
			'.cache/mcp-vertex/proposals/index.json',
		);
		await mkdir(join(proposalsDirAbs, 'in-progress'), { recursive: true });
		await mkdir(join(indexPathAbs, '..'), { recursive: true });
		await writeFile(
			join(proposalsDirAbs, 'in-progress/q99999-fixture.md'),
			'---\nid: q99999\ntype: plan\nstatus: in-progress\n---\n\n# q99999\n',
			'utf8',
		);
		await writeFile(
			indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'q99999',
						file: 'in-progress/q99999-fixture.md',
						status: 'in-progress',
						type: 'plan',
					},
				],
			}),
			'utf8',
		);
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs,
			indexPathAbs,
			workspaceRoot: root,
			requirePeerReview: false,
		};
		await writePlan(options, buildPlanMarkdown());
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('declares outputSchema support and validates the closable dry-run envelope without mutating the plan', async () => {
		const planPath = join(
			options.proposalsDirAbs,
			'in-progress/q99999-fixture.md',
		);
		const before = await readFile(planPath, 'utf8');
		const { definition, dryRunSupported, handler } = await capture(options);
		const result = await handler({ planId: 'q99999', dryRun: true });
		const body = parseSchemaSuccess(definition.outputSchema, result);

		expect(dryRunSupported).toBe(true);
		expect(definition.outputSchema).toBeDefined();
		expect(body).toMatchObject({
			dryRun: true,
			wouldChange: [
				{
					kind: 'rename',
					summary: 'move q99999 from in-progress to done',
				},
			],
			wouldRun: [
				{
					shape: 'mcp',
					target: 'proposal_transition',
				},
			],
			risk: 'medium',
		});
		expect(await readFile(planPath, 'utf8')).toBe(before);
	});

	it('validates the blocked dry-run envelope against the registered outputSchema', async () => {
		const closureSpy = vi
			.spyOn(planClosureEngine, 'evaluatePlanClosure')
			.mockResolvedValueOnce({
				planId: 'q99999',
				closable: false,
				reasons: [
					{
						ref: 'S1',
						kind: 'slice',
						code: 'not-done',
						message: "Own slice S1 is 'todo', expected 'done'",
					},
				],
				children: [
					{
						ref: 'S1',
						kind: 'slice',
						status: 'todo',
						peerReviewed: true,
					},
				],
				depth: 1,
			});
		const { definition, handler } = await capture(options);
		const result = await handler({ planId: 'q99999', dryRun: true });
		const body = parseSchemaSuccess(definition.outputSchema, result);

		expect(body).toMatchObject({
			dryRun: true,
			wouldChange: [],
			risk: 'medium',
		});
		expect(String(body.note)).toContain('blockers');
		expect(String(body.note)).toContain(
			"Own slice S1 is 'todo', expected 'done'",
		);
		closureSpy.mockRestore();
	});

	it('validates the applied close envelope against the registered outputSchema', async () => {
		await seedRecentValidateLog(root);
		await writePlan(
			options,
			buildPlanMarkdown({
				status: 'review',
				shippedIn: 'abcdef1',
			}),
			'review',
		);
		const gitCalls: string[][] = [];
		const gitRunner: IGitRunner = async (args) => {
			gitCalls.push([...args]);
			if (args[0] === 'ls-files') {
				return {
					ok: false,
					output: '',
					reason: 'not tracked',
				} satisfies IGitRunResult;
			}
			return { ok: true, output: '' } satisfies IGitRunResult;
		};
		const { definition, handler } = await capture({
			...options,
			gitRunner,
		});
		const result = await handler({
			planId: 'q99999',
			reason: 'all children are done',
		});
		const body = parseSchemaSuccess(definition.outputSchema, result);

		expect(body).toMatchObject({
			ok: true,
			planId: 'q99999',
			dryRun: false,
			closable: true,
			blockers: [],
			preview: { from: 'review', to: 'done' },
		});
		await expect(
			readFile(
				join(options.proposalsDirAbs, 'done/plans/q99999-fixture.md'),
				'utf8',
			),
		).resolves.toContain('status: done');
	});

	it('validates the blocked close envelope against the registered outputSchema', async () => {
		const fixture = await writePlan(options, buildPlanMarkdown());
		const before = await readFile(fixture.absPath, 'utf8');
		const closureSpy = vi
			.spyOn(planClosureEngine, 'evaluatePlanClosure')
			.mockResolvedValueOnce({
				planId: 'q99999',
				closable: false,
				reasons: [
					{
						ref: 'S1',
						kind: 'slice',
						code: 'not-done',
						message: "Own slice S1 is 'todo', expected 'done'",
					},
				],
				children: [
					{
						ref: 'S1',
						kind: 'slice',
						status: 'todo',
						peerReviewed: true,
					},
				],
				depth: 1,
			});
		const { definition, handler } = await capture(options);
		const result = await handler({
			planId: 'q99999',
			reason: 'attempt close with blocker present',
		});
		const body = parseSchemaSuccess(definition.outputSchema, result);

		expect(body).toMatchObject({
			planId: 'q99999',
			dryRun: false,
			closable: false,
			blockers: [
				{
					ref: 'S1',
					kind: 'slice',
					code: 'not-done',
				},
			],
		});
		expect(await readFile(fixture.absPath, 'utf8')).toBe(before);
		closureSpy.mockRestore();
	});

	// a00072 S4 — `proposals_close_plan` is the q00001 wrapper that
	// runs the closure preflight and, when closable, transitions the
	// plan to `done` with `skipDfaForPlanClosure: true`. Regression:
	// the wrapper MUST produce a non-error result for a plan whose
	// only contained proposal is already `done` and the plan is in
	// `in-progress` — the realistic flow after a child proposal
	// reaches `done` via the review→approve cycle.
	it('closes a plan with one done contained proposal (a00072 S4)', async () => {
		const planMarkdown = buildPlanMarkdown({ shippedIn: 'abcdef1' });
		await writePlan(options, planMarkdown);
		// Pre-flight reports the contained proposal is done; own slice is done.
		const closureSpy = vi
			.spyOn(planClosureEngine, 'evaluatePlanClosure')
			.mockResolvedValueOnce({
				planId: 'q99999',
				closable: true,
				reasons: [],
				children: [
					{
						ref: 'f09995',
						kind: 'proposal',
						status: 'done',
						peerReviewed: true,
					},
				],
				depth: 1,
			});
		const gitCalls: string[][] = [];
		const gitRunner: IGitRunner = async (args) => {
			gitCalls.push([...args]);
			if (args[0] === 'ls-files') {
				return {
					ok: false,
					output: '',
					reason: 'not tracked',
				} satisfies IGitRunResult;
			}
			return { ok: true, output: '' } satisfies IGitRunResult;
		};
		await seedRecentValidateLog(root);
		const { definition, handler } = await capture({
			...options,
			gitRunner,
		});
		const result = await handler({
			planId: 'q99999',
			reason: 'contained proposal is done',
		});
		const body = parseSchemaSuccess(definition.outputSchema, result);

		expect(body).toMatchObject({
			ok: true,
			planId: 'q99999',
			dryRun: false,
			closable: true,
			blockers: [],
			preview: { from: 'in-progress', to: 'done' },
		});
		// The wrapper actually moved the file — proves the DFA shortcut
		// reached `runProposalTransition`'s positive branch.
		const moved = await readFile(
			join(options.proposalsDirAbs, 'done/plans/q99999-fixture.md'),
			'utf8',
		);
		expect(moved).toContain('status: done');
		// One of `mv <from> <to>` (tracked) or `add <newPath>` (untracked
		// + plain rename fallback) MUST have run, both proving the
		// wrapper actually moved the plan file out of `in-progress/`.
		expect(
			gitCalls.some((c) => {
				if (c[0] !== 'mv' && c[0] !== 'add') return false;
				return c.some((arg) => String(arg).includes('q99999'));
			}),
		).toBe(true);
		closureSpy.mockRestore();
	});
});
