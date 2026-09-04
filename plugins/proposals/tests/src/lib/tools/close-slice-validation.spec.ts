/**
 * close-slice-validation.spec.ts — a00072 S5.
 *
 * `close_slice` now requires recent validate evidence (inline or from
 * validate.jsonl) before it flips a slice to done. The old shell-out
 * helper remains unit-tested separately because hosts may still reuse it.
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import {
	buildCloseSliceRegistration,
	runCloseSliceValidation,
	sliceRequiresValidation,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

const recentValidate = () => ({
	timestamp: new Date().toISOString(),
	exitCode: 0,
});

const staleValidate = () => ({
	timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
	exitCode: 0,
});

const writeProposal = (
	opts: IAuthoringToolOptions,
	rel: string,
	body: string,
): string => {
	const abs = join(opts.proposalsDirAbs, rel);
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, body, 'utf8');
	// Index shape matches syncProposalRegistry (`proposals`, not `entries`).
	mkdirSync(join(opts.indexPathAbs, '..'), { recursive: true });
	const id = /id:\s*(\S+)/.exec(body)?.[1] ?? 'f00001';
	writeFileSync(
		opts.indexPathAbs,
		JSON.stringify({
			generated_at: new Date().toISOString(),
			count: 1,
			proposals: [
				{
					id,
					file: rel,
					status: 'in-progress',
					type: 'unspecified',
				},
			],
		}),
		'utf8',
	);
	return abs;
};

/**
 * Resolve the on-disk path of a proposal by reading the registry
 * index. `close_slice` calls `syncProposalRegistry`, which may move
 * the file from `in-progress/` to `done/<kind>/` after writing the
 * new status. The test must read from the live location, not the
 * one it wrote.
 */
const readProposal = (
	opts: IAuthoringToolOptions,
	proposalId: string,
	fallbackAbs: string,
): string => {
	const indexRaw = readFileSync(opts.indexPathAbs, 'utf8');
	const index = JSON.parse(indexRaw) as {
		proposals: Array<{ id: string; file: string }>;
	};
	const entry = index.proposals.find(
		(p) => p.id === proposalId || p.id.startsWith(`${proposalId}-`),
	);
	return entry === undefined
		? fallbackAbs
		: join(opts.proposalsDirAbs, entry.file);
};

describe('sliceRequiresValidation (a00069 S5 pure helper)', () => {
	it('skips gate: none / lint and empty blocks', () => {
		expect(sliceRequiresValidation('- **Gate**: none\n')).toBe(false);
		expect(sliceRequiresValidation('- **Gate**: lint\n')).toBe(false);
		expect(sliceRequiresValidation('')).toBe(false);
	});

	it('requires validation for type/e2e gates and bun run validate acceptance', () => {
		expect(sliceRequiresValidation('- **Gate**: type\n')).toBe(true);
		expect(sliceRequiresValidation('- **Gate**: e2e\n')).toBe(true);
		expect(sliceRequiresValidation('- **Gate**: bun run validate\n')).toBe(
			true,
		);
		// Canonical acceptance block used by create_proposal / plan parser.
		expect(
			sliceRequiresValidation('- acceptance:\n  - "bun run validate"\n'),
		).toBe(true);
		expect(
			sliceRequiresValidation('- acceptance:\n  - "bun run test"\n'),
		).toBe(true);
		expect(sliceRequiresValidation('- acceptance:\n  - "bun test"\n')).toBe(
			true,
		);
	});

	it('still requires validate when gate is none but acceptance lists bun test', () => {
		expect(
			sliceRequiresValidation(
				'- **Gate**: none\n- acceptance:\n  - "bun run test"\n',
			),
		).toBe(true);
	});
});

describe('runCloseSliceValidation', () => {
	it('returns a bounded timeout instead of leaving a host call to be cancelled', async () => {
		const result = await runCloseSliceValidation(
			'bun -e "await Bun.sleep(200)"',
			process.cwd(),
			25,
		);
		expect(result).toMatchObject({ ok: false, exitCode: 124 });
		expect(result.output).toMatch(/timeout/i);
	});
});

describe('close_slice validation gate (a00069 S5)', () => {
	let root = '';
	let opts: IAuthoringToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'close-slice-val-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/delendai/proposals'),
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(
				root,
				'.cache/delendai/proposals/counters.json',
			),
			layout: {
				proposalsDir: 'docs/delendai/proposals',
				proposalIndexFile: '.cache/delendai/proposals/index.json',
			},
			validationCommand: 'bun run validate',
			requirePeerReview: false,
		};
		mkdirSync(opts.proposalsDirAbs, { recursive: true });
		mkdirSync(join(root, '.cache/delendai/proposals'), {
			recursive: true,
		});
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const writeValidateLog = (entries: readonly Record<string, unknown>[]) => {
		const logPath = join(
			root,
			'.cache/delendai/results/logs/validate.jsonl',
		);
		mkdirSync(join(logPath, '..'), { recursive: true });
		writeFileSync(
			logPath,
			`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
			'utf8',
		);
	};

	const docWithGate = (gate: string): string => `---
id: f00001
kind: feat
status: in-progress
---

# f00001

## Slices

### S1 — fixture slice
- **Status**: pending
- **Files**: \`plugins/demo/src/index.ts\`
- **Gate**: ${gate}
`;

	it('refuses to close without validate evidence and leaves status pending', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('bun run validate'),
		);
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({ proposalId: 'f00001', sliceId: 'S1' }),
		);
		expect(result.ok).toBe(false);
		expect(result.blockerType).toBe('validate-required');
		// The refusal now states which of the three blocked states this
		// is, so an agent that already ran validate is not told to run
		// it again. With an empty journal that state is `never-ran`.
		expect(result.validateState).toBe('never-ran');
		expect(result.error?.reason ?? '').toMatch(/no validate run/i);
		expect(result.error?.nextAction ?? '').toContain('bun run validate');
		const body = readFileSync(readProposal(opts, 'f00001', abs), 'utf8');
		expect(body).toContain('**Status**: pending');
		expect(body).not.toMatch(/\*\*Status\*\*:\s*done/i);
	});

	it('closes when inline validate evidence is recent', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('type'),
		);
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({
				proposalId: 'f00001',
				sliceId: 'S1',
				validateEvidence: recentValidate(),
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.closed).toBe(true);
		const body = readFileSync(readProposal(opts, 'f00001', abs), 'utf8');
		expect(body).toMatch(/\*\*Status\*\*:\s*done/i);
	});

	it('refuses stale inline validate evidence', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('lint'),
		);
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({
				proposalId: 'f00001',
				sliceId: 'S1',
				validateEvidence: staleValidate(),
			}),
		);
		expect(result.ok).toBe(false);
		expect(result.blockerType).toBe('validate-required');
		const body = readFileSync(readProposal(opts, 'f00001', abs), 'utf8');
		expect(body).toMatch(/\*\*Status\*\*:\s*pending/i);
	});

	it('reads the most recent passing validate entry from disk and skips malformed lines', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('lint'),
		);
		writeValidateLog([
			{ invalid: 'yes' },
			{
				ts: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
				result: 'pass',
				exitCode: 0,
			},
			{
				ts: new Date().toISOString(),
				result: 'pass',
				exitCode: 0,
			},
		]);
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({ proposalId: 'f00001', sliceId: 'S1' }),
		);
		expect(result.ok).toBe(true);
		expect(result.closed).toBe(true);
		const body = readFileSync(readProposal(opts, 'f00001', abs), 'utf8');
		expect(body).toMatch(/\*\*Status\*\*:\s*done/i);
	});

	it('force:true bypasses missing validate evidence', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('none'),
		);
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({ proposalId: 'f00001', sliceId: 'S1', force: true }),
		);
		expect(result.ok).toBe(true);
		expect(result.closed).toBe(true);
		expect(readFileSync(readProposal(opts, 'f00001', abs), 'utf8')).toMatch(
			/\*\*Status\*\*:\s*done/i,
		);
	});

	it('closes with scoped validation metadata when the resolver permits it', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('none'),
		);
		opts = {
			...opts,
			resolveValidationDecision: async () => ({
				mode: 'scoped' as const,
				resolvedScopes: ['proposals'],
				snapshotId: 'snapshot-scoped',
				reason: 'another active actor still exists',
			}),
		};
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({
				proposalId: 'f00001',
				sliceId: 'S1',
				force: true,
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.validationDecision).toMatchObject({
			mode: 'scoped',
			resolvedScopes: ['proposals'],
			snapshotId: 'snapshot-scoped',
		});
		expect(readFileSync(readProposal(opts, 'f00001', abs), 'utf8')).toMatch(
			/\*\*Status\*\*:\s*done/i,
		);
	});

	it('blocks close when activity cannot prove a safe validation mode', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('none'),
		);
		opts = {
			...opts,
			resolveValidationDecision: async () => ({
				mode: 'blocked' as const,
				resolvedScopes: [],
				snapshotId: 'snapshot-blocked',
				reason: 'current actor is not provably active',
			}),
		};
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({
				proposalId: 'f00001',
				sliceId: 'S1',
				force: true,
			}),
		);
		expect(result.ok).toBe(false);
		expect(result.kind).toBe('validation-error');
		expect(result.validationDecision).toMatchObject({
			mode: 'blocked',
			snapshotId: 'snapshot-blocked',
		});
		expect(readFileSync(readProposal(opts, 'f00001', abs), 'utf8')).toMatch(
			/\*\*Status\*\*:\s*pending/i,
		);
	});

	it('passes resolved scopes to the quality probe', async () => {
		writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('none'),
		);
		const calls: Array<{ scopes?: readonly string[]; mode?: string }> = [];
		opts = {
			...opts,
			runQuality: async (input) => {
				calls.push(input ?? {});
				return { ok: true, severity: 'ok' as const, findings: [] };
			},
			resolveValidationDecision: async () => ({
				mode: 'scoped' as const,
				resolvedScopes: ['proposals'],
				snapshotId: 'snapshot-scoped',
				reason: 'another active actor still exists',
			}),
		};
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({
				proposalId: 'f00001',
				sliceId: 'S1',
				force: true,
			}),
		);
		expect(result.ok).toBe(true);
		expect(calls).toEqual([{ scopes: ['proposals'], mode: 'scoped' }]);
	});
});
