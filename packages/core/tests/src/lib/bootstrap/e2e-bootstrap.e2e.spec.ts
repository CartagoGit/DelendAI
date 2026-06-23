// f00051 S6 — e2e for the bootstrap flow.
//
// Drives `analyze_project` → `plan_mcp_project` → `create_project` over
// the real `examples/*` projects on disk. The point is to prove the
// end-to-end contract holds for a project that:
//   - has a `mcp-vertex.config.json` and no `package.json`
//   - is shaped like an example (intentionally minimal)
//
// The test is read-only: it builds a `FileReader` rooted at the
// example dir, calls the pure analysis/plan/blueprint functions, and
// asserts the output is well-formed. It does NOT scaffold a real
// project inside the example dir (that would be a side effect on the
// repo).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildServerBlueprint } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';
import { buildBlueprintFiles } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';
import { diffCapabilities } from '@mcp-vertex/core/lib/bootstrap/capability-diff';
import { PROJECT_PATTERN_CATALOG } from '@mcp-vertex/core/lib/bootstrap/pattern-catalog';
import { recommendServerPlan } from '@mcp-vertex/core/lib/bootstrap/recommend-plan';

const repoRoot = resolve(
	import.meta.dirname,
	'..',
	'..',
	'..',
	'..',
	'..',
	'..',
);

const fsReader = (root: string): IFileReader => ({
	readFile: (rel) => {
		try {
			return readFileSync(join(root, rel), 'utf8');
		} catch {
			return undefined;
		}
	},
	exists: (rel) => existsSync(join(root, rel)),
	listDir: (rel) => {
		try {
			return readdirSync(join(root, rel));
		} catch {
			return [];
		}
	},
});

const analyse = (root: string) => analyzeProject(fsReader(root));

describe('bootstrap e2e over examples/', () => {
	it('analyzes examples/minimal without crashing (no package.json)', () => {
		const root = join(repoRoot, 'examples', 'minimal');
		expect(statSync(root).isDirectory()).toBe(true);
		const analysis = analyse(root);
		// A config file is present but no package.json.
		expect(analysis.hasPackageJson).toBe(false);
		expect(analysis.projectType).toBe('generic');
		// The notes mention either the absence of MCP, or the align
		// with existing config — either way, the analysis is well-formed.
		expect(analysis.signals.length).toBeGreaterThan(0);
	});

	it('produces a usable server plan for examples/minimal', () => {
		const root = join(repoRoot, 'examples', 'minimal');
		const analysis = analyse(root);
		const plan = recommendServerPlan(analysis, {
			serverName: 'mcp-minimal',
		});
		expect(plan.serverName).toBe('mcp-minimal');
		// The mcpJson is well-formed and references @mcp-vertex/core.
		const mcp = plan.mcpJson as {
			servers: Record<string, { command: string; args: string[] }>;
		};
		expect(mcp.servers).toBeDefined();
		const [serverName, entry] = Object.entries(mcp.servers)[0] ?? [];
		expect(serverName).toBe('mcp-minimal');
		expect(entry?.command).toBe('bunx');
		expect(entry?.args).toContain('@mcp-vertex/core');
	});

	it('builds an exhaustive blueprint for examples/minimal', () => {
		const root = join(repoRoot, 'examples', 'minimal');
		const analysis = analyse(root);
		const bp = buildServerBlueprint(analysis);
		// Even an empty analysis produces a non-trivial blueprint
		// (catalog baseline + the 3 standard prompts + standard skills).
		expect(bp.tools.length).toBeGreaterThan(0);
		expect(bp.prompts.length).toBeGreaterThan(0);
		expect(bp.skills.length).toBeGreaterThan(0);
		expect(bp.agents.length).toBeGreaterThan(0);
		expect(bp.tests).toBe(true);
		// `start` is always present.
		expect(bp.prompts.find((p) => p.name === 'start')).toBeDefined();
	});

	it('materialises a dry-run skeleton that contains a host server + tools + tests', () => {
		const root = join(repoRoot, 'examples', 'minimal');
		const analysis = analyse(root);
		const bp = buildServerBlueprint(analysis);
		const files = buildBlueprintFiles(bp);
		const paths = files.map((f) => f.path);
		// Host project always ships a server entry, host config and orchestrator.
		expect(paths).toContain('libs/mcp-project/src/server.ts');
		expect(paths).toContain(
			'libs/mcp-project/src/lib/shared/host-config.ts',
		);
		expect(paths).toContain('.github/agents/orchestrator.agent.md');
		expect(paths).toContain('.github/copilot-instructions.md');
		// A tool is scaffolded (catalog baseline).
		expect(paths.some((p) => p.endsWith('.tool.ts'))).toBe(true);
		// And a spec for it (tests=true by default).
		expect(paths.some((p) => p.endsWith('.tool.spec.ts'))).toBe(true);
	});

	it('diffCapabilities marks every tool as missing when the project has no existing server', () => {
		const root = join(repoRoot, 'examples', 'minimal');
		const analysis = analyse(root);
		const bp = buildServerBlueprint(analysis);
		const diff = diffCapabilities(bp, [], {
			namespacePrefix: 'mcp-minimal',
		});
		expect(diff.missing.length).toBe(bp.tools.length);
		expect(diff.present).toEqual([]);
		// `extra` is also empty: with `existing=[]`, nothing is extra.
		expect(diff.extra).toEqual([]);
		// Summary is one line.
		expect(diff.summary).toMatch(/missing/);
	});

	it('every prompt and skill in the blueprint has a body (not just TODO)', () => {
		const root = join(repoRoot, 'examples', 'minimal');
		const analysis = analyse(root);
		const bp = buildServerBlueprint(analysis);
		for (const prompt of bp.prompts) {
			expect(
				prompt.body,
				`prompt ${prompt.name} has no body`,
			).toBeDefined();
			expect(prompt.body?.length ?? 0).toBeGreaterThan(20);
		}
		for (const skill of bp.skills) {
			expect(skill.body, `skill ${skill.name} has no body`).toBeDefined();
			expect(skill.body?.length ?? 0).toBeGreaterThan(20);
		}
	});

	it('the orchestrator agent references the bootstrap tools (gap 4)', () => {
		const root = join(repoRoot, 'examples', 'minimal');
		const analysis = analyse(root);
		const bp = buildServerBlueprint(analysis);
		const files = buildBlueprintFiles(bp);
		const orchestrator = files.find((f) =>
			f.path.endsWith('.github/agents/orchestrator.agent.md'),
		);
		expect(orchestrator).toBeDefined();
		// The blueprint derives the namespace from the (empty) analysis
		// name → "app", so the bootstrap tool ids are `app_*`.
		expect(orchestrator?.content).toContain('app_analyze_project');
		expect(orchestrator?.content).toContain('app_plan_mcp_project');
		expect(orchestrator?.content).toContain('app_create_project');
		// The "re-analysis" lane step is the gap 4 deliverable.
		expect(orchestrator?.content).toContain('re-analysis');
	});

	it('the catalog is project-agnostic: every project type has a known shape', () => {
		// Sanity: the catalog has 6 entries, each with the right
		// required fields. This is the seam `patternOverrides` hooks
		// into — keep it honest.
		expect(Object.keys(PROJECT_PATTERN_CATALOG)).toHaveLength(6);
		for (const [type, pattern] of Object.entries(PROJECT_PATTERN_CATALOG)) {
			expect(pattern.type, `catalog ${type}`).toBe(type);
			expect(
				pattern.recommendedTools.length,
				`catalog ${type}`,
			).toBeGreaterThan(0);
		}
	});
});
