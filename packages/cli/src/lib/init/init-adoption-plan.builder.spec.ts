/**
 * init-adoption-plan.spec.ts — f00089 U2.
 *
 * Covers the skill inventory (several conventions + none), the tool
 * inventory/unification map (collision-free under prefix-per-plugin), the
 * deterministic A3/A4 renderers, and that `renderAdoptionPlan` now embeds
 * the real sections in place of the `_Pending f00089 U2._` placeholders
 * while preserving U1's idempotency.
 */
import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import {
	buildToolUnification,
	renderAdoptionSections,
	renderSkillMigrationSection,
	renderToolUnificationSection,
} from './init-adoption-plan.builder';
import {
	CANONICAL_SKILLS,
	detectSkillInventory,
} from './init-skill-inventory.constant';
import { renderAdoptionPlan } from './init-migrate-offer.service';
import { InitAnswers } from './init-answers.schema';

/** In-memory reader: keys are workspace-relative file paths. */
const dirReader = (files: Readonly<Record<string, string>>): IFileReader => ({
	async readFile(rel) {
		return files[rel];
	},
	async exists(rel) {
		return rel in files;
	},
	async listDir(rel) {
		const prefix = rel === '' ? '' : `${rel}/`;
		const out: string[] = [];
		for (const key of Object.keys(files)) {
			if (!key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			if (rest.length === 0) continue;
			const slash = rest.indexOf('/');
			const child = slash === -1 ? rest : rest.slice(0, slash);
			if (!out.includes(child)) out.push(child);
		}
		return out;
	},
});

describe('detectSkillInventory (f00089 U2)', () => {
	it('always exposes our canonical skills to migrate (point 2a)', async () => {
		const inv = await detectSkillInventory(dirReader({ 'src/index.ts': '' }));
		expect(inv.canonicalSkills).toBe(CANONICAL_SKILLS);
		expect(inv.canonicalSkills.length).toBeGreaterThan(0);
		expect(inv.canonicalSkills.some((s) => s.id === 'mcp-vertex-operator')).toBe(
			true,
		);
	});

	it('detects skills across several conventions and de-dups by location', async () => {
		const inv = await detectSkillInventory(
			dirReader({
				'.claude/skills/refactor/SKILL.md': '',
				'.claude/skills/review/SKILL.md': '',
				'skills/build-things/SKILL.md': '',
				'docs/skills/onboarding/index.md': '',
				'skills/deploy.skill.md': '',
				'docs/architecture.skill.md': '',
				// noise that must be ignored:
				'.claude/skills/README.md': '',
				'skills/.gitkeep': '',
			}),
		);
		expect(inv.targetHasSkills).toBe(true);
		const locations = inv.targetSkills.map((s) => s.location);
		expect(locations).toContain('.claude/skills/refactor');
		expect(locations).toContain('.claude/skills/review');
		expect(locations).toContain('skills/build-things');
		expect(locations).toContain('docs/skills/onboarding');
		expect(locations).toContain('skills/deploy.skill.md');
		expect(locations).toContain('docs/architecture.skill.md');
		// README / .gitkeep are not skills.
		expect(locations).not.toContain('.claude/skills/README.md');
		expect(locations).not.toContain('skills/.gitkeep');
		// Sorted, so deterministic.
		expect([...locations].sort()).toEqual(locations);
		// Each .claude entry classified correctly.
		const refactor = inv.targetSkills.find(
			(s) => s.location === '.claude/skills/refactor',
		);
		expect(refactor?.kind).toBe('claude-skills');
		const file = inv.targetSkills.find(
			(s) => s.location === 'docs/architecture.skill.md',
		);
		expect(file?.kind).toBe('skill-file');
		expect(file?.name).toBe('architecture');
	});

	it('reports targetHasSkills=false when the project ships no skills', async () => {
		const inv = await detectSkillInventory(
			dirReader({ 'README.md': '', 'src/index.ts': '' }),
		);
		expect(inv.targetHasSkills).toBe(false);
		expect(inv.targetSkills).toHaveLength(0);
	});
});

describe('buildToolUnification (f00089 U2)', () => {
	it('maps our plugins to prefix-per-plugin namespaces (sorted, no collision)', async () => {
		const u = await buildToolUnification(dirReader({}), {
			ourPlugins: ['proposals', 'git', 'search'],
		});
		expect(u.ours.map((n) => n.namespace)).toEqual([
			'mcp-vertex_git',
			'mcp-vertex_proposals',
			'mcp-vertex_search',
		]);
		expect(u.theirs).toHaveLength(0);
		expect(u.collisions).toHaveLength(0);
	});

	it('treats a foreign MCP server as a distinct theirs namespace', async () => {
		const u = await buildToolUnification(
			dirReader({
				'.mcp.json': JSON.stringify({
					servers: { 'acme-tools': {}, 'mcp-vertex': {} },
				}),
			}),
			{ ourPlugins: ['git'] },
		);
		// our own server id is dropped; only the foreign one remains.
		expect(u.theirs.map((n) => n.namespace)).toEqual(['acme-tools']);
		expect(u.collisions).toHaveLength(0);
	});

	it('honours a non-default prefix', async () => {
		const u = await buildToolUnification(dirReader({}), {
			ourPlugins: ['git'],
			prefix: 'acme',
		});
		expect(u.ours[0]?.namespace).toBe('acme_git');
	});

	it('flags a collision when a foreign server id equals one of our namespaces', async () => {
		// Our `git` plugin under prefix `acme` → namespace `acme_git`. If the
		// target also declares a server literally named `acme_git`, the map
		// is no longer collision-free and the plan must say so.
		const u = await buildToolUnification(
			dirReader({
				'.mcp.json': JSON.stringify({ servers: { acme_git: {} } }),
			}),
			{ ourPlugins: ['git'], prefix: 'acme' },
		);
		expect(u.collisions).toEqual(['acme_git']);
	});
});

describe('renderSkillMigrationSection (f00089 U2)', () => {
	it('renders the A3 heading, our skills, and the absorb branch (no skills)', async () => {
		const inv = await detectSkillInventory(dirReader({ 'src/a.ts': '' }));
		const md = renderSkillMigrationSection(inv);
		expect(md).toContain('### A3 — skill migration');
		expect(md).toContain('advisory');
		expect(md).toContain('mcp-vertex-operator');
		expect(md).toContain('No existing skills were detected');
		expect(md).not.toContain('_Pending');
	});

	it('lists the absorbed target skills when present', async () => {
		const inv = await detectSkillInventory(
			dirReader({ '.claude/skills/foo/SKILL.md': '' }),
		);
		const md = renderSkillMigrationSection(inv);
		expect(md).toContain('.claude/skills/foo');
		expect(md).toContain('kept as-is');
	});

	it('is deterministic for the same inventory', async () => {
		const inv = await detectSkillInventory(
			dirReader({ 'skills/a/SKILL.md': '', 'skills/b/SKILL.md': '' }),
		);
		expect(renderSkillMigrationSection(inv)).toBe(
			renderSkillMigrationSection(inv),
		);
	});
});

describe('renderToolUnificationSection (f00089 U2)', () => {
	it('renders the A4 heading, namespaces, and the no-collision assertion', async () => {
		const u = await buildToolUnification(dirReader({}), {
			ourPlugins: ['git', 'proposals'],
		});
		const md = renderToolUnificationSection(u);
		expect(md).toContain('### A4 — tool-namespace unification');
		expect(md).toContain('prefix-per-plugin');
		expect(md).toContain('mcp-vertex_git');
		expect(md).toContain('mcp-vertex_proposals');
		expect(md).toContain('No collisions');
		expect(md).not.toContain('_Pending');
	});

	it('renders the foreign-tool branch when a foreign server exists', async () => {
		const u = await buildToolUnification(
			dirReader({ '.mcp.json': JSON.stringify({ servers: { acme: {} } }) }),
			{ ourPlugins: ['git'] },
		);
		const md = renderToolUnificationSection(u);
		expect(md).toContain('acme');
		expect(md).toContain("target's own tools");
	});
});

describe('renderAdoptionSections (f00089 U2)', () => {
	it('composes both sections and returns the structured inventories', async () => {
		const out = await renderAdoptionSections(dirReader({}), {
			ourPlugins: ['git'],
		});
		expect(out.skillSection).toContain('### A3');
		expect(out.toolSection).toContain('### A4');
		expect(out.skillInventory.canonicalSkills.length).toBeGreaterThan(0);
		expect(out.toolUnification.ours[0]?.namespace).toBe('mcp-vertex_git');
	});
});

describe('renderAdoptionPlan embeds U2 sections (f00089 U2)', () => {
	const answers = (workspaceRoot: string) =>
		InitAnswers.parse({ workspaceRoot, migrateFromLegacy: true });

	it('replaces the U2 placeholders with real A3/A4 sections', async () => {
		const reader = dirReader({
			'.claude/skills/foo/SKILL.md': '',
			'docs/proposals/f00001-x.md': '',
		});
		const plan = await renderAdoptionPlan(answers('/tmp/acme'), {
			reader,
			ourPlugins: ['git', 'proposals'],
		});
		expect(plan.content).not.toContain('_Pending f00089 U2._');
		expect(plan.content).toContain('### A3 — skill migration');
		expect(plan.content).toContain('### A4 — tool-namespace unification');
		expect(plan.content).toContain('mcp-vertex-operator');
		expect(plan.content).toContain('mcp-vertex_proposals');
		expect(plan.content).toContain('.claude/skills/foo');
		// A5 (U3) untouched.
		expect(plan.content).toContain(
			'### A5 — single source of truth (filled by f00089 U3)',
		);
		expect(plan.content).toContain('_Pending f00089 U3._');
		// Structured result surfaced.
		expect(plan.sections.toolUnification.collisions).toHaveLength(0);
	});

	it('stays idempotent: a second render is byte-identical and reuses the id', async () => {
		const files: Record<string, string> = {
			'docs/proposals/f00001-x.md': '',
			'skills/build/SKILL.md': '',
		};
		const reader = dirReader(files);
		const first = await renderAdoptionPlan(answers('/tmp/acme'), {
			reader,
			ourPlugins: ['git'],
		});
		files[first.relPath] = first.content;
		const second = await renderAdoptionPlan(answers('/tmp/acme'), {
			reader,
			ourPlugins: ['git'],
		});
		expect(second.id).toBe(first.id);
		expect(second.relPath).toBe(first.relPath);
		// Sections are deterministic → the body re-renders byte-identical
		// (the plan file we wrote is ignored when allocating the id).
		expect(second.content).toBe(first.content);
	});
});
