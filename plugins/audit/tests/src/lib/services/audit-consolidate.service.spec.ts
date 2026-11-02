import { describe, expect, it } from 'vitest';

import {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../../../../src/lib/services/audit-consolidate.service';
import { parseAuditBody } from '../../../../src/lib/services/parse-audit.service';
import type { IAuditDocument } from '../../../../src/lib/contracts/interfaces/audit.interface';

const AUDIT_SONNET = `# Audit — Sonnet

## 🔴 FATAL

### 1. Process cwd in engine
**File**: \`plugins/proposals/src/lib/foo.ts\`

Serious genericity failure.
`;

const AUDIT_OPUS = `# Audit — Opus

## 🔴 FATAL

### 1. Process cwd in engine
**File**: \`plugins/proposals/src/lib/foo.ts\`

Same problem as Sonnet.
`;

const AUDIT_GEMINI = `# Audit — Gemini

## 🟠 MUY MAL

### 1. Non-atomic write
**File**: \`plugins/proposals/src/lib/bar.ts\`

Unlike persistQueue.

## 📊 Table

| Dimension | Score |
|---|---|
| **Architecture** | 9/10 |
`;

const docs = (): IAuditDocument[] => [
	parseAuditBody('14-06-2026- Antigravity (Sonnet).md', AUDIT_SONNET),
	parseAuditBody('14-06-2026- Claude Code (Opus).md', AUDIT_OPUS),
	parseAuditBody('14-06-2026- Antigravity (Gemini).md', AUDIT_GEMINI),
];

describe('consolidateAudits', async () => {
	it('counts successfully parsed audits', async () => {
		const c = consolidateAudits(docs());
		expect(c.auditsFound).toBe(3);
	});

	it('deduplicates findings that share a file and similar title', async () => {
		const c = consolidateAudits(docs());
		const cwdFinding = c.findings.find((f) =>
			f.titles.some((t) => t.includes('Process cwd')),
		);
		expect(cwdFinding).toBeDefined();
		expect(cwdFinding?.seenBy).toContain('Sonnet');
		expect(cwdFinding?.seenBy).toContain('Opus');
		expect(cwdFinding?.seenBy).not.toContain('Gemini');
	});

	it('keeps unrelated findings as separate entries', async () => {
		const c = consolidateAudits(docs());
		expect(c.findings.length).toBe(2);
	});

	it('averages per-dimension scores across models', async () => {
		const c = consolidateAudits(docs());
		const arch = c.consensus.find((d) => d.dimension === 'Architecture');
		expect(arch).toBeDefined();
		// Only Gemini scored this dimension, so average = 9.
		expect(arch?.average).toBe(9);
	});

	it('skips audits with no findings and no scores', async () => {
		const c = consolidateAudits([
			parseAuditBody('a.md', 'No structure here'),
			...docs(),
		]);
		expect(c.auditsFound).toBe(3);
		expect(c.skipped).toHaveLength(1);
		expect(c.skipped[0]?.path).toBe('a.md');
	});

	it('surfaces top urgent actions', async () => {
		const c = consolidateAudits(docs(), { topActions: 5 });
		expect(c.topActions.length).toBeGreaterThan(0);
		expect(c.topActions[0]).toContain('FATAL');
		expect(c.topActions[0]).toContain('Sonnet');
	});

	it('is deterministic (same input, same output)', async () => {
		const a = consolidateAudits(docs());
		const b = consolidateAudits(docs());
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe('renderConsolidationMarkdown', async () => {
	it('produces a valid master markdown document', async () => {
		const c = consolidateAudits(docs());
		const md = renderConsolidationMarkdown(c);
		expect(md).toContain('# Master Audit');
		expect(md).toContain('## 🔴 Cola viva');
		expect(md).toContain('Sonnet');
		expect(md).toContain('Opus');
	});
});

describe('consolidateAudits — one finding, two severities', async () => {
	const fatalDoc = parseAuditBody(
		'14-06-2026- Antigravity (Sonnet).md',
		AUDIT_SONNET,
	);
	const badDoc = parseAuditBody(
		'14-06-2026- Claude Code (Opus).md',
		AUDIT_SONNET.replace('FATAL', 'MUY MAL').replace('Sonnet', 'Opus'),
	);

	it('merges into one entry holding both votes and the worst severity', async () => {
		const c = consolidateAudits([fatalDoc, badDoc]);
		expect(c.findings).toHaveLength(1);
		const [only] = c.findings;
		expect(only?.worstSeverity).toBe('FATAL');
		expect(only?.seenBy).toHaveLength(2);
		expect(only?.votes.map((v) => v.severity).sort()).toEqual([
			'BAD',
			'FATAL',
		]);
		expect(c.topActions[0]).toContain('FATAL');
	});

	it('keeps the worst severity whichever document comes first', async () => {
		const c = consolidateAudits([badDoc, fatalDoc]);
		expect(c.findings).toHaveLength(1);
		expect(c.findings[0]?.worstSeverity).toBe('FATAL');
	});
});

describe('consolidateAudits — rejected inputs', async () => {
	it('lists inputs that never became documents in skipped', async () => {
		const c = consolidateAudits(docs(), {
			rejected: [{ path: 'a.md', reason: 'unreadable: EACCES' }],
		});
		expect(c.skipped).toContainEqual({
			path: 'a.md',
			reason: 'unreadable: EACCES',
		});
		expect(c.auditsFound).toBe(3);
	});
});
