// note-rules.spec.ts: pin the SOLID note table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildServerBlueprint } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';
import {
	DEFAULT_NOTE_RULES,
	matchNotes,
} from '@mcp-vertex/core/lib/bootstrap/note-rules';
import type { INoteContext } from '@mcp-vertex/core/lib/bootstrap/note-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: (p) => (p in files ? ['exists'] : []),
});

const makeAnalysis = (
	overrides: {
		hasMcpProject?: boolean;
		mcpEvidence?: readonly string[];
		agentConfigs?: readonly string[];
	} = {},
) => {
	const files: Record<string, string> = {
		'tsconfig.json': '{}',
		'package.json': JSON.stringify({
			name: 'svc',
			dependencies: overrides.hasMcpProject
				? { '@modelcontextprotocol/sdk': '^1' }
				: {},
		}),
	};
	for (const cfg of overrides.agentConfigs ?? []) {
		files[cfg] = '# guide';
	}
	return analyzeProject(reader(files));
};

const makeCtx = (
	overrides: Partial<{
		analysis: ReturnType<typeof makeAnalysis>;
		tests: boolean;
		defaults: {
			keepLegacy: boolean;
			reasons: readonly string[];
			warnings: readonly string[];
		};
	}> = {},
): INoteContext => ({
	analysis: overrides.analysis ?? makeAnalysis(),
	defaults: overrides.defaults ?? {
		keepLegacy: false,
		reasons: [],
		warnings: [],
	},
	tests: overrides.tests ?? true,
});

describe('DEFAULT_NOTE_RULES (declarative table)', () => {
	it('lists the six built-in note rules', () => {
		const ids = DEFAULT_NOTE_RULES.map((r) => r.id);
		expect(ids).toEqual([
			'pattern-knowledge-hints',
			'mcp-server-state',
			'tests-policy',
			'agent-configs-align',
			'keep-legacy-recommendation',
			'keep-legacy-warnings',
		]);
	});
});

describe('matchNotes', () => {
	it('emits pattern knowledge hints first (priority 1000)', () => {
		const out = matchNotes(makeCtx());
		// The first emitted note is the first knowledge hint from
		// the pattern catalog — for a tsconfig-only project the
		// `library` catalog is the right match.
		expect(out[0]).toMatch(/Guard|public|barrel|API|export|pattern/);
	});
	it('emits the mcp-server-state note for a fresh project', () => {
		const out = matchNotes(makeCtx());
		// Debug aid: surface the actual output when this fails.
		if (!out.some((n) => n.startsWith('No MCP server found'))) {
			throw new Error(`debug notes=${JSON.stringify(out)}`);
		}
		expect(
			out.some((n) =>
				n.startsWith(
					'No MCP server found: create one from this blueprint',
				),
			),
		).toBe(true);
	});
	it('emits the mcp-server-state note for a project that already has one', () => {
		const a = makeAnalysis({
			hasMcpProject: true,
			mcpEvidence: ['depends on @modelcontextprotocol/sdk'],
		});
		const out = matchNotes(makeCtx({ analysis: a }));
		expect(
			out.some((n) =>
				n.startsWith(
					'An MCP server already exists (depends on @modelcontextprotocol/sdk)',
				),
			),
		).toBe(true);
	});
	it('emits the tests-policy note (default: tests enabled)', () => {
		const out = matchNotes(makeCtx());
		expect(out).toContain('Generate a test alongside each tool.');
	});
	it('emits the tests-policy note for `tests=false`', () => {
		const out = matchNotes(makeCtx({ tests: false }));
		expect(out).toContain('Tests omitted (--mcp-project-tests=false).');
	});
	it('emits the agent-configs-align note when configs are present', () => {
		const a = makeAnalysis({ agentConfigs: ['AGENTS.md'] });
		const out = matchNotes(makeCtx({ analysis: a }));
		expect(out).toContain(
			'Align with the existing agent config (AGENTS.md).',
		);
	});
	it('does NOT emit the agent-configs-align note when no configs are present', () => {
		const out = matchNotes(makeCtx());
		expect(out).not.toContain('Align with the existing agent config');
	});
	it('emits the keep-legacy-recommendation note for keepLegacy=true', () => {
		const out = matchNotes(
			makeCtx({
				defaults: { keepLegacy: true, reasons: ['foo'], warnings: [] },
			}),
		);
		expect(out).toContain('Recommended keepLegacy=true: foo.');
	});
	it('emits the keep-legacy-recommendation note for the greenfield default', () => {
		const out = matchNotes(makeCtx());
		expect(out).toContain(
			'Recommended keepLegacy=false: greenfield-safe default.',
		);
	});
	it('emits the keep-legacy-warnings note (spread from defaults.warnings)', () => {
		const out = matchNotes(
			makeCtx({
				defaults: {
					keepLegacy: true,
					reasons: [],
					warnings: ['first warning', 'second warning'],
				},
			}),
		);
		expect(out).toContain('first warning');
		expect(out).toContain('second warning');
	});
	it('emits notes in priority order (knowledge hints → mcp-state → tests → agent-configs → keep-legacy → warnings)', () => {
		const out = matchNotes(makeCtx());
		const idxMcp = out.findIndex((n) =>
			n.startsWith('No MCP server found'),
		);
		const idxTests = out.findIndex((n) => n.startsWith('Generate a test'));
		const idxKeepLegacy = out.findIndex((n) =>
			n.startsWith('Recommended keepLegacy'),
		);
		expect(idxMcp).toBeLessThan(idxTests);
		expect(idxTests).toBeLessThan(idxKeepLegacy);
	});
});

describe('integration: buildServerBlueprint uses the rule table', () => {
	it('produces the same notes as the pre-refactor inline builder', () => {
		// The pre-refactor builder produced, in order:
		//   - pattern.knowledgeHints
		//   - MCP-server note
		//   - tests note
		//   - (optional) agent-configs note
		//   - keep-legacy note
		//   - defaults.warnings (spread)
		const a = makeAnalysis({ agentConfigs: ['AGENTS.md'] });
		const bp = buildServerBlueprint(a);
		// First note is from the pattern knowledge hints.
		expect(bp.notes[0]).toMatch(
			/Guard the public barrel|public API|typecheck|project-specific tools|patterns emerge/,
		);
		// Contains the mcp-server note.
		expect(
			bp.notes.some((n) =>
				n.startsWith(
					'No MCP server found: create one from this blueprint',
				),
			),
		).toBe(true);
		// Contains the tests note.
		expect(bp.notes).toContain('Generate a test alongside each tool.');
		// Contains the agent-configs note.
		expect(bp.notes).toContain(
			'Align with the existing agent config (AGENTS.md).',
		);
		// Contains the keep-legacy note (default false).
		expect(bp.notes).toContain(
			'Recommended keepLegacy=false: greenfield-safe default.',
		);
	});
});
