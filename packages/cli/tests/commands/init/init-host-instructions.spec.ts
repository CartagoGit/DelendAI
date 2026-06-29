/**
 * init-host-instructions.spec.ts — f00088 §vision U3.
 *
 * Single-source-of-truth consolidation: detect the target's scattered
 * agent-instruction sources, collapse them into one canonical doc with
 * preserved provenance, and emit non-destructive pointer blocks for the
 * legacy locations. Every branch is driven by an in-memory reader so the
 * specs are deterministic and never touch disk.
 */
import { describe, expect, it } from 'vitest';

import {
	AGENT_INSTRUCTION_SOURCE_SPECS,
	CANONICAL_AGENT_DOC_REL,
	buildInstructionConsolidationPlan,
	classifyInstructionSource,
	collapseToCanonicalBody,
	discoverInstructionSources,
	extractOriginalProse,
	planInstructionConsolidation,
	renderLegacyPointerBody,
	type IConsolidationPlan,
} from '../../../src/commands/init/init-host-instructions';

const readerFrom =
	(files: Readonly<Record<string, string>>) =>
	async (_workspace: string, relPath: string): Promise<string | undefined> =>
		files[relPath];

const plan = (
	files: Readonly<Record<string, string>>,
): Promise<IConsolidationPlan> =>
	buildInstructionConsolidationPlan(
		'/abs/ws',
		Object.keys(files),
		readerFrom(files),
	);

describe('classifyInstructionSource (U3 detection)', () => {
	it('classifies the common scattered agent-instruction sources', () => {
		expect(classifyInstructionSource('CLAUDE.md')).toBe('Claude');
		expect(classifyInstructionSource('AGENTS.md')).toBe('AGENTS');
		expect(classifyInstructionSource('.cursorrules')).toBe('Cursor');
		expect(
			classifyInstructionSource('.github/copilot-instructions.md'),
		).toBe('Copilot');
		expect(classifyInstructionSource('.windsurfrules')).toBe('Windsurf');
		expect(classifyInstructionSource('.aider.conf.yml')).toBe('Aider');
	});

	it('matches nested CLAUDE.md / AGENTS.md and ad-hoc *.agent.md', () => {
		expect(classifyInstructionSource('packages/x/CLAUDE.md')).toBe('Claude');
		expect(classifyInstructionSource('apps/web/AGENTS.md')).toBe('AGENTS');
		expect(classifyInstructionSource('docs/onboarding.agent.md')).toBe(
			'Ad-hoc agent doc',
		);
	});

	it('does not match unrelated files or the canonical sink itself', () => {
		expect(classifyInstructionSource('README.md')).toBeUndefined();
		expect(classifyInstructionSource('MY-AGENTS.md')).toBeUndefined();
		expect(classifyInstructionSource(CANONICAL_AGENT_DOC_REL)).toBeUndefined();
	});

	it('exposes an extensible, non-empty spec list', () => {
		expect(AGENT_INSTRUCTION_SOURCE_SPECS.length).toBeGreaterThan(5);
	});
});

describe('extractOriginalProse', () => {
	it('returns the whole file when there is no mcp-vertex block', () => {
		expect(extractOriginalProse('# Rules\n\nbe nice')).toBe(
			'# Rules\n\nbe nice',
		);
	});

	it('strips the mcp-vertex block, keeping surrounding prose', () => {
		const content =
			'# Rules\n\n<!-- mcp-vertex:begin -->\n\ninjected\n\n<!-- mcp-vertex:end -->\n';
		expect(extractOriginalProse(content)).toBe('# Rules');
	});

	it('is empty for a pointer-only file', () => {
		const content =
			'<!-- mcp-vertex:begin -->\n\n<!-- mcp-vertex:pointer -->\n\nsee canonical\n\n<!-- mcp-vertex:end -->\n';
		expect(extractOriginalProse(content)).toBe('');
	});
});

describe('discoverInstructionSources (U3 detection)', () => {
	it('inventories several scattered sources, deterministically ordered', async () => {
		const sources = await discoverInstructionSources(
			'/abs/ws',
			['CLAUDE.md', '.cursorrules', 'AGENTS.md', 'README.md'],
			readerFrom({
				'CLAUDE.md': 'claude rules',
				'.cursorrules': 'cursor rules',
				'AGENTS.md': 'agents rules',
				'README.md': 'not an agent file',
			}),
		);
		expect(sources.map((s) => s.relPath)).toEqual([
			'.cursorrules',
			'AGENTS.md',
			'CLAUDE.md',
		]);
		expect(sources.every((s) => !s.isPointerOnly)).toBe(true);
	});

	it('skips non-existent candidates and marks pointer-only files', async () => {
		const sources = await discoverInstructionSources(
			'/abs/ws',
			['CLAUDE.md', 'AGENTS.md'],
			readerFrom({
				'CLAUDE.md': 'real prose',
				'AGENTS.md':
					'<!-- mcp-vertex:begin -->\n\n<!-- mcp-vertex:pointer -->\n\nsee canonical\n\n<!-- mcp-vertex:end -->\n',
			}),
		);
		const claude = sources.find((s) => s.relPath === 'CLAUDE.md');
		const agents = sources.find((s) => s.relPath === 'AGENTS.md');
		expect(claude?.isPointerOnly).toBe(false);
		expect(agents?.isPointerOnly).toBe(true);
	});
});

describe('collapseToCanonicalBody (U3 collapse + provenance)', () => {
	it('merges every source with prose under a provenance heading', async () => {
		const sources = await discoverInstructionSources(
			'/abs/ws',
			['CLAUDE.md', 'AGENTS.md'],
			readerFrom({
				'CLAUDE.md': 'claude rule one',
				'AGENTS.md': 'agents rule two',
			}),
		);
		const body = collapseToCanonicalBody(sources);
		expect(body).toContain('single source of truth');
		expect(body).toContain('## From AGENTS.md (AGENTS)');
		expect(body).toContain('agents rule two');
		expect(body).toContain('## From CLAUDE.md (Claude)');
		expect(body).toContain('claude rule one');
	});

	it('emits the empty-absorb form when nothing carries prose', () => {
		const body = collapseToCanonicalBody([]);
		expect(body).toContain('No pre-existing agent instructions');
	});
});

describe('renderLegacyPointerBody', () => {
	it('points back to the canonical doc and names the source', () => {
		const body = renderLegacyPointerBody('Cursor');
		expect(body).toContain(CANONICAL_AGENT_DOC_REL);
		expect(body).toContain('Cursor');
		expect(body).toContain('<!-- mcp-vertex:pointer -->');
	});
});

describe('planInstructionConsolidation (U3 plan)', () => {
	it('produces one canonical write plus a pointer per source', async () => {
		const consolidation = await plan({
			'CLAUDE.md': 'claude rules',
			'AGENTS.md': 'agents rules',
			'.cursorrules': 'cursor rules',
		});
		const canonical = consolidation.writes.filter(
			(w) => w.role === 'canonical',
		);
		const pointers = consolidation.writes.filter((w) => w.role === 'pointer');
		expect(canonical).toHaveLength(1);
		expect(canonical[0]?.relPath).toBe(CANONICAL_AGENT_DOC_REL);
		expect(pointers.map((p) => p.relPath).sort()).toEqual([
			'.cursorrules',
			'AGENTS.md',
			'CLAUDE.md',
		]);
	});

	it('non-destruction: a pointer write preserves the user prose above the block', async () => {
		const consolidation = await plan({ 'CLAUDE.md': '# Local rules\n\nkeep me' });
		const pointer = consolidation.writes.find((w) => w.role === 'pointer');
		expect(pointer?.content).toContain('# Local rules');
		expect(pointer?.content).toContain('keep me');
		expect(pointer?.content).toContain('<!-- mcp-vertex:pointer -->');
	});

	it('still emits the canonical doc when there is nothing to absorb', async () => {
		const consolidation = await plan({});
		expect(
			consolidation.writes.some((w) => w.role === 'canonical'),
		).toBe(true);
		expect(consolidation.writes.some((w) => w.role === 'pointer')).toBe(false);
	});

	it('idempotency: re-running over already-consolidated files adds nothing new', async () => {
		const first = await plan({
			'CLAUDE.md': 'claude rules',
			'AGENTS.md': 'agents rules',
		});
		// Build the post-write tree from the first pass.
		const afterFirst: Record<string, string> = {};
		for (const w of first.writes) afterFirst[w.relPath] = w.content;
		// The legacy files now carry their pointer block; re-read them as-is.
		const afterFirstFull: Record<string, string> = {
			'CLAUDE.md':
				first.writes.find((w) => w.relPath === 'CLAUDE.md')?.content ?? '',
			'AGENTS.md':
				first.writes.find((w) => w.relPath === 'AGENTS.md')?.content ?? '',
			[CANONICAL_AGENT_DOC_REL]: afterFirst[CANONICAL_AGENT_DOC_REL] ?? '',
		};
		const second = await plan(afterFirstFull);
		// Canonical doc is byte-stable across runs.
		const firstCanon = first.writes.find((w) => w.role === 'canonical');
		const secondCanon = second.writes.find((w) => w.role === 'canonical');
		expect(secondCanon?.content).toBe(firstCanon?.content);
		// Pointer-only legacy files produce no further pointer writes.
		expect(second.writes.some((w) => w.role === 'pointer')).toBe(false);
	});

	it('idempotency: collapse is byte-stable when fed the same sources twice', async () => {
		const files = { 'CLAUDE.md': 'a', 'AGENTS.md': 'b', '.cursorrules': 'c' };
		const a = await plan(files);
		const b = await plan(files);
		expect(b).toEqual(a);
	});
});
