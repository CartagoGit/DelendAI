import { describe, expect, it } from 'vitest';

import { parseAuditBody } from '../../../../src/lib/services/parse-audit.service';
import type {
	IAuditDocument,
	IAuditFinding,
	IAuditScore,
} from '../../../../src/lib/contracts/interfaces/audit.interface';

const SAMPLE_AUDIT = `# 🔍 Exhaustive Audit — \`delendai\` and Plugins

> **Date**: 14 jun 2026 | **Reviewer**: Antigravity (Claude Sonnet 4.6 Thinking)
> **Methodology**: Full reading of the source code, contracts, engine logic, configuration, tests and documentation.

---

## 📊 Executive Summary

The project is architecturally solid and conceptually advanced.
The plugin-first, model-agnostic and low-token design is correct.

There are areas with world-class code, but also zones with technical debt.

---

## 🔴 FATAL — Critical errors or design issues that must be corrected

### 1. \`syncProposalRegistry\` uses \`process.cwd()\` as default
**File**: \`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L309\`

\`\`\`typescript
export async function syncProposalRegistry(
    root: string = process.cwd()
)
\`\`\`

This is the most serious violation of the project.

### 2. \`agent-lock-engine.ts\` uses \`resolveWorkspacePath\` as fallback
**File**: \`plugins/proposals/src/lib/locks/agent-lock-engine.ts#L60\`

The fallback is a silent bug vector.

---

## 🟠 MUY MAL — Serious problems that degrade quality

### 3. NON-atomic write in \`syncProposalRegistry\`
**File**: \`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L347\`

\`\`\`typescript
await writeFile(indexPath, nextText, 'utf8');
\`\`\`

Unlike \`persistQueue\` (which uses \`tmp + rename\` correctly).

---

## 📊 Final Scoring Table

| Dimension | Score | Comment |
|---|---|---|
| **Architecture** | 9/10 | Plugin-first, model-agnostic |
| **Contracts and interfaces** | 9/10 | Clean |
| **Tests** | ?/10 | Structure present |
| **Genericity** | 6/10 | Penalised |

**Final note: 8/10 — High-quality project with occasional technical debt.**
`;

describe('parseAuditBody', async () => {
	it('extracts the source identity from a conventional filename', async () => {
		const doc = parseAuditBody(
			'docs/delendai/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		expect(doc.source.host).toBe('Antigravity');
		expect(doc.source.model).toBe('Claude Sonnet 4.6 Thinking');
		expect(doc.source.date).toBe('2026-06-14');
		expect(doc.slug).toContain('14-06-2026');
	});

	it('captures the executive summary (first non-empty paragraph block)', async () => {
		const doc = parseAuditBody(
			'docs/delendai/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		expect(doc.summary).toContain('architecturally solid');
		expect(doc.summary).toContain('plugin-first');
	});

	it('classifies findings by their section header severity', async () => {
		const doc = parseAuditBody(
			'docs/delendai/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		const fatals = doc.findings.filter(
			(f: IAuditFinding) => f.severity === 'FATAL',
		);
		// The SAMPLE_AUDIT uses the legacy Spanish heading `🟠 MUY MAL`;
		// the parser normalises it to the canonical English token `BAD`.
		const bad = doc.findings.filter(
			(f: IAuditFinding) => f.severity === 'BAD',
		);
		expect(fatals).toHaveLength(2);
		expect(bad).toHaveLength(1);
		expect(fatals[0]?.title).toContain('syncProposalRegistry');
		expect(bad[0]?.files).toContain(
			'plugins/proposals/src/lib/proposals/sync-proposal-registry.ts',
		);
	});

	it('does not treat leftover markdown list tokens as cited files', async () => {
		const doc = parseAuditBody(
			'docs/delendai/proposals/done/23-08-2026- Copilot (Grok).md',
			`# Audit

## 🔴 FATAL

### 1. Broken citation
**Fichero**: [
[sync-proposal-registry.ts#L311](file:///tmp/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L311)
`,
		);
		expect(doc.findings[0]?.files).toEqual([
			'plugins/proposals/src/lib/proposals/sync-proposal-registry.ts',
		]);
		expect(doc.findings[0]?.files).not.toContain('[');
	});

	it('extracts the per-dimension scoring table', async () => {
		const doc = parseAuditBody(
			'docs/delendai/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		const arch = doc.scores.find(
			(s: IAuditScore) => s.dimension === 'Architecture',
		);
		expect(arch?.score).toBe(9);
		const tests = doc.scores.find(
			(s: IAuditScore) => s.dimension === 'Tests',
		);
		expect(tests?.score).toBeNull();
		const generic = doc.scores.find(
			(s: IAuditScore) => s.dimension === 'Genericity',
		);
		expect(generic?.score).toBe(6);
	});

	it('captures the final note', async () => {
		const doc = parseAuditBody(
			'docs/delendai/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		expect(doc.note).toContain('8/10');
	});

	it('falls back gracefully on an unrecognised filename', async () => {
		const doc = parseAuditBody('random.md', SAMPLE_AUDIT);
		expect(doc.source.host).toBe('unknown');
		expect(doc.source.model).toBe('unknown');
	});

	it('recognises the new EXEMPLARY severity band (English canonical + Spanish legacy forms)', async () => {
		const body = `## ✨ EXEMPLARY — Findings worth copying

### 1. Core contracts layer with impeccable SOLID
**Fichero**: \`packages/core/src/lib/contracts/interfaces.ts\`

Zero globals, zero process.cwd(), zero any.

### 2. Universal atomic-write pattern
**Fichero**: \`packages/core/src/lib/fs/write-file-atomic.ts\`

The best implementation we have seen.
`;
		const docEnglish = parseAuditBody('test.md', body);
		const exemplary = docEnglish.findings.filter(
			(f: IAuditFinding) => f.severity === 'EXEMPLARY',
		);
		expect(exemplary).toHaveLength(2);
		expect(exemplary[0]?.title).toContain('impeccable');

		// Spanish legacy form must still normalise to the canonical
		// English enum token …
		const bodySpanish = body.replace(/EXEMPLARY/gu, 'ESPLÉNDIDO');
		const docSpanish = parseAuditBody('test.md', bodySpanish);
		const exemplaryEs = docSpanish.findings.filter(
			(f: IAuditFinding) => f.severity === 'EXEMPLARY',
		);
		expect(exemplaryEs).toHaveLength(2);

		// … and the ASCII fallback (some LLMs drop the accent).
		const bodyAscii = body.replace(/EXEMPLARY/gu, 'ESPLENDIDO');
		const docAscii = parseAuditBody('test.md', bodyAscii);
		const exemplaryAscii = docAscii.findings.filter(
			(f: IAuditFinding) => f.severity === 'EXEMPLARY',
		);
		expect(exemplaryAscii).toHaveLength(2);
	});
});

describe('parseAuditFiles', async () => {
	it('skips duplicate paths and tolerates per-file parse errors', async () => {
		const { parseAuditFiles } = await import(
			'../../../../src/lib/services/parse-audit.service'
		);
		const docs = parseAuditFiles([
			{ path: 'a.md', body: SAMPLE_AUDIT },
			{ path: 'a.md', body: SAMPLE_AUDIT }, // duplicate
			{ path: 'b.md', body: 'no findings here' },
		]);
		expect(docs).toHaveLength(2);
		expect(docs.map((d: IAuditDocument) => d.path)).toEqual([
			'a.md',
			'b.md',
		]);
	});
});

/**
 * The brief that `audit_plan` emits and this parser disagreed in three
 * places, so an audit that followed the brief to the letter came back
 * with `findings: []` and an empty note. Measured on a real repository:
 * 23 findings, all dropped.
 *
 * The parser is the permissive side by design, so it now accepts both
 * shapes. The brief was also made explicit about the banded sections,
 * which it never mentioned.
 */
describe('the shapes the audit brief actually asks for', () => {
	const BRIEF_SHAPED = [
		'# Audit',
		'',
		'## Executive summary',
		'',
		'Something happened.',
		'',
		'## 🔴 FATAL',
		'',
		'### 1. Declare the missing schema',
		'**File**: `src/tools/generate.tool.ts#L55`',
		'',
		'**Problem**: no outputSchema.',
		'**Impact**: callers get untyped output.',
		'',
		'## 🟠 BAD',
		'',
		'### 2. Write atomically',
		'**File**: `src/cli/generate.ts#L312`, `src/cli/watch.ts#L76`',
		'',
		'**Problem**: bare writeFile.',
		'',
		'**Final note: 6/10 — works, but the contracts slipped.**',
	].join('\n');

	it('preserves the exact extracted document for a representative brief-shaped audit', () => {
		expect(
			parseAuditBody(
				'docs/delendai/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
				BRIEF_SHAPED,
			),
		).toEqual({
			path: 'docs/delendai/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			slug: '14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking)',
			source: {
				host: 'Antigravity',
				model: 'Claude Sonnet 4.6 Thinking',
				date: '2026-06-14',
			},
			summary: 'Something happened.',
			findings: [
				{
					id: 'fatal-1',
					title: 'Declare the missing schema',
					severity: 'FATAL',
					files: ['src/tools/generate.tool.ts'],
					detail: '**File**: `src/tools/generate.tool.ts#L55`\n\n**Problem**: no outputSchema.\n**Impact**: callers get untyped output.',
				},
				{
					id: 'bad-2',
					title: 'Write atomically',
					severity: 'BAD',
					files: ['src/cli/generate.ts', 'src/cli/watch.ts'],
					detail: '**File**: `src/cli/generate.ts#L312`, `src/cli/watch.ts#L76`\n\n**Problem**: bare writeFile.\n\n**Final note: 6/10 — works, but the contracts slipped.**',
				},
			],
			scores: [],
			note: '6/10 — works, but the contracts slipped.',
		});
	});

	it('reads `**File**:` the way it reads `**Fichero**:`', () => {
		const doc = parseAuditBody('test.md', BRIEF_SHAPED);
		const fatal = doc.findings.find(
			(f: IAuditFinding) => f.severity === 'FATAL',
		);
		expect(fatal?.files).toEqual(['src/tools/generate.tool.ts']);
	});

	it('splits a multi-file `**File**:` and drops the line anchors', () => {
		const doc = parseAuditBody('test.md', BRIEF_SHAPED);
		const bad = doc.findings.find(
			(f: IAuditFinding) => f.severity === 'BAD',
		);
		expect(bad?.files).toEqual(['src/cli/generate.ts', 'src/cli/watch.ts']);
	});

	it('reads the English `**Final note:**`', () => {
		const doc = parseAuditBody('test.md', BRIEF_SHAPED);
		expect(doc.note).toContain('the contracts slipped');
	});

	/**
	 * The severity used to come only from the `##` section header. A
	 * model that put the band on the finding heading instead lost every
	 * finding, because `currentSeverity` never got set.
	 */
	it('falls back to the band on the finding heading', () => {
		const onHeading = [
			'# Audit',
			'',
			'## Findings',
			'',
			'### 1. Declare the missing schema — `FATAL`',
			'**File**: `src/a.ts#L1`',
			'',
			'### 2. Tidy the names — `MINOR`',
			'**File**: `src/b.ts#L2`',
		].join('\n');
		const doc = parseAuditBody('test.md', onHeading);
		expect(doc.findings.map((f: IAuditFinding) => f.severity)).toEqual([
			'FATAL',
			'MINOR',
		]);
	});

	it('still prefers the section band when both are present', () => {
		const doc = parseAuditBody('test.md', BRIEF_SHAPED);
		expect(doc.findings.map((f: IAuditFinding) => f.severity)).toEqual([
			'FATAL',
			'BAD',
		]);
	});

	it('handles long unmatched separators without stalling', () => {
		const longNoise = '('.repeat(4000);
		const doc = parseAuditBody(
			`docs/delendai/proposals/done/14-06-2026- Audit ${longNoise}.md`,
			[
				'# Audit',
				'',
				'## Executive summary',
				'',
				'Something happened.',
				'',
				'## 🔴 FATAL',
				'',
				'### 1. Stress the parser',
				`**File**: src/${' '.repeat(4000)}(${longNoise}`,
			].join('\n'),
		);

		expect(doc.source.host).toBe('unknown');
		expect(doc.findings).toHaveLength(1);
		expect(doc.findings[0]?.files).toEqual([]);
	});
});
