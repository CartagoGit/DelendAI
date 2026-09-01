import {
	mkdirSync,
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@mcp-vertex/proposals/lib/tools/authoring.tool';
import {
	markProposalDoneForAutoTransition,
	shouldAutoTransitionProposal,
} from '@mcp-vertex/proposals/lib/services/auto-transition';

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

const parse = (r: { content: Array<{ text: string }> }) =>
	JSON.parse(r.content[0]?.text ?? '{}');

const APPROVE_EVIDENCE = {
	commitHash: 'abc1234',
	validateExitCode: 0,
	testsPassing: 1,
	testsTotal: 1,
} as const;

describe('auto transition after approve (a00074 S3)', () => {
	let root = '';
	let opts: IAuthoringToolOptions;

	beforeEach(() => {
		delete process.env.MCP_HOST;
		root = mkdtempSync(join(tmpdir(), 'auto-transition-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			peerReviewLogPathAbs: join(
				root,
				'.cache/mcp-vertex/proposals/peer-review.jsonl',
			),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			runValidation: async () => ({
				ok: true,
				output: 'ok',
				exitCode: 0,
			}),
		};
	});

	afterEach(() => {
		delete process.env.MCP_HOST;
		rmSync(root, { recursive: true, force: true });
	});

	it('marks a review proposal done in frontmatter when the last slice is approved', async () => {
		const reviewPath = join(
			root,
			'docs/mcp-vertex/proposals/review/f00089-auto-move.md',
		);
		mkdirSync(join(root, 'docs/mcp-vertex/proposals/review'), {
			recursive: true,
		});
		mkdirSync(join(root, '.cache/mcp-vertex/proposals'), {
			recursive: true,
		});
		writeFileSync(
			reviewPath,
			`---
id: f00089
title: Auto move
kind: feat
status: review
type: proposal
shipped-in: [30551533]
---

## Slices

### s1 — work
- **Status**: pending
- **Files**: [src/a.ts]
`,
			'utf8',
		);
		writeFileSync(
			join(root, '.cache/mcp-vertex/proposals/index.json'),
			`${JSON.stringify({
				proposals: [
					{ id: 'f00089', file: 'review/f00089-auto-move.md' },
				],
			})}\n`,
			'utf8',
		);
		const review = await capture(buildReviewRegistration(opts));
		process.env.MCP_HOST = 'implementer-host';
		await review({
			proposalId: 'f00089',
			sliceId: 's1',
			action: 'submit',
			agent: 'falcon',
		});
		process.env.MCP_HOST = 'reviewer-host';
		const approved = parse(
			await review({
				proposalId: 'f00089',
				sliceId: 's1',
				action: 'approve',
				agent: 'owl',
				evidence: APPROVE_EVIDENCE,
			}),
		);
		expect(approved.status).toBe('done');
		expect(
			existsSync(
				join(
					root,
					'docs/mcp-vertex/proposals/done/feats/f00089-auto-move.md',
				),
			),
		).toBe(true);
	});

	it('does not auto-transition before the last slice is done', async () => {
		const markdown = `---
id: f00090
kind: feat
status: review
type: proposal
---

## Slices

### S1 — one
- **Status**: done
- **Files**: [src/a.ts]

### S2 — two
- **Status**: pending
- **Files**: [src/b.ts]
`;
		expect(shouldAutoTransitionProposal('f00090', markdown)).toBe(false);
		const prepared = markProposalDoneForAutoTransition('f00090', markdown);
		expect(prepared.changed).toBe(false);
		expect(prepared.markdown).toContain('status: review');
	});

	it('marks a non-plan proposal done without review when the host disables the gate', () => {
		const markdown = `---
id: f00091
kind: feat
status: in-progress
type: proposal
---

## Slices

### S1 — one
- **Status**: done
- **Files**: [src/a.ts]
`;
		const prepared = markProposalDoneForAutoTransition('f00091', markdown, {
			requirePeerReview: false,
		});
		expect(prepared.changed).toBe(true);
		expect(prepared.markdown).toContain('status: done');
	});

	it('never auto-transitions a plan through the proposal shortcut', () => {
		const markdown = `---
id: q00091
kind: plan
status: review
type: plan
---

## Slices

### S1 — one
- **Status**: done
- **Files**: [src/a.ts]
`;
		expect(
			shouldAutoTransitionProposal('q00091', markdown, {
				requirePeerReview: false,
			}),
		).toBe(false);
	});
});
