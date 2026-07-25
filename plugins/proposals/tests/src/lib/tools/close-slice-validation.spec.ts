/**
 * close-slice-validation.spec.ts — a00069 S5.
 *
 * `close_slice` must refuse to flip a slice to done when the slice's
 * gate/acceptance demands `bun run validate` (or the host's
 * `validationCommand`) and that command is red. Lightweight gates
 * (`none` / `lint`) skip the shell-out so docs-only slices stay cheap.
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

	it('refuses to close when validation fails and leaves status pending', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('bun run validate'),
		);
		const close = await capture(
			buildCloseSliceRegistration({
				...opts,
				runValidation: async () => ({
					ok: false,
					exitCode: 1,
					output: '1 failed test',
				}),
			}),
		);
		const result = parse(
			await close({ proposalId: 'f00001', sliceId: 'S1' }),
		);
		expect(result.ok).toBe(false);
		expect(result.kind ?? result.error?.kind ?? '').toMatch(
			/validation-error/i,
		);
		expect(result.error?.reason ?? '').toMatch(
			/validation-error|exited 1/i,
		);
		const body = readFileSync(abs, 'utf8');
		expect(body).toContain('**Status**: pending');
		expect(body).not.toMatch(/\*\*Status\*\*:\s*done/i);
	});

	it('closes when validation passes', async () => {
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('type'),
		);
		const close = await capture(
			buildCloseSliceRegistration({
				...opts,
				runValidation: async () => ({
					ok: true,
					exitCode: 0,
					output: 'ok',
				}),
			}),
		);
		const result = parse(
			await close({ proposalId: 'f00001', sliceId: 'S1' }),
		);
		expect(result.ok).toBe(true);
		expect(result.closed).toBe(true);
		const body = readFileSync(abs, 'utf8');
		expect(body).toMatch(/\*\*Status\*\*:\s*done/i);
	});

	it('skips validation for gate: lint and still closes', async () => {
		let ran = false;
		const abs = writeProposal(
			opts,
			'in-progress/f00001-fixture.md',
			docWithGate('lint'),
		);
		const close = await capture(
			buildCloseSliceRegistration({
				...opts,
				runValidation: async () => {
					ran = true;
					return { ok: false, exitCode: 1, output: 'should not run' };
				},
			}),
		);
		const result = parse(
			await close({ proposalId: 'f00001', sliceId: 'S1' }),
		);
		expect(ran).toBe(false);
		expect(result.ok).toBe(true);
		expect(result.closed).toBe(true);
		const body = readFileSync(abs, 'utf8');
		expect(body).toMatch(/\*\*Status\*\*:\s*done/i);
	});
});
