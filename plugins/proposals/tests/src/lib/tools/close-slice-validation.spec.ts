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

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildCloseSliceRegistration,
	runCloseSliceValidation,
	sliceRequiresValidation,
	type IAuthoringToolOptions,
} from '@mcp-vertex/proposals/lib/tools/authoring.tool';

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
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(
				root,
				'.cache/mcp-vertex/proposals/counters.json',
			),
			layout: {
				proposalsDir: 'docs/mcp-vertex/proposals',
				proposalIndexFile: '.cache/mcp-vertex/proposals/index.json',
			},
			validationCommand: 'bun run validate',
		};
		mkdirSync(opts.proposalsDirAbs, { recursive: true });
		mkdirSync(join(root, '.cache/mcp-vertex/proposals'), {
			recursive: true,
		});
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const writeValidateLog = (entries: readonly Record<string, unknown>[]) => {
		const logPath = join(
			root,
			'.cache/mcp-vertex/results/logs/validate.jsonl',
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
		expect(result.error?.reason ?? '').toMatch(/validate evidence/i);
		const body = readFileSync(abs, 'utf8');
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
		const body = readFileSync(abs, 'utf8');
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
		const body = readFileSync(abs, 'utf8');
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
		const body = readFileSync(abs, 'utf8');
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
		expect(readFileSync(abs, 'utf8')).toMatch(/\*\*Status\*\*:\s*done/i);
	});
});
