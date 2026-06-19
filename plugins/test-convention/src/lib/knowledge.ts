import type { IFileReader } from '@mcp-vertex/core/public';

import { effectiveMockStyle, type ITestConvention } from '../convention';
import type { IRunnerInfo } from './runners';

/**
 * Render the canonical test convention as a markdown block suitable
 * for the `test-convention-overview` knowledge entry. The agent can
 * read this on demand via `<prefix>_get_convention` or via the
 * core's `mcp-vertex_knowledge` tool.
 */
export const renderOverviewMarkdown = (c: ITestConvention): string => {
	const mock = effectiveMockStyle(c);
	return [
		'# Test convention',
		'',
		`Spec files use the suffix \`.${c.specExtension}\`.`,
		`Layout: \`${c.specLayout}\`.`,
		`Mock API: \`${mock}\` (auto-derived from runners [${c.runners.join(', ')}]).`,
		`Top-level \`describe(...)\` is **required**: ${c.requireDescribe ? 'yes' : 'no'}.`,
		'',
		'## Rules',
		'',
		'- Every spec must start with a top-level `describe(...)` whose name matches the module under test.',
		'- Use `it("…")` for cases; group related cases in nested `describe` blocks.',
		'- Mocks: prefer `vi.fn()` / `vi.spyOn()` (vitest) or `jest.fn()` / `jest.spyOn()` (jest) — never mix.',
		'- Async code: use `async/await`; do not return unawaited promises.',
		'- Assertions: prefer `expect(x).toEqual(y)` over `toBe(x === y)` style.',
		'- Errors: assert on the error class AND a substring of the message.',
		'- Forbidden patterns (any spec that violates them is a drift error):',
		`  ${c.forbiddenPatterns.map((p) => `\`${p.source}\``).join(', ')}`,
		'',
		'## Naming',
		'',
		'- Spec file name mirrors the source file name.',
		'- `describe("moduleName")` — never empty.',
		'- `it("does <thing>")` — present tense, no "should" prefix.',
		'',
		'## Imports',
		'',
		'- Always import the unit under test at the top of the spec.',
		'- Use the workspace aliases (`@mcp-vertex/core/public`, etc.) when the host configures them.',
		'- Group imports: stdlib → external → workspace → relative.',
		'',
		'## Coverage',
		'',
		`- Lines: ≥ ${c.coverageThreshold.lines}%`,
		`- Functions: ≥ ${c.coverageThreshold.functions}%`,
		`- Branches: ≥ ${c.coverageThreshold.branches}%`,
		`- Statements: ≥ ${c.coverageThreshold.statements}%`,
		'',
		'## Where to put the spec',
		'',
		`- Layout \`${c.specLayout}\`: ${layoutHint(c.specLayout)}`,
	].join('\n');
};

const layoutHint = (layout: ITestConvention['specLayout']): string => {
	switch (layout) {
		case 'colocate':
			return 'place the spec next to the source file (same directory).';
		case 'tests-mirror':
			return 'mirror the source tree under `tests/` (e.g. `src/lib/foo/bar.ts` → `tests/lib/foo/bar.spec.ts`).';
		case 'tests-flat':
			return 'place all specs flat under `tests/` using the basename of the source file.';
	}
};

export const renderRunnersMarkdown = (
	reader: IFileReader,
	info: IRunnerInfo,
): string =>
	[
		'# Detected test runners',
		'',
		`- Primary runner: **${info.name}**`,
		`- Mock API: **${info.mockApi}**`,
		`- Evidence: \`${info.evidence}\``,
		'',
		'## How detection works',
		'',
		'1. Look for `vitest.config.{ts,mts,js}` or `jest.config.{ts,js}` at the workspace root.',
		'2. If absent, inspect `package.json#scripts.test` for the substring `vitest` or `jest`.',
		'3. Otherwise, mark the runner as `unknown` and use `jest` as the default mock API.',
		'',
		'## Multi-runner projects',
		'',
		'Set `runners` explicitly in `mcp-vertex.config.json` when both `vitest` and `jest`',
		'coexist (e.g. a migration window). The plugin then reports `wrong-mock-api`',
		'when a spec uses an API that does not match the **detected** runner.',
		'',
		'_Hint:_ the runtime reader is',
		`\`${reader.constructor?.name ?? 'IFileReader'}\` (injected by the host).`,
	].join('\n');

export const renderCoverageMarkdown = (c: ITestConvention): string =>
	[
		'# Coverage thresholds',
		'',
		'| Metric     | Minimum |',
		'|------------|---------|',
		`| lines      | ${c.coverageThreshold.lines}% |`,
		`| functions  | ${c.coverageThreshold.functions}% |`,
		`| branches   | ${c.coverageThreshold.branches}% |`,
		`| statements | ${c.coverageThreshold.statements}% |`,
		'',
		'## Override per-project',
		'',
		'```jsonc',
		'// mcp-vertex.config.json',
		'{',
		'  "plugins": {',
		'    "test-convention": {',
		'      "options": {',
		'        "coverageThreshold": {',
		'          "lines": 90,',
		'          "branches": 80',
		'        }',
		'      }',
		'    }',
		'  }',
		'}',
		'```',
		'',
		'Any omitted field falls back to the default.',
	].join('\n');
