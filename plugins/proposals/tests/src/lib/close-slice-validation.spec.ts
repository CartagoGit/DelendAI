/**
 * a00069 S5 — close_slice must run the host validationCommand when the
 * slice gate/acceptance demands it, refuse to flip status on failure,
 * and skip validate for gate none/lint without demanding acceptance.
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
	sliceRequiresValidation,
	type IAuthoringToolOptions,
} from '@mcp-vertex/proposals/lib/tools/authoring.tool';
import { syncProposalRegistry } from '@mcp-vertex/proposals/lib/proposals/sync-proposal-registry';

const capture = async (
	reg: IToolRegistration,
): Promise<
	(
		a: unknown,
	) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>
> => {
	let h: (
		a: unknown,
	) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

const SLICE_DOC = (gate: string, acceptance?: string[]): string => {
	const accept =
		acceptance && acceptance.length > 0
			? `\n- acceptance:\n${acceptance.map((a) => `  - "${a}"`).join('\n')}`
			: '';
	return `---
id: f00999
title: S5 fixture
status: in-progress
---

# S5 fixture

## Slices

### S1 — gate fixture
- **Status**: pending
- **Files**: \`src/a.ts\`
- **Gate**: ${gate}${accept}
`;
};

describe('sliceRequiresValidation (a00069 S5)', () => {
	it('requires type and e2e gates', () => {
		expect(sliceRequiresValidation('- **Gate**: type\n')).toBe(true);
		expect(sliceRequiresValidation('- **Gate**: e2e\n')).toBe(true);
	});

	it('skips bare none and lint', () => {
		expect(sliceRequiresValidation('- **Gate**: none\n')).toBe(false);
		expect(sliceRequiresValidation('- **Gate**: lint\n')).toBe(false);
	});

	it('requires when acceptance lists bun test / validate', () => {
		const block = `- **Gate**: none
- acceptance:
  - "bun test"
`;
		expect(sliceRequiresValidation(block)).toBe(true);
		expect(
			sliceRequiresValidation(
				`- **Gate**: lint\n- acceptance:\n  - "bun run validate"\n`,
			),
		).toBe(true);
	});
});

describe('close_slice validation gate (a00069 S5)', () => {
	let root = '';
	let optsBase: IAuthoringToolOptions;
	let docPath = '';

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'close-val-'));
		const proposalsDir = join(root, 'docs/mcp-vertex/proposals');
		mkdirSync(join(proposalsDir, 'in-progress'), { recursive: true });
		mkdirSync(join(root, '.cache/mcp-vertex/proposals'), {
			recursive: true,
		});
		docPath = join(proposalsDir, 'in-progress', 'f00999-s5-fixture.md');
		optsBase = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			validationCommand: 'bun run validate',
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const seed = async (md: string) => {
		writeFileSync(docPath, md, 'utf8');
		await syncProposalRegistry(root, {
			proposalsDir: 'docs/mcp-vertex/proposals',
			proposalIndexFile: '.cache/mcp-vertex/proposals/index.json',
		});
	};

	it('returns validation-error and does not flip status when validate fails', async () => {
		await seed(SLICE_DOC('type'));
		let calls = 0;
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => {
					calls += 1;
					return {
						ok: false,
						output: 'FAIL: typecheck',
						exitCode: 2,
					};
				},
			}),
		);
		const result = await close({
			proposalId: 'f00999',
			sliceId: 's1',
			releaseLock: false,
		});
		expect(result.isError).toBe(true);
		const body = parse(result);
		expect(body.ok).toBe(false);
		expect(body.kind).toBe('validation-error');
		expect(body.closed).toBe(false);
		expect(body.validationOutput).toMatch(/FAIL: typecheck/);
		expect(calls).toBe(1);
		const doc = readFileSync(docPath, 'utf8');
		expect(doc).toMatch(/- \*\*Status\*\*: pending/);
		expect(doc).not.toMatch(/- \*\*Status\*\*: done/);
	});

	it('closes after green validate when gate is type', async () => {
		await seed(SLICE_DOC('type'));
		let calls = 0;
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => {
					calls += 1;
					return { ok: true, output: 'green', exitCode: 0 };
				},
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
		expect(calls).toBe(1);
		expect(readFileSync(docPath, 'utf8')).toMatch(/- \*\*Status\*\*: done/);
	});

	it('skips validate for gate none without acceptance', async () => {
		await seed(SLICE_DOC('none'));
		let calls = 0;
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => {
					calls += 1;
					return { ok: true, output: 'should-not-run', exitCode: 0 };
				},
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
		expect(calls).toBe(0);
	});

	it('skips validate for gate lint without acceptance', async () => {
		await seed(SLICE_DOC('lint'));
		let calls = 0;
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => {
					calls += 1;
					return { ok: false, output: 'nope', exitCode: 1 };
				},
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
		expect(calls).toBe(0);
	});

	it('runs validate when acceptance lists bun test even if gate is none', async () => {
		await seed(SLICE_DOC('none', ['bun test']));
		let calls = 0;
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => {
					calls += 1;
					return { ok: true, output: 'ok', exitCode: 0 };
				},
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
		expect(calls).toBe(1);
	});
});

describe('close_slice quality gate (a00072 S3.c)', () => {
	let root = '';
	let optsBase: IAuthoringToolOptions;
	let docPath = '';

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'close-quality-'));
		const proposalsDir = join(root, 'docs/mcp-vertex/proposals');
		mkdirSync(join(proposalsDir, 'in-progress'), { recursive: true });
		mkdirSync(join(root, '.cache/mcp-vertex/proposals'), {
			recursive: true,
		});
		docPath = join(proposalsDir, 'in-progress', 'f00999-s3-quality.md');
		optsBase = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			validationCommand: 'bun run validate',
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const seed = async (md: string) => {
		writeFileSync(docPath, md, 'utf8');
		await syncProposalRegistry(root, {
			proposalsDir: 'docs/mcp-vertex/proposals',
			proposalIndexFile: '.cache/mcp-vertex/proposals/index.json',
		});
	};

	it('returns quality-failed + blockerType when runQuality reports critical', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => ({
					ok: true,
					output: 'green',
					exitCode: 0,
				}),
				runQuality: async () => ({ ok: false, worst: 'critical' }),
			}),
		);
		const result = await close({
			proposalId: 'f00999',
			sliceId: 's1',
			releaseLock: false,
		});
		expect(result.isError).toBe(true);
		const body = parse(result);
		expect(body.ok).toBe(false);
		expect(body.kind).toBe('quality-failed');
		expect(body.blockerType).toBe('quality-failed');
		expect(body.closed).toBe(false);
		// The slice was NOT flipped — must still be pending.
		expect(readFileSync(docPath, 'utf8')).toMatch(
			/- \*\*Status\*\*: pending/,
		);
	});

	it('returns quality-failed when runQuality reports high', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => ({
					ok: true,
					output: 'green',
					exitCode: 0,
				}),
				runQuality: async () => ({ ok: false, worst: 'high' }),
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.ok).toBe(false);
		expect(body.blockerType).toBe('quality-failed');
	});

	it('closes when runQuality reports worst=medium (below the gate)', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => ({
					ok: true,
					output: 'green',
					exitCode: 0,
				}),
				runQuality: async () => ({ ok: false, worst: 'medium' }),
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
		expect(readFileSync(docPath, 'utf8')).toMatch(/- \*\*Status\*\*: done/);
	});

	it('closes when runQuality reports ok=true', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => ({
					ok: true,
					output: 'green',
					exitCode: 0,
				}),
				runQuality: async () => ({ ok: true, worst: 'none' }),
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
	});

	it('skips the quality probe when runQuality is not wired', async () => {
		// The default `optsBase` has no runQuality — the close must
		// succeed without invoking any quality check.
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runValidation: async () => ({
					ok: true,
					output: 'green',
					exitCode: 0,
				}),
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
	});
});
