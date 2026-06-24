import { describe, expect, it } from 'vitest';

import {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../../../../src/lib/services/audit-consolidate.service';
import { parseAuditBody } from '../../../../src/lib/services/parse-audit.service';
import type { IAuditDocument } from '../../../../src/lib/contracts/interfaces/audit.interface';

const AUDIT_SONNET = `# Auditoría — Sonnet

## 🔴 FATAL

### 1. Process cwd en engine
**Fichero**: \`plugins/proposals/src/lib/foo.ts\`

Falla grave de genericidad.
`;

const AUDIT_OPUS = `# Auditoría — Opus

## 🔴 FATAL

### 1. Process cwd en engine
**Fichero**: \`plugins/proposals/src/lib/foo.ts\`

Mismo problema que Sonnet.
`;

const AUDIT_GEMINI = `# Auditoría — Gemini

## 🟠 MUY MAL

### 1. Escritura no atómica
**Fichero**: \`plugins/proposals/src/lib/bar.ts\`

A diferencia de persistQueue.

## 📊 Tabla

| Dimensión | Score |
|---|---|
| **Arquitectura** | 9/10 |
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
		const arch = c.consensus.find((d) => d.dimension === 'Arquitectura');
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
		expect(md).toContain('# Auditoría Maestra');
		expect(md).toContain('## 🔴 Cola viva');
		expect(md).toContain('Sonnet');
		expect(md).toContain('Opus');
	});
});
