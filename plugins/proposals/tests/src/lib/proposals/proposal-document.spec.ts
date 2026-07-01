import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseProposalDocument } from '@mcp-vertex/proposals/lib/proposals/proposal-document';
import { ProposalParseError } from '@mcp-vertex/proposals/lib/proposals/proposal-errors';
import type { IProposalErrorCode } from '@mcp-vertex/proposals/lib/proposals/proposal-errors';

let tmpDir: string;
let tmpFile: string;

const write = (content: string): string => {
	writeFileSync(tmpFile, content, 'utf8');
	return tmpFile;
};

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), 'mcp-vertex-proposal-doc-'));
	tmpFile = join(tmpDir, 'l99-fixture.md');
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Helper: assert that the promise rejects with a ProposalParseError whose
 * `.code` matches the expected code. Uses try/catch for cross-runner compat.
 */
const expectParseError = async (
	promise: Promise<unknown>,
	code: IProposalErrorCode,
): Promise<void> => {
	let caught: unknown;
	try {
		await promise;
	} catch (e) {
		caught = e;
	}
	expect(
		caught,
		`expected a ProposalParseError with code ${code}`,
	).toBeInstanceOf(ProposalParseError);
	if (caught instanceof ProposalParseError) {
		expect(caught.code).toBe(code);
	}
};

const VALID_FIXTURE = `---
id: l99-test
type: meta
status: pending
track: meta
budget:
  maxIterations: 6
  maxPremiumCalls: 1
  maxToolCalls: 80
acceptanceCriteria:
  - command: "bun --version"
    expect: "contains:1."
---
# [PROPOSAL] Test Proposal

## Goals

T1 spec verde

## Non-Goals

none
`;

describe('parseProposalDocument', async () => {
	it('parses a valid fixture and returns IProposalDocument with expected shape', async () => {
		const path = write(VALID_FIXTURE);
		const doc = await parseProposalDocument(path);

		expect(doc.path).toBe(path);

		// frontmatter scalars
		expect(doc.frontmatter.id).toBe('l99-test');
		expect(doc.frontmatter.type).toBe('meta');
		expect(doc.frontmatter.status).toBe('pending');
		expect(doc.frontmatter.track).toBe('meta');

		// frontmatter budget
		expect(doc.frontmatter.budget).toEqual({
			maxIterations: 6,
			maxPremiumCalls: 1,
			maxToolCalls: 80,
		});

		// frontmatter acceptanceCriteria
		expect(doc.frontmatter.acceptanceCriteria).toEqual([
			{ command: 'bun --version', expect: 'contains:1.' },
		]);

		// body goals extracted from ## Goals section
		expect(doc.body.goals).toContain('T1 spec verde');
	});

	it('throws ProposalParseError with code INVALID_FRONTMATTER when no frontmatter block', async () => {
		const path = write('# Just a heading\n\nNo frontmatter here.\n');
		await expectParseError(
			parseProposalDocument(path),
			'INVALID_FRONTMATTER',
		);
	});

	it('throws INVALID_BUDGET when budget.maxPremiumCalls is negative', async () => {
		const path = write(`---
id: l99
type: meta
status: pending
track: meta
budget:
  maxPremiumCalls: -1
---
# body
`);
		await expectParseError(parseProposalDocument(path), 'INVALID_BUDGET');
	});

	it('throws INVALID_BUDGET when budget.maxIterations is a string', async () => {
		const path = write(`---
id: l99
type: meta
status: pending
track: meta
budget:
  maxIterations: muchos
---
# body
`);
		await expectParseError(parseProposalDocument(path), 'INVALID_BUDGET');
	});

	it('throws INVALID_CRITERION when acceptanceCriteria item has no expect field', async () => {
		const path = write(`---
id: l99
type: meta
status: pending
track: meta
acceptanceCriteria:
  - command: "bun --version"
---
# body
`);
		await expectParseError(
			parseProposalDocument(path),
			'INVALID_CRITERION',
		);
	});

	it('throws INVALID_CRITERION when expect is not in the closed union', async () => {
		const path = write(`---
id: l99
type: meta
status: pending
track: meta
acceptanceCriteria:
  - command: "bun --version"
    expect: "banana"
---
# body
`);
		await expectParseError(
			parseProposalDocument(path),
			'INVALID_CRITERION',
		);
	});

	it('throws INVALID_CRITERION when command is empty', async () => {
		const path = write(`---
id: l99
type: meta
status: pending
track: meta
acceptanceCriteria:
  - command: ""
    expect: "exit0"
---
# body
`);
		await expectParseError(
			parseProposalDocument(path),
			'INVALID_CRITERION',
		);
	});

	it('accepts contains:<substring> as a valid expect value', async () => {
		const path = write(`---
id: l99
type: meta
status: pending
track: meta
acceptanceCriteria:
  - command: "bun --version"
    expect: "contains:1.3"
---
# body
`);
		const doc = await parseProposalDocument(path);
		expect(doc.frontmatter.acceptanceCriteria?.[0]?.expect).toBe(
			'contains:1.3',
		);
	});

	it('accepts all three literal expect values (exit0, pass, synchronized)', async () => {
		const path = write(`---
id: l99
type: meta
status: pending
track: meta
acceptanceCriteria:
  - command: "bun --version"
    expect: "exit0"
  - command: "bun test"
    expect: "pass"
  - command: "bun run audit"
    expect: "synchronized"
---
# body
`);
		const doc = await parseProposalDocument(path);
		const expects = doc.frontmatter.acceptanceCriteria?.map(
			(c) => c.expect,
		);
		expect(expects).toEqual(['exit0', 'pass', 'synchronized']);
	});
});
