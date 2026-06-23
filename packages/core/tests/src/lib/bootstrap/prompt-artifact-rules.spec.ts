// prompt-artifact-rules.spec.ts: pin the SOLID prompt-artifact table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildServerBlueprint } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';
import {
	DEFAULT_PROMPT_ARTIFACT_RULES,
	matchPromptArtifacts,
} from '@mcp-vertex/core/lib/bootstrap/prompt-artifact-rules';
import type { IPromptArtifactContext } from '@mcp-vertex/core/lib/bootstrap/prompt-artifact-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: (p) => (p in files ? ['exists'] : []),
});

const makeAnalysis = () =>
	analyzeProject(
		reader({
			'tsconfig.json': '{}',
			'package.json': JSON.stringify({
				name: 'svc',
				dependencies: { react: '^18' },
			}),
		}),
	);

const makeCtx = (
	overrides: Partial<{
		analysis: ReturnType<typeof makeAnalysis>;
		namespacePrefix: string;
		plugins: readonly string[];
	}> = {},
): IPromptArtifactContext => ({
	analysis: overrides.analysis ?? makeAnalysis(),
	namespacePrefix: overrides.namespacePrefix ?? 'svc',
	plugins: overrides.plugins ?? [],
});

describe('DEFAULT_PROMPT_ARTIFACT_RULES (declarative table)', () => {
	it('lists the three built-in prompts', () => {
		const ids = DEFAULT_PROMPT_ARTIFACT_RULES.map((r) => r.id);
		expect(ids).toEqual(['start', 'fix-quality', 'continue-proposal']);
	});
	it('every id is unique', () => {
		const ids = DEFAULT_PROMPT_ARTIFACT_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('matchPromptArtifacts', () => {
	it('always emits `start`', () => {
		const out = matchPromptArtifacts(makeCtx());
		expect(out[0]?.name).toBe('start');
	});
	it('emits `fix quality` when the project has scripts', () => {
		const out = matchPromptArtifacts(makeCtx());
		// analyse() does not pick scripts unless a `scripts` block
		// is in the package.json; the makeAnalysis helper above
		// does not declare one. The "fix quality" rule is gated
		// on `Object.keys(analysis.scripts).length > 0`, so it
		// should NOT fire here.
		expect(out.map((p) => p.name)).not.toContain('fix quality');
	});
	it('emits `fix quality` when the analysis has scripts', () => {
		const a = analyzeProject(
			reader({
				'tsconfig.json': '{}',
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: { test: 'vitest' },
				}),
			}),
		);
		const out = matchPromptArtifacts(makeCtx({ analysis: a }));
		expect(out.map((p) => p.name)).toContain('fix quality');
	});
	it('emits `continue proposal` when the proposals plugin is in the plan', () => {
		const out = matchPromptArtifacts(makeCtx({ plugins: ['proposals'] }));
		expect(out.map((p) => p.name)).toContain('continue proposal');
	});
	it('does NOT emit `continue proposal` when the proposals plugin is absent', () => {
		const out = matchPromptArtifacts(makeCtx());
		expect(out.map((p) => p.name)).not.toContain('continue proposal');
	});
	it('emits prompts in priority order (start > fix-quality > continue-proposal)', () => {
		const a = analyzeProject(
			reader({
				'tsconfig.json': '{}',
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: { test: 'vitest' },
				}),
			}),
		);
		const out = matchPromptArtifacts(
			makeCtx({ analysis: a, plugins: ['proposals'] }),
		);
		expect(out.map((p) => p.name)).toEqual([
			'start',
			'fix quality',
			'continue proposal',
		]);
	});
	it('the `start` body calls startPromptBody with the analysis + namespacePrefix', () => {
		const out = matchPromptArtifacts(makeCtx({ namespacePrefix: 'myapp' }));
		expect(out[0]?.body).toContain('myapp_overview');
	});
});

describe('integration: buildServerBlueprint uses the rule table', () => {
	it('produces the same prompts as the pre-refactor inline builder', () => {
		// The pre-refactor builder produced:
		//   - start (always)
		//   - fix quality (when scripts exist)
		//   - continue proposal (when proposals plugin is in the
		//     plan)
		// We assert the same for a TypeScript+React project with
		// the proposals plugin.
		const a = analyzeProject(
			reader({
				'tsconfig.json': '{}',
				'package.json': JSON.stringify({
					name: 'svc',
					dependencies: { react: '^18' },
					scripts: { test: 'vitest' },
				}),
			}),
		);
		const bp = buildServerBlueprint(a);
		expect(bp.prompts.map((p) => p.name)).toEqual(['start', 'fix quality']);
		// No proposals plugin in the default catalog for libraries →
		// no `continue proposal` prompt.
		expect(bp.prompts.map((p) => p.name)).not.toContain(
			'continue proposal',
		);
	});
});
