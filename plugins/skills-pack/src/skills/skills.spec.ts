import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SafeWorkspaceReader } from '@delendai/core/public';

import { SKILLS_PACK_SKILLS } from './catalog';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const agentCatalogPath = resolve(
	workspaceRoot,
	'docs/mcp-vertex/agent-catalog.generated.json',
);
const pluginsRoot = resolve(workspaceRoot, 'plugins');

const extractFrontmatter = (body: string): string => {
	const match = /^---\n([\s\S]*?)\n---\n/u.exec(body);
	if (match?.[1] === undefined) {
		throw new Error('Missing frontmatter block');
	}
	return match[1];
};

const extractInlineString = (frontmatter: string, key: string): string => {
	const match = new RegExp(`^${key}:\\s*(.+)$`, 'mu').exec(frontmatter);
	if (match?.[1] === undefined) {
		throw new Error(`Missing ${key}`);
	}
	return match[1].trim();
};

const extractInlineArray = (frontmatter: string, key: string): string[] => {
	const raw = extractInlineString(frontmatter, key);
	if (!raw.startsWith('[') || !raw.endsWith(']')) {
		throw new Error(`${key} must be an inline array`);
	}
	const inner = raw.slice(1, -1).trim();
	if (inner.length === 0) return [];
	return inner
		.split(',')
		.map((item) => item.trim().replace(/^['"]|['"]$/gu, ''))
		.filter((item) => item.length > 0);
};

const collectPluginToolIds = async (
	dir: string,
	pluginName?: string,
): Promise<Set<string>> => {
	const reader = new SafeWorkspaceReader(workspaceRoot);
	const entries = await readdir(dir, { withFileTypes: true });
	const ids = new Set<string>();
	for (const entry of entries) {
		const absPath = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			const nextPlugin =
				pluginName ?? (dir === pluginsRoot ? entry.name : undefined);
			for (const id of await collectPluginToolIds(absPath, nextPlugin))
				ids.add(id);
			continue;
		}
		if (
			!entry.isFile() ||
			!entry.name.endsWith('.ts') ||
			pluginName === undefined
		) {
			continue;
		}
		const source = (await reader.readText(absPath)).content;
		for (const match of source.matchAll(/id:\s*'([^']+)'/gu)) {
			const toolId = match[1];
			if (toolId) ids.add(`mcp-vertex_${pluginName}_${toolId}`);
		}
	}
	return ids;
};

describe('skills-pack skills', () => {
	it('ships six skills with required frontmatter and headings', async () => {
		await Promise.all(
			SKILLS_PACK_SKILLS.map(async (skill) => {
				const absPath = resolve(workspaceRoot, skill.path);
				const body = (
					await new SafeWorkspaceReader(workspaceRoot).readText(
						absPath,
					)
				).content;
				const frontmatter = extractFrontmatter(body);

				expect(extractInlineString(frontmatter, 'name')).toBe(skill.id);
				expect(extractInlineString(frontmatter, 'id')).toBe(skill.id);
				expect(
					extractInlineString(frontmatter, 'title'),
				).not.toHaveLength(0);
				expect(
					extractInlineString(frontmatter, 'category'),
				).not.toHaveLength(0);
				expect(
					extractInlineString(frontmatter, 'description'),
				).not.toHaveLength(0);
				expect(
					extractInlineArray(frontmatter, 'tags').length,
				).toBeGreaterThan(0);
				expect(extractInlineArray(frontmatter, 'tools')).toEqual(
					skill.tools,
				);
				expect(
					extractInlineArray(frontmatter, 'appliesTo').length,
				).toBeGreaterThan(0);

				expect(body).toContain('## Goal');
				expect(body).toContain('## Steps');
			}),
		);
	});

	it('references only tools that exist in the generated catalog', async () => {
		const parsed = JSON.parse(
			(
				await new SafeWorkspaceReader(workspaceRoot).readText(
					agentCatalogPath,
				)
			).content,
		) as {
			tools?: Array<{ name?: string }>;
		};
		const catalogTools = new Set(
			(parsed.tools ?? [])
				.map((entry) => entry.name)
				.filter((name): name is string => typeof name === 'string'),
		);
		for (const tool of await collectPluginToolIds(pluginsRoot)) {
			catalogTools.add(tool);
		}

		for (const skill of SKILLS_PACK_SKILLS) {
			for (const tool of skill.tools) {
				expect(
					catalogTools.has(tool),
					`${skill.id} references ${tool}`,
				).toBe(true);
			}
		}
	});
});
