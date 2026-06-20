import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseProposalDocument } from '@mcp-vertex/proposals/lib/proposals/proposal-document';

let tmpDir: string;
let tmpFile: string;

const write = (content: string): string => {
	writeFileSync(tmpFile, content, 'utf8');
	return tmpFile;
};

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), 'mcp-vertex-proposal-zombie-policy-'));
	tmpFile = join(tmpDir, 'l99-zombie.md');
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe('proposal-frontmatter-zombie-policy', () => {
	it('adopted: true without continuityPolicy.zombieRecovery -> throws ZodError with correct path and message', async () => {
		const content = `---
id: l99-zombie-test
type: meta
status: pending
track: meta
adopted: true
---
# [PROPOSAL] Test Proposal
`;
		const path = write(content);

		let caught: unknown;
		try {
			await parseProposalDocument(path);
		} catch (e) {
			caught = e;
		}

		expect(caught).toBeInstanceOf(ZodError);
		if (caught instanceof ZodError) {
			const issue = caught.issues.find(
				(i) =>
					i.path.join('.') === 'continuityPolicy.zombieRecovery' &&
					i.message ===
						'proposals with adopted delegation must declare continuityPolicy.zombieRecovery',
			);
			expect(issue).toBeDefined();
		}
	});

	it('adopted: true + continuityPolicy.zombieRecovery -> parses successfully', async () => {
		const content = `---
id: l99-zombie-test
type: meta
status: pending
track: meta
adopted: true
continuityPolicy:
  zombieRecovery: "force_release_on_gc_after_stale_threshold"
---
# [PROPOSAL] Test Proposal
`;
		const path = write(content);
		const doc = await parseProposalDocument(path);
		expect(doc.frontmatter.id).toBe('l99-zombie-test');
	});
});
