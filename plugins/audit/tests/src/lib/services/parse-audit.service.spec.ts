import { describe, expect, it } from 'vitest';

import { parseAuditBody } from '../../../../src/lib/services/parse-audit.service';
import type {
	IAuditDocument,
	IAuditFinding,
	IAuditScore,
} from '../../../../src/lib/contracts/interfaces/audit.interface';

const SAMPLE_AUDIT = `# 🔍 Auditoría Exhaustiva — \`mcp-vertex\` y Plugins

> **Fecha**: 14 jun 2026 | **Revisor**: Antigravity (Claude Sonnet 4.6 Thinking)
> **Metodología**: Lectura completa del código fuente, contratos, lógica de engines, configuración, tests y documentación.

---

## 📊 Resumen Ejecutivo

El proyecto es arquitectónicamente sólido y conceptualmente avanzado.
El diseño plugin-first, model-agnostic y low-token es correcto.

Hay áreas con código de clase mundial, pero también zonas con deuda técnica.

---

## 🔴 FATAL — Errores críticos o de diseño que deben corregirse

### 1. \`syncProposalRegistry\` usa \`process.cwd()\` como default
**Fichero**: \`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L309\`

\`\`\`typescript
export async function syncProposalRegistry(
    root: string = process.cwd()
)
\`\`\`

Esta es la violación más grave del proyecto.

### 2. \`agent-lock-engine.ts\` usa \`resolveWorkspacePath\` como fallback
**Fichero**: \`plugins/proposals/src/lib/locks/agent-lock-engine.ts#L60\`

El fallback es un vector de bug silencioso.

---

## 🟠 MUY MAL — Problemas serios que degradan la calidad

### 3. Escritura NO atómica en \`syncProposalRegistry\`
**Fichero**: \`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L347\`

\`\`\`typescript
await writeFile(indexPath, nextText, 'utf8');
\`\`\`

A diferencia de \`persistQueue\` (que usa \`tmp + rename\` correctamente).

---

## 📊 Tabla de Puntuación Final

| Dimensión | Puntuación | Comentario |
|---|---|---|
| **Arquitectura** | 9/10 | Plugin-first, model-agnostic |
| **Contratos e interfaces** | 9/10 | Limpios |
| **Tests** | ?/10 | Estructura presente |
| **Genericidad** | 6/10 | Penalizado |

**Nota final: 8/10 — Proyecto de alta calidad con deuda técnica puntual.**
`;

describe('parseAuditBody', async () => {
	it('extracts the source identity from a conventional filename', async () => {
		const doc = parseAuditBody(
			'docs/mcp-vertex/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		expect(doc.source.host).toBe('Antigravity');
		expect(doc.source.model).toBe('Claude Sonnet 4.6 Thinking');
		expect(doc.source.date).toBe('2026-06-14');
		expect(doc.slug).toContain('14-06-2026');
	});

	it('captures the executive summary (first non-empty paragraph block)', async () => {
		const doc = parseAuditBody(
			'docs/mcp-vertex/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		expect(doc.summary).toContain('arquitectónicamente sólido');
		expect(doc.summary).toContain('plugin-first');
	});

	it('classifies findings by their section header severity', async () => {
		const doc = parseAuditBody(
			'docs/mcp-vertex/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		const fatals = doc.findings.filter(
			(f: IAuditFinding) => f.severity === 'FATAL',
		);
		const muyMal = doc.findings.filter(
			(f: IAuditFinding) => f.severity === 'MUY_MAL',
		);
		expect(fatals).toHaveLength(2);
		expect(muyMal).toHaveLength(1);
		expect(fatals[0]?.title).toContain('syncProposalRegistry');
		expect(muyMal[0]?.files).toContain(
			'plugins/proposals/src/lib/proposals/sync-proposal-registry.ts',
		);
	});

	it('extracts the per-dimension scoring table', async () => {
		const doc = parseAuditBody(
			'docs/mcp-vertex/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		const arch = doc.scores.find(
			(s: IAuditScore) => s.dimension === 'Arquitectura',
		);
		expect(arch?.score).toBe(9);
		const tests = doc.scores.find(
			(s: IAuditScore) => s.dimension === 'Tests',
		);
		expect(tests?.score).toBeNull();
		const generic = doc.scores.find(
			(s: IAuditScore) => s.dimension === 'Genericidad',
		);
		expect(generic?.score).toBe(6);
	});

	it('captures the final note', async () => {
		const doc = parseAuditBody(
			'docs/mcp-vertex/proposals/done/14-06-2026- Antigravity (Claude Sonnet 4.6 Thinking).md',
			SAMPLE_AUDIT,
		);
		expect(doc.note).toContain('8/10');
	});

	it('falls back gracefully on an unrecognised filename', async () => {
		const doc = parseAuditBody('random.md', SAMPLE_AUDIT);
		expect(doc.source.host).toBe('unknown');
		expect(doc.source.model).toBe('unknown');
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
