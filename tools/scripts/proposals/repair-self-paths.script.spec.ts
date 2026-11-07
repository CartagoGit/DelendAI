import { describe, expect, it } from 'vitest';

import { staleSelfPathsFor } from './repair-self-paths.script';

const CURRENT = 'docs/delendai/proposals/done/feats/f00299-token-budgets.md';

describe('staleSelfPathsFor', () => {
	it('finds a self-path left behind by a move', () => {
		// The exact shape a pre-fix transition produced: the document was
		// moved to done/feats/ but its own Files: entry still names review/.
		const text =
			'- **Files**: `docs/delendai/proposals/review/f00299-token-budgets.md`\n';
		expect(staleSelfPathsFor(text, CURRENT)).toEqual([
			'docs/delendai/proposals/review/f00299-token-budgets.md',
		]);
	});

	it('ignores the path the document actually lives at', () => {
		expect(
			staleSelfPathsFor(`- **Files**: \`${CURRENT}\`\n`, CURRENT),
		).toEqual([]);
	});

	it('never touches a reference to a DIFFERENT proposal', () => {
		// Cross-references between proposals are legitimate and common;
		// rewriting one to point at the current document would be data loss.
		const text =
			'related: `docs/delendai/proposals/ready/feats/f00300-other.md`\n';
		expect(staleSelfPathsFor(text, CURRENT)).toEqual([]);
	});

	it('collects each distinct stale location once', () => {
		const text = [
			'- **Files**: `docs/delendai/proposals/review/f00299-token-budgets.md`',
			'- notes: see docs/delendai/proposals/review/f00299-token-budgets.md',
			'- also docs/delendai/proposals/ready/feats/f00299-token-budgets.md',
		].join('\n');
		expect([...staleSelfPathsFor(text, CURRENT)].sort()).toEqual([
			'docs/delendai/proposals/ready/feats/f00299-token-budgets.md',
			'docs/delendai/proposals/review/f00299-token-budgets.md',
		]);
	});
});
