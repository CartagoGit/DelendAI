/**
 * a00072 S5 — close_slice requires recent validate evidence before it
 * flips a slice to done. The shell-out helper remains unit-tested in
 * tools/close-slice-validation.spec.ts.
 */
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
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
	sliceRequiresValidation,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';
import { syncProposalRegistry } from '@delendai/proposals/lib/proposals/sync-proposal-registry';

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

const recentValidate = () => ({
	timestamp: new Date().toISOString(),
	exitCode: 0,
});

const staleValidate = () => ({
	timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
	exitCode: 0,
});

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
			requirePeerReview: false,
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const writeValidateLog = (lines: readonly string[]) => {
		const logPath = join(
			root,
			'.cache/mcp-vertex/results/logs/validate.jsonl',
		);
		mkdirSync(join(logPath, '..'), { recursive: true });
		writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
	};

	const seed = async (md: string) => {
		writeFileSync(docPath, md, 'utf8');
		await syncProposalRegistry(root, {
			proposalsDir: 'docs/mcp-vertex/proposals',
			proposalIndexFile: '.cache/mcp-vertex/proposals/index.json',
		});
	};

	// `close_slice` calls `syncProposalRegistry`, which can move the file
	// from `in-progress/` to `done/<kind>/`. Read from the live location
	// rather than the path that was originally seeded.
	const readCurrentProposal = (): string => {
		const proposalsDir = join(root, 'docs/mcp-vertex/proposals');
		const stack = [proposalsDir];
		while (stack.length > 0) {
			const current = stack.pop();
			if (current === undefined) break;
			for (const entry of readdirSync(current, {
				withFileTypes: true,
			})) {
				const full = join(current, entry.name);
				if (entry.isDirectory()) {
					stack.push(full);
					continue;
				}
				if (!entry.name.endsWith('.md')) continue;
				const text = readFileSync(full, 'utf8');
				if (text.includes('id: f00999')) return text;
			}
		}
		throw new Error('f00999 proposal not found');
	};

	it('returns validate-required and does not flip status when evidence is missing', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(buildCloseSliceRegistration(optsBase));
		const result = await close({
			proposalId: 'f00999',
			sliceId: 's1',
			releaseLock: false,
		});
		expect(result.isError).toBe(true);
		const body = parse(result);
		expect(body.ok).toBe(false);
		expect(body.blockerType).toBe('validate-required');
		expect(body.closed).toBe(false);
		const doc = readFileSync(docPath, 'utf8');
		expect(doc).toMatch(/- \*\*Status\*\*: pending/);
		expect(doc).not.toMatch(/- \*\*Status\*\*: done/);
	});

	it('closes after recent inline validate evidence', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(buildCloseSliceRegistration(optsBase));
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: recentValidate(),
			}),
		);
		expect(body.closed).toBe(true);
		expect(readCurrentProposal()).toMatch(/- \*\*Status\*\*: done/);
	});

	it('rejects stale inline validate evidence', async () => {
		await seed(SLICE_DOC('none'));
		const close = await capture(buildCloseSliceRegistration(optsBase));
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: staleValidate(),
			}),
		);
		expect(body.ok).toBe(false);
		expect(body.blockerType).toBe('validate-required');
	});

	it('reads disk evidence and skips malformed JSON lines', async () => {
		await seed(SLICE_DOC('lint'));
		writeValidateLog([
			'not-json',
			JSON.stringify({
				ts: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
				result: 'pass',
				exitCode: 0,
			}),
			JSON.stringify({
				ts: new Date().toISOString(),
				result: 'pass',
				exitCode: 0,
			}),
		]);
		const close = await capture(buildCloseSliceRegistration(optsBase));
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(body.closed).toBe(true);
	});

	it('requireValidateEvidence:false lets a host opt out of the gate entirely', async () => {
		// A host without a validate chain worth blocking on must be able to
		// switch the gate off in config, instead of teaching every agent to
		// pass `force: true` — which would also disable the peer-review and
		// quality gates.
		await seed(SLICE_DOC('none', ['bun test']));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				requireValidateEvidence: false,
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

	it('force:true suppresses the validate-required rejection', async () => {
		await seed(SLICE_DOC('none', ['bun test']));
		const close = await capture(buildCloseSliceRegistration(optsBase));
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
				force: true,
			}),
		);
		expect(body.closed).toBe(true);
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
			requirePeerReview: false,
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

	const readCurrentProposal = (): string => {
		const entries = readdirSync(join(root, 'docs/mcp-vertex/proposals'), {
			recursive: true,
			withFileTypes: true,
		});
		const proposal = entries.find((entry) => {
			if (!entry.isFile() || !entry.name.endsWith('.md')) return false;
			return readFileSync(
				join(entry.parentPath, entry.name),
				'utf8',
			).includes('id: f00999');
		});
		if (proposal === undefined)
			throw new Error('f00999 proposal not found');
		return readFileSync(join(proposal.parentPath, proposal.name), 'utf8');
	};

	it('returns quality-failed + blockerType when runQuality reports critical', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runQuality: async () => ({
					ok: false,
					severity: 'error',
					findings: ['critical'],
				}),
			}),
		);
		const result = await close({
			proposalId: 'f00999',
			sliceId: 's1',
			releaseLock: false,
			validateEvidence: recentValidate(),
		});
		expect(result.isError).toBe(true);
		const body = parse(result);
		expect(body.ok).toBe(false);
		expect(body.kind).toBe('quality-failed');
		expect(body.blockerType).toBe('quality-failed');
		expect(body.closed).toBe(false);
		// The slice was NOT flipped — must still be pending.
		expect(readCurrentProposal()).toMatch(/- \*\*Status\*\*: pending/);
	});

	it('returns quality-failed with blockerDetail when runQuality reports severity=error', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runQuality: async () => ({
					ok: false,
					severity: 'error',
					findings: ['high'],
					summary: { ok: false, scopes: 1 },
				}),
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: recentValidate(),
			}),
		);
		expect(body.ok).toBe(false);
		expect(body.blockerType).toBe('quality-failed');
		expect(body.blockerDetail).toEqual({
			ok: false,
			severity: 'error',
			findings: ['high'],
			summary: { ok: false, scopes: 1 },
		});
	});

	it('closes when runQuality reports severity=ok (gate passes)', async () => {
		await seed(SLICE_DOC('type'));
		const close = await capture(
			buildCloseSliceRegistration({
				...optsBase,
				runQuality: async () => ({
					ok: true,
					severity: 'ok',
					findings: [],
				}),
			}),
		);
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: recentValidate(),
			}),
		);
		expect(body.closed).toBe(true);
		expect(readCurrentProposal()).toMatch(/- \*\*Status\*\*: done/);
	});

	it('skips the quality probe when runQuality is not wired', async () => {
		// The default `optsBase` has no runQuality — the close must
		// succeed without invoking any quality check.
		await seed(SLICE_DOC('type'));
		const close = await capture(buildCloseSliceRegistration(optsBase));
		const body = parse(
			await close({
				proposalId: 'f00999',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: recentValidate(),
			}),
		);
		expect(body.closed).toBe(true);
	});
});
