#!/usr/bin/env bun
/**
 * i18n-english-prose.script.spec.ts — pin the gate's behaviour on a
 * synthetic fixture tree (the real repo is too large to ship in a unit
 * test).
 */
import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	runI18nEnglishProseLint,
	type II18nEnglishProseReport,
} from './i18n-english-prose.script';

const writeText = async (path: string, content: string): Promise<void> => {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, content, 'utf8');
};

const makeFixture = async (): Promise<{
	root: string;
	cleanup: () => Promise<void>;
}> => {
	const root = await mkdtemp(join(tmpdir(), 'i18n-prose-'));
	// Clean English file → no findings
	await writeText(
		join(root, 'docs/clean.md'),
		'# clean doc\nThis is fine.\n',
	);
	// Spanish prose in a non-excluded file → 1 finding.
	// Use the SAME path the lint sees in CLI mode (REPO_ROOT-relative).
	await writeText(
		join(root, 'plugins/bad/README.md'),
		'# Plugin\nGenera un brief de auditoría.\n',
	);
	// Spanish in a translation catalog → excluded
	await writeText(
		join(root, 'apps/web/src/i18n/langs/es.ts'),
		'es: { hello: "Hola" };\n',
	);
	// Spanish in a per-locale README → excluded
	await writeText(
		join(root, 'plugins/foo/README.es.md'),
		'# Foo en español\n',
	);
	// Spanish in node_modules → excluded
	await writeText(
		join(root, 'node_modules/some-pkg/index.js'),
		'aquí hay español\n',
	);
	// Rebrand leftover identifier → 1 finding
	await writeText(
		join(root, 'packages/core/src/lib/old.ts'),
		'export const matchVertexConfig = () => [];\n',
	);
	// Preserved MCP tool id → not a finding (the regex looks for old
	// function/identifier renames only, not the public tool id)
	await writeText(
		join(root, 'packages/core/src/lib/router.ts'),
		"export const TOOL_ID = 'vertex' as const;\n",
	);
	// Old shell-completion function name `_mcpv` → 1 finding
	await writeText(
		join(root, 'packages/cli/src/lib/completion/completion.service.ts'),
		'complete -F _mcpv_complete delendai\n',
	);
	// Old docs URL `docs.mcp.vertex` → 1 finding
	await writeText(
		join(root, 'packages/ui-extension/src/dashboard/build-footer.ts'),
		"docsUrl: 'https://docs.mcp.vertex',\n",
	);
	// Historical CHANGELOG → 0 findings (excluded — it documents deprecated APIs)
	await writeText(
		join(root, 'extensions/vscode/CHANGELOG.md'),
		'- **f126** — `mcp-vertex.toolSearch` opens a search panel.\n',
	);
	// LLM-attribution rewriter → 0 findings (excluded — preserves old brand strings)
	await writeText(
		join(root, 'tools/scripts/git/rewrite-llm-attribution.script.ts'),
		'identities (`mcp-vertex@MiniMax.local`),\n',
	);
	// Spanish in shell-fallback.spec.ts (an excluded test fixture) → 0 finding
	await writeText(
		join(root, 'packages/core/tests/src/lib/agents/shell-fallback.spec.ts'),
		"output: 'El comando abrió el búfer alternativo.';\n",
	);

	return {
		root,
		cleanup: async () => {
			await rm(root, { recursive: true, force: true });
		},
	};
};

describe('runI18nEnglishProseLint', () => {
	it('flags Spanish prose in non-excluded paths', async () => {
		const { root, cleanup } = await makeFixture();
		try {
			const report: II18nEnglishProseReport =
				await runI18nEnglishProseLint([root]);
			const spanish = report.findings.filter(
				(f) => f.kind === 'spanish-prose',
			);
			const rebrand = report.findings.filter(
				(f) => f.kind === 'rebrand-leftover',
			);
			expect(spanish.length).toBeGreaterThan(0);
			expect(rebrand.length).toBeGreaterThan(0);
			expect(report.scanned).toBeGreaterThan(0);
			expect(report.excluded).toBeGreaterThan(0);

			// The lint always uses REPO_ROOT-relative paths, so when
			// invoked against a synthetic root, the path includes the
			// temp dir prefix. Use `endsWith` to assert on the trailing
			// path component (the part that doesn't depend on where
			// `mkdtemp` mounted the fixture).
			const spanishEnds = new Set(spanish.map((f) => f.file));
			expect(spanishEnds.size).toBeGreaterThan(0);
			// The bad README + the shell-fallback spec (excluded → no
			// finding) + the i18n catalog (excluded → no finding) etc.
			// We just assert the bad one is present and the excluded
			// ones are NOT.
			const hasBad = [...spanishEnds].some((p) =>
				p.endsWith('plugins/bad/README.md'),
			);
			expect(hasBad).toBe(true);
			const hasTranslationCatalog = [...spanishEnds].some((p) =>
				p.endsWith('apps/web/src/i18n/langs/es.ts'),
			);
			expect(hasTranslationCatalog).toBe(false);
			const hasLocaleReadme = [...spanishEnds].some((p) =>
				p.endsWith('plugins/foo/README.es.md'),
			);
			expect(hasLocaleReadme).toBe(false);
			const hasNodeModules = [...spanishEnds].some((p) =>
				p.endsWith('node_modules/some-pkg/index.js'),
			);
			expect(hasNodeModules).toBe(false);
			const hasShellFixture = [...spanishEnds].some((p) =>
				p.endsWith(
					'packages/core/tests/src/lib/agents/shell-fallback.spec.ts',
				),
			);
			expect(hasShellFixture).toBe(false);

			const rebrandEnds = new Set(rebrand.map((f) => f.file));
			const hasOld = [...rebrandEnds].some((p) =>
				p.endsWith('packages/core/src/lib/old.ts'),
			);
			expect(hasOld).toBe(true);
			// The router file uses `id: 'vertex'` (a preserved string),
			// not the renamed identifiers, so it must NOT appear.
			const hasRouter = [...rebrandEnds].some((p) =>
				p.endsWith('packages/core/src/lib/router.ts'),
			);
			expect(hasRouter).toBe(false);
			// The completion file has `_mcpv_complete` → must flag.
			const hasMcpv = [...rebrandEnds].some((p) =>
				p.endsWith(
					'packages/cli/src/lib/completion/completion.service.ts',
				),
			);
			expect(hasMcpv).toBe(true);
			// The build-footer file has `docs.mcp.vertex` → must flag.
			const hasDocsUrl = [...rebrandEnds].some((p) =>
				p.endsWith(
					'packages/ui-extension/src/dashboard/build-footer.ts',
				),
			);
			expect(hasDocsUrl).toBe(true);
			// The CHANGELOG is excluded (it documents deprecated APIs).
			const hasChangelog = [...rebrandEnds].some((p) =>
				p.endsWith('extensions/vscode/CHANGELOG.md'),
			);
			expect(hasChangelog).toBe(false);
			// The LLM-attribution rewriter is excluded (preserves old brand).
			const hasAttribution = [...rebrandEnds].some((p) =>
				p.endsWith('tools/scripts/git/rewrite-llm-attribution.script.ts'),
			);
			expect(hasAttribution).toBe(false);
		} finally {
			await cleanup();
		}
	});

	it('returns zero findings for an all-English, no-rebrand tree', async () => {
		const root = await mkdtemp(join(tmpdir(), 'i18n-prose-clean-'));
		try {
			await writeText(join(root, 'a.ts'), "export const x = 'hello';\n");
			await writeText(join(root, 'b.md'), '# Title\nAll English here.\n');
			const report = await runI18nEnglishProseLint([root]);
			expect(report.findings).toHaveLength(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
