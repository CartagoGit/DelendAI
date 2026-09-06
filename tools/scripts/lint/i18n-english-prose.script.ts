#!/usr/bin/env bun
/**
 * i18n-english-prose.script.ts — project-language lint.
 *
 * `delendai` is a public English-language project. Two regressions can
 * silently leak non-English prose into the codebase:
 *
 *   1. Spanish (or other accented-language) text in doc-comments, JSDoc,
 *      user-facing strings, README prose, etc.
 *   2. Leftover identifiers from the previous project brand (`vertex`,
 *      `mcp-vertex`, `mcp_vertex`) that the rebranding sweep did not
 *      catch — usually because they were added after the rename pass.
 *
 * This script is a cheap structural gate (no LLM call). It greps the
 * repo for the Spanish-character set and for the rebranding vocabulary,
 * and exits non-zero with a per-file report if anything is found in
 * source that's NOT in the documented exclusion list (translation
 * catalogs, test fixtures, identifier strings).
 *
 * Test policy (mirrors the repo's other gates):
 *   - `.script.ts` is committed next to this file and runs in CI.
 *   - `.script.spec.ts` lives beside it and asserts the gate's own
 *     exit-code / report shape on a synthetic fixture.
 *
 * Exclusions (kept in lockstep with the source tree — if you add a new
 * translation catalog, add its path here so the gate stops flagging it):
 *
 *   - apps / / / i18n / langs / *              translation data per locale
 *   - apps / / / src / i18n / *.strings.ts    VS Code extension strings
 *   - apps / / / src / data / pages / (install | configuration-center) / *.<locale>.md
 *                                         website pages per locale
 *   - plugins / / / tutorials / <locale> / *  per-locale tutorials
 *   - plugins / / / README.<locale>.md    per-locale READMEs
 *   - plugins/commit-policy/src/lib/contracts/i18n-types.ts
 *                                         bilingual commit-policy catalog
 *   - packages/cli/src/lib/init/init-catalog.constant.ts
 *                                         bilingual host-instructions
 *   - apps / / / src / lib / nav-refresh.ts   per-locale nav strings
 *   - apps / / / src / components / ui / brand-icons.ts
 *                                         locale display names
 *   - docs / delendai / proposals / **       proposals (titles are bilingual by design)
 *   - ** / locales / **                    translation pipelines
 *   - ** / .cache / **, ** / node_modules / **, ** / dist / **, ** / .worktrees / **
 *                                         generated / vendored
 *   - ** / .generated.ts, ** / generated / **
 *                                         auto-generated SDK
 *   - ** / agent-catalog.generated.json, ** / agent-instructions.generated.md
 *                                         generated metadata
 *   - Test fixtures with intentional accented chars:
 *     - shell-fallback.spec.ts (runtime sentinel detection)
 *     - safe-workspace-reader.spec.ts (unicode path test)
 *     - content-i18n.spec.ts (asserts the catalog contains localized strings)
 *     - markers.spec.ts / close-tools.spec.ts (bilingual marker test)
 *     - gitlab/tests/src/lib/tools.spec.ts (unicode payload fixture)
 *     - run-command-bytes.spec.ts (unicode payload fixture)
 *     - memory.spec.ts / preserve-rules.spec.ts (bilingual detection)
 *     - scope.spec.ts (test data)
 *     - parse-audit.service.ts / .spec.ts (legacy Spanish rubric detection)
 *     - audit.interface.ts / audit.interface.d.ts (rubric identifiers)
 *     - brief-builder.service.ts / parse-audit-line.ts (legacy audit support)
 *     - audit-brief.service.spec.ts (regex test for honor.*configuración)
 *     - shell-fallback.ts (the runtime sentinel string itself)
 *     - status-marker/src/index.ts (bilingual marker locales)
 *     - configuration-center.spec.ts (locale-aware UI test)
 *     - format.spec.ts / render-tool-detail.spec.ts (locale display)
 *     - unicode-safe-text.spec.ts / truncation-pagination.spec.ts / truncate-utf8.spec.ts
 *                                         (UTF-8 boundary fixtures)
 *     - jsonc-document.spec.ts (JSONC comment fixture)
 *
 * The excluded paths are NOT a "free pass" — they exist because the
 * fixture or catalog is *supposed* to contain the character class the
 * gate looks for. If you find yourself adding a NEW exclusion, the
 * better fix is usually to translate the file (or, if the test fixture
 * really is intentional, leave a one-line note in the test explaining
 * why the sentinel is needed).
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

/** Spanish character set used for prose detection. */
const SPANISH_PROSE = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/;

/**
 * Old brand identifiers that survived the rename pass. Each match must
 * be one of:
 *   - the preserved MCP tool id `'vertex'` / `delendai_vertex`,
 *   - the stable signal id `'custom-vertex-config'`,
 *   - the historical function `buildVertexRouterToolRegistration`
 *     (now `buildCompactRouterToolRegistration`),
 *   - the historical file `vertex-router.tool.ts`
 *     (now `compact-router.tool.ts`).
 * Anything else (an old function name, a stale variable, a config key)
 * is a regression.
 */
const REBRAND_LEFTOVERS =
	/\b(?:IVertexConfig[A-Za-z]*|matchVertexConfig[A-Za-z]*|detectCustomVertexConfig|hasCustomVertexConfig|buildVertexRouterToolRegistration|DelendaiVertexOutput|_mcpv\b|_mcpv_complete\b|docs\.mcp\.vertex|mcp-vertex\.dev|@mcp-vertex\/(?:core|client))\b/;

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md']);

interface IExcludedPath {
	readonly match: (relativePath: string) => boolean;
	readonly reason: string;
}

/**
 * Excluded paths. Order doesn't matter; the first match wins. Each entry
 * is anchored to the repo root via the `relative(REPO_ROOT, abs(path))`
 * helper so the rules survive being invoked from any cwd.
 */
const EXCLUDED_PATHS: readonly IExcludedPath[] = [
	// Generated / vendored
	{
		match: (p) => p.includes('/node_modules/'),
		reason: 'vendored dependency',
	},
	{ match: (p) => p.includes('/.cache/'), reason: 'build cache' },
	{ match: (p) => p.includes('/.worktrees/'), reason: 'git worktree' },
	{ match: (p) => p.includes('/dist/'), reason: 'compiled output' },
	{ match: (p) => p.endsWith('.generated.ts'), reason: 'generated SDK' },
	{ match: (p) => p.includes('/generated/'), reason: 'generated directory' },
	{
		match: (p) => p.endsWith('agent-catalog.generated.json'),
		reason: 'generated metadata',
	},
	{
		match: (p) => p.endsWith('agent-instructions.generated.md'),
		reason: 'generated metadata',
	},

	// Proposals are bilingual by design (titles in Spanish, English, etc.)
	{
		match: (p) => p.includes('/docs/delendai/proposals/'),
		reason: 'proposals folder',
	},

	// Website locale pages
	{
		match: (p) =>
			/\/apps\/[^/]+\/src\/data\/pages\/(?:install|configuration-center)\/[^/]+\.md$/.test(
				p,
			),
		reason: 'website page translation',
	},
	{
		match: (p) =>
			/\/apps\/[^/]+\/src\/data\/pages\/(?:install|configuration-center)\/[^/]+\.mdx$/.test(
				p,
			),
		reason: 'website page translation',
	},

	// Translation catalogs
	{
		match: (p) => p.includes('/i18n/langs/'),
		reason: 'i18n translation data',
	},
	// Any file under apps/<app>/src/i18n/** is i18n catalog data
	{
		match: (p) => /\/apps\/[^/]+\/src\/i18n\//.test(p),
		reason: 'apps i18n catalog',
	},
	{
		match: (p) => /\/apps\/[^/]+\/src\/i18n\/[^/]+\.strings?\.ts$/.test(p),
		reason: 'i18n strings',
	},
	{
		match: (p) => /\/apps\/[^/]+\/src\/i18n\/[^/]+\.ts$/.test(p),
		reason: 'i18n strings',
	},
	{
		match: (p) =>
			/\/extensions\/[^/]+\/src\/i18n\/[^/]+\.(strings|ts)$/.test(p),
		reason: 'VS Code extension i18n strings',
	},
	{
		match: (p) => p.endsWith('help-translation.constant.ts'),
		reason: 'CLI help translations',
	},
	{
		match: (p) => p.endsWith('plugin-origins.ts'),
		reason: 'plugin origin i18n key list',
	},
	{
		match: (p) => p.endsWith('nav-refresh.ts'),
		reason: 'per-locale nav strings',
	},
	{
		match: (p) =>
			/\/apps\/[^/]+\/src\/components\/ui\/brand-icons\.ts$/.test(p),
		reason: 'locale display names',
	},
	{
		match: (p) =>
			p.endsWith('commit-policy/src/lib/contracts/i18n-types.ts') ||
			p.endsWith('commit-policy/src/lib/contracts/i18n-types.d.ts'),
		reason: 'bilingual commit-policy catalog',
	},
	{
		match: (p) =>
			p.endsWith('packages/cli/src/lib/init/init-catalog.constant.ts'),
		reason: 'bilingual host-instructions catalog',
	},

	// Per-locale tutorials and READMEs (e.g. plugins/proposals/tutorials/es/...)
	{
		match: (p) =>
			/\/plugins\/[^/]+\/tutorials\/(?:es|fr|de|it|pt|ja|zh|th|vi|ar|hi)\//.test(
				p,
			),
		reason: 'per-locale tutorial',
	},
	{
		match: (p) =>
			/\/plugins\/[^/]+\/README\.(es|fr|de|it|pt|ja|zh|th|vi|ar|hi)\.md$/.test(
				p,
			),
		reason: 'per-locale README',
	},

	// Translation pipeline helpers
	{
		match: (p) => p.includes('translate-tutorials'),
		reason: 'translation pipeline',
	},
	{
		match: (p) => p.includes('loop-detector-i18n'),
		reason: 'i18n catalog',
	},
	{ match: (p) => p.includes('/locales/'), reason: 'locale assets' },

	// Test fixtures whose accented chars are intentional (documented above)
	{
		match: (p) => p.endsWith('shell-fallback.spec.ts'),
		reason: 'shell sentinel fixture',
	},
	{
		match: (p) => p.endsWith('safe-workspace-reader.spec.ts'),
		reason: 'unicode path fixture',
	},
	{
		match: (p) => p.endsWith('content-i18n.spec.ts'),
		reason: 'i18n catalog assertion',
	},
	{
		match: (p) => p.endsWith('markers.spec.ts'),
		reason: 'bilingual marker test',
	},
	{
		match: (p) => p.endsWith('close-tools.spec.ts'),
		reason: 'bilingual marker test',
	},
	{
		match: (p) => p.endsWith('gitlab/tests/src/lib/tools.spec.ts'),
		reason: 'unicode payload fixture',
	},
	{
		match: (p) => p.endsWith('run-command-bytes.spec.ts'),
		reason: 'unicode payload fixture',
	},
	{
		match: (p) =>
			p.endsWith('memory.spec.ts') ||
			p.endsWith('memory/store-concurrency.spec.ts'),
		reason: 'bilingual memory test',
	},
	{
		match: (p) => p.includes('preserve-rules.spec.ts'),
		reason: 'bilingual preserve-rules fixture',
	},
	{
		match: (p) => p.includes('preserve-rules.helper.ts'),
		reason: 'bilingual preserve-rules detector',
	},
	{
		match: (p) =>
			p.endsWith('commit-policy/tests/src/lib/contracts/scope.spec.ts') ||
			p.endsWith(
				'commit-policy/tests/src/lib/services/resolve-scope-prose.spec.ts',
			),
		reason: 'commit-policy test',
	},
	{
		match: (p) => p.endsWith('parse-audit.service.ts'),
		reason: 'legacy Spanish audit parser',
	},
	{
		match: (p) => p.endsWith('parse-audit.service.spec.ts'),
		reason: 'legacy Spanish audit parser fixture',
	},
	{
		match: (p) => p.includes('audit-brief.service.spec.ts'),
		reason: 'honor.*configuración regex fixture',
	},
	{
		match: (p) =>
			p.endsWith('audit.interface.ts') ||
			p.endsWith('audit.interface.d.ts'),
		reason: 'audit rubric identifier docs',
	},
	{
		match: (p) => p.endsWith('plugins/audit/src/index.ts'),
		reason: 'audit rubric identifier docs',
	},
	{
		match: (p) => p.endsWith('brief-builder.service.ts'),
		reason: 'audit brief rubric identifier',
	},
	{
		match: (p) => p.endsWith('parse-audit-line.ts'),
		reason: 'legacy audit-prefix detector',
	},
	{
		match: (p) =>
			p.endsWith('packages/core/src/lib/agents/shell-fallback.ts'),
		reason: 'runtime shell sentinel string',
	},
	{
		match: (p) => p.endsWith('plugins/status-marker/src/index.ts'),
		reason: 'bilingual marker locales',
	},

	// Self-referential: the lint script itself contains the regex character
	// class and example fixture strings; it is not project prose.
	{
		match: (p) =>
			p.endsWith('tools/scripts/lint/i18n-english-prose.script.ts') ||
			p.endsWith('tools/scripts/lint/i18n-english-prose.script.spec.ts'),
		reason: 'lint script self-reference',
	},

	// Other test fixtures whose accented chars are intentional
	{
		match: (p) => p.endsWith('user-markers.script.spec.ts'),
		reason: 'bilingual user marker fixture',
	},
	{
		match: (p) => p.endsWith('system-prompt-size.script.spec.ts'),
		reason: 'UTF-8 byte fixture',
	},
	{
		match: (p) => p.endsWith('rewrite-llm-attribution.spec.ts'),
		reason: 'commit message fixture',
	},
	{
		match: (p) => p.includes('configuration-center.spec.ts'),
		reason: 'configuration-center locale test',
	},
	{
		match: (p) =>
			p.includes('ui-extension/tests/dashboard/format.spec.ts') ||
			p.includes(
				'ui-extension/tests/dashboard/render-tool-detail.spec.ts',
			),
		reason: 'locale formatting test',
	},
	{
		match: (p) =>
			p.includes('core/tests/src/lib/shared/unicode-safe-text.spec.ts') ||
			p.includes(
				'core/tests/src/lib/shared/truncation-pagination.spec.ts',
			) ||
			p.includes('core/tests/src/lib/shared/truncate-utf8.spec.ts'),
		reason: 'UTF-8 boundary fixture',
	},
	{
		match: (p) =>
			p.includes('core/tests/src/lib/config/jsonc-document.spec.ts'),
		reason: 'JSONC comment fixture',
	},
	{
		match: (p) => p.includes('string-helpers.spec.ts'),
		reason: 'unicode kebab-case fixture',
	},
	{
		match: (p) =>
			p.includes('skills/multi-agent-coordination/SKILL.md') ||
			p.includes('skills/shell-fallback/SKILL.md'),
		reason: 'shell-fallback SKILL sentinel reference',
	},

	// Historical changelogs — they reference deprecated commands and old
	// brand names by definition (the changelog is immutable history).
	// Mirrors the exclusion in tools/scripts/migrate/rebrand-propagate.script.ts
	// (SKIP_PATHS includes 'CHANGELOG.md').
	{
		match: (p) => /\/CHANGELOG\.md$/.test(p),
		reason: 'historical changelog',
	},

	// LLM-attribution rewriters — they intentionally preserve the old
	// brand strings so historical git identities can be rewritten.
	// Mirrors the exclusion in tools/scripts/migrate/rebrand-propagate.script.ts.
	{
		match: (p) =>
			p.includes('rewrite-llm-attribution') ||
			p.includes('llm-subject-substitutions.json'),
		reason: 'LLM-attribution rewriter (preserves old brand strings)',
	},

	// The proposal-files-exist baseline records historical proposal
	// filenames (some include the old brand). It is the structural
	// record that the lint checks against; renaming the filenames would
	// break the baseline invariant.
	{
		match: (p) => p.endsWith('proposal-files-exist.baseline.json'),
		reason: 'proposal-files-exist baseline (historical filenames)',
	},
];

interface IFinding {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly kind: 'spanish-prose' | 'rebrand-leftover';
	readonly snippet: string;
}

export interface II18nEnglishProseReport {
	readonly scanned: number;
	readonly excluded: number;
	readonly findings: readonly IFinding[];
}

const abs = (path: string): string =>
	isAbsolute(path) ? path : join(REPO_ROOT, path);

const findExclusionReason = (relativePath: string): string | undefined => {
	// Tests pass synthetic roots, which produce REPO_ROOT-relative
	// paths that include the temp dir prefix
	// ("/tmp/i18n-prose-XXX/plugins/bad/README.md"). The exclusion
	// patterns use full-repo paths, so the test fixture must use full
	// paths under the temp root that match the exclusion patterns.
	const normalized = relativePath.startsWith('/')
		? relativePath
		: `/${relativePath}`;
	for (const rule of EXCLUDED_PATHS) {
		if (rule.match(normalized)) return rule.reason;
	}
	return undefined;
};

const walkSource = async (
	root: string,
): Promise<readonly { absPath: string; relPath: string }[]> => {
	const out: { absPath: string; relPath: string }[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				// Skip excluded dirs quickly to avoid descent
				if (
					entry.name === 'node_modules' ||
					entry.name === '.cache' ||
					entry.name === '.worktrees' ||
					entry.name === 'dist' ||
					entry.name === '.git' ||
					entry.name === 'generated'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!SCAN_EXTENSIONS.has(extname(entry.name))) continue;
			// Path used for the FINDING report: the path the user sees
			// in the violation line. Always REPO_ROOT-relative so the
			// exclusion patterns (which are written as full repo paths)
			// match. In tests, we pass a custom root but we want to
			// assert exact paths, so the test fixture uses sub-paths
			// that match the exclusion patterns exactly (e.g.
			// 'apps/web/src/i18n/langs/es.ts' instead of
			// 'src/i18n/langs/es.ts').
			const rel = relative(REPO_ROOT, full);
			out.push({ absPath: full, relPath: rel });
		}
	}
	return out;
};

const scanFile = async (
	absPath: string,
	relPath: string,
): Promise<readonly IFinding[]> => {
	const findings: IFinding[] = [];
	const text = await readFile(absPath, 'utf8');
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		if (SPANISH_PROSE.test(line)) {
			findings.push({
				file: relPath,
				line: i + 1,
				column: 1,
				kind: 'spanish-prose',
				snippet: line.trim().slice(0, 120),
			});
		}
		if (REBRAND_LEFTOVERS.test(line)) {
			findings.push({
				file: relPath,
				line: i + 1,
				column: 1,
				kind: 'rebrand-leftover',
				snippet: line.trim().slice(0, 120),
			});
		}
	}
	return findings;
};

export const runI18nEnglishProseLint = async (
	roots: readonly string[] = [
		'docs',
		'plugins',
		'packages',
		'apps',
		'extensions',
		'tools',
	],
): Promise<II18nEnglishProseReport> => {
	const allFiles: { absPath: string; relPath: string }[] = [];
	for (const root of roots) {
		const absRoot = abs(root);
		allFiles.push(...(await walkSource(absRoot)));
	}

	const findings: IFinding[] = [];
	let scanned = 0;
	let excluded = 0;
	for (const { absPath, relPath } of allFiles) {
		if (findExclusionReason(relPath) !== undefined) {
			excluded += 1;
			continue;
		}
		scanned += 1;
		const fileFindings = await scanFile(absPath, relPath);
		findings.push(...fileFindings);
	}

	return { scanned, excluded, findings };
};

const formatReport = (report: II18nEnglishProseReport): string => {
	if (report.findings.length === 0) {
		return [
			'i18n-english-prose: 0 violations.',
			`scanned=${report.scanned} excluded=${report.excluded}`,
		].join('\n');
	}
	const groups = new Map<string, IFinding[]>();
	for (const finding of report.findings) {
		const key = `${finding.file}:${finding.kind}`;
		const arr = groups.get(key) ?? [];
		arr.push(finding);
		groups.set(key, arr);
	}
	const lines: string[] = [
		`i18n-english-prose: ${report.findings.length} violations across ${groups.size} (file, kind) groups.`,
		`scanned=${report.scanned} excluded=${report.excluded}`,
		'',
	];
	for (const [key, list] of groups) {
		lines.push(`  ${key} (${list.length})`);
		for (const f of list.slice(0, 5)) {
			lines.push(`    L${f.line}: ${f.snippet}`);
		}
		if (list.length > 5) {
			lines.push(`    …and ${list.length - 5} more in this group`);
		}
	}
	return lines.join('\n');
};

const main = async (): Promise<void> => {
	const args = process.argv.slice(2);
	const fix = args.includes('--fix');
	const report = await runI18nEnglishProseLint();
	const text = formatReport(report);
	if (fix) {
		// `--fix` is intentionally a no-op for this gate: the script's
		// job is to REPORT, not to rewrite source (rewrites need a human
		// review because identifier renames can change MCP-visible names).
		console.log(text);
		console.log(
			'--fix is a no-op for i18n-english-prose (this gate reports, not rewrites).',
		);
		return;
	}
	console.log(text);
	if (report.findings.length > 0) {
		process.exit(1);
	}
};

if (import.meta.main) {
	void main();
}
