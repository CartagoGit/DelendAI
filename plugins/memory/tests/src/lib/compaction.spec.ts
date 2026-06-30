/**
 * compaction.spec.ts (f00090 S1)
 *
 * The in-session context distiller must be PURE and DETERMINISTIC, keep the
 * load-bearing items by default, discard the noise, honour explicit
 * pin/drop overrides, and report a token saving the agent can trust.
 */
import { describe, expect, it } from 'vitest';

import {
	distillContextDigest,
	estimateTokens,
	type IContextItem,
} from '@mcp-vertex/memory/lib/services/compaction';

const items: readonly IContextItem[] = [
	{ kind: 'decision', label: 'Use memory plugin, not a new plugin', detail: 'reuse store + redaction' },
	{ kind: 'open', label: 'wire trigger into overview', detail: 'S2 pending' },
	{ kind: 'fact', label: 'counter is at f:90' },
	{ kind: 'pointer', label: 'plugins/memory/src/lib/services/compaction.ts:1' },
	{ kind: 'output', label: 'raw bun test dump', detail: 'x'.repeat(500) },
	{ kind: 'exploration', label: 'tried a new plugin first', detail: 'dead end' },
	{ kind: 'superseded', label: 'old plan v1' },
];

describe('distillContextDigest (f00090 S1)', () => {
	it('is deterministic: same input → byte-identical digest', () => {
		const a = distillContextDigest(items);
		const b = distillContextDigest(items);
		expect(a.digest).toBe(b.digest);
		expect(a.tokenAccounting).toEqual(b.tokenAccounting);
	});

	it('keeps decision/open/fact/pointer and discards output/exploration/superseded by default', () => {
		const { kept, discarded } = distillContextDigest(items);
		expect(kept.map((i) => i.kind).sort()).toEqual([
			'decision',
			'fact',
			'open',
			'pointer',
		]);
		expect(discarded.map((i) => i.kind).sort()).toEqual([
			'exploration',
			'output',
			'superseded',
		]);
	});

	it('renders kept items grouped by kind in a stable high-signal order', () => {
		const { sections, digest } = distillContextDigest(items);
		expect(sections.map((s) => s.kind)).toEqual([
			'decision',
			'open',
			'fact',
			'pointer',
		]);
		// Decisions appear before facts in the body regardless of input order.
		expect(digest.indexOf('## Decisions')).toBeLessThan(
			digest.indexOf('## Facts'),
		);
		// Pointers render as a bare ref (no detail noise).
		expect(digest).toContain(
			'- plugins/memory/src/lib/services/compaction.ts:1',
		);
	});

	it('honours pin (force-keep) and drop (force-discard) overriding kind default', () => {
		const overridden: readonly IContextItem[] = [
			{ kind: 'output', label: 'pinned log', pin: true },
			{ kind: 'decision', label: 'dropped decision', drop: true },
		];
		const { kept, discarded } = distillContextDigest(overridden);
		expect(kept.map((i) => i.label)).toEqual(['pinned log']);
		expect(discarded.map((i) => i.label)).toEqual(['dropped decision']);
	});

	it('drop wins when both pin and drop are set (most conservative)', () => {
		const { kept, discarded } = distillContextDigest([
			{ kind: 'fact', label: 'ambiguous', pin: true, drop: true },
		]);
		expect(kept).toHaveLength(0);
		expect(discarded).toHaveLength(1);
	});

	it('truncates long detail to detailMaxChars with an ellipsis', () => {
		const { digest } = distillContextDigest(
			[{ kind: 'fact', label: 'big', detail: 'y'.repeat(400) }],
			{ detailMaxChars: 40 },
		);
		const bullet = digest
			.split('\n')
			.find((line) => line.startsWith('- big'));
		expect(bullet).toBeDefined();
		expect(bullet?.endsWith('…')).toBe(true);
		expect((bullet ?? '').length).toBeLessThan(60);
	});

	it('reports a positive token saving (raw tail >> digest)', () => {
		const { tokenAccounting } = distillContextDigest(items);
		expect(tokenAccounting.keptCount).toBe(4);
		expect(tokenAccounting.discardedCount).toBe(3);
		expect(tokenAccounting.inputEstimate).toBeGreaterThan(
			tokenAccounting.digestEstimate,
		);
		expect(tokenAccounting.savedEstimate).toBe(
			tokenAccounting.inputEstimate - tokenAccounting.digestEstimate,
		);
	});

	it('uses an explicit tokensEstimate when supplied', () => {
		const { tokenAccounting } = distillContextDigest([
			{ kind: 'output', label: 'tiny', tokensEstimate: 9999 },
		]);
		expect(tokenAccounting.inputEstimate).toBe(9999);
	});

	it('produces an empty-keep digest when nothing is load-bearing', () => {
		const { digest, sections, kept } = distillContextDigest([
			{ kind: 'output', label: 'noise' },
		]);
		expect(kept).toHaveLength(0);
		expect(sections).toHaveLength(0);
		expect(digest).toContain('nothing to keep');
	});
});

describe('estimateTokens', () => {
	it('is 0 for empty, >=1 for any non-empty string, ~len/4', () => {
		expect(estimateTokens('')).toBe(0);
		expect(estimateTokens('a')).toBe(1);
		expect(estimateTokens('abcd')).toBe(1);
		expect(estimateTokens('a'.repeat(40))).toBe(10);
	});
});
