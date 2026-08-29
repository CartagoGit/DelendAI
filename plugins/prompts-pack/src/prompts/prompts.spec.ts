import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SafeWorkspaceReader } from '@mcp-vertex/core/public';

import { buildGenerateDocstringsPrompt } from './docstrings';
import { buildExplainThisCodePrompt } from './explain';
import { buildOptimizeThisPrompt } from './optimize';
import { buildReviewThisDiffPrompt } from './review-diff';
import { buildSecurityAuditThisFilePrompt } from './security-audit';
import type { ITemplatedPromptRegistration } from './shared';
import { buildWriteTestsForPrompt } from './write-tests';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../../..');
const providerPattern = /\b(claude|gpt|anthropic|openai)\b/i;
const toolIdPattern = /\bmcp-vertex_[a-z0-9-]+(?:_[a-z0-9-]+)+\b/g;

type Prompt = ITemplatedPromptRegistration<Record<string, unknown>>;

const prompts = (): readonly Prompt[] =>
	[
		buildExplainThisCodePrompt('prompts-pack') as Prompt,
		buildGenerateDocstringsPrompt('prompts-pack') as Prompt,
		buildWriteTestsForPrompt('prompts-pack') as Prompt,
		buildReviewThisDiffPrompt('prompts-pack') as Prompt,
		buildSecurityAuditThisFilePrompt('prompts-pack') as Prompt,
		buildOptimizeThisPrompt('prompts-pack') as Prompt,
	] as const;

const sampleArgs: Record<string, Record<string, unknown>> = {
	'explain-this-code': {
		file: 'packages/core/src/public/index.ts',
		startLine: 1,
		endLine: 20,
	},
	'generate-docstrings': {
		file: 'plugins/prompts-pack/src/index.ts',
	},
	'write-tests-for': {
		file: 'plugins/prompts-pack/src/prompts/explain.ts',
		style: 'unit',
	},
	'review-this-diff': {
		base: 'origin/develop',
		head: 'HEAD',
	},
	'security-audit-this-file': {
		file: 'plugins/prompts-pack/src/index.ts',
	},
	'optimize-this': {
		file: 'plugins/prompts-pack/src/index.ts',
	},
};

const fakeServer = () => {
	const calls: Array<{
		name: string;
		def: { description?: string };
		handler: (args?: unknown) => Promise<{
			messages: Array<{ content: { type: string; text: string } }>;
		}>;
	}> = [];
	const server = {
		registerPrompt: (
			name: string,
			def: { description?: string },
			handler: unknown,
		) => {
			calls.push({
				name,
				def,
				handler: handler as (typeof calls)[number]['handler'],
			});
		},
	};
	return { server, calls };
};

const collectGeneratedToolOutputFiles = async (
	root: string,
	relDir: string,
): Promise<string[]> => {
	const out: string[] = [];
	const absDir = resolve(root, relDir);
	const stack = [absDir];
	while (stack.length > 0) {
		const next = stack.pop();
		if (next === undefined) break;
		let entries: Dirent<string>[] = [];
		try {
			entries = await readdir(next, {
				encoding: 'utf8',
				withFileTypes: true,
			});
		} catch {
			continue;
		}
		for (const entry of entries) {
			const absPath = join(next, entry.name);
			if (entry.isDirectory()) {
				stack.push(absPath);
				continue;
			}
			if (entry.name !== 'tool-outputs.ts') continue;
			out.push(absPath);
		}
	}
	return out.sort();
};

const loadCatalogToolIds = async (): Promise<Set<string>> => {
	const reader = new SafeWorkspaceReader(workspaceRoot);
	const files = [
		...(await collectGeneratedToolOutputFiles(workspaceRoot, 'packages')),
		...(await collectGeneratedToolOutputFiles(workspaceRoot, 'plugins')),
	];
	const ids = new Set<string>();
	for (const absPath of files) {
		const relativePath = absPath.slice(workspaceRoot.length + 1);
		const source = (await reader.readText(relativePath)).content;
		for (const match of source.match(/"mcp-vertex_[^"]+"/g) ?? []) {
			ids.add(match.slice(1, -1));
		}
	}
	return ids;
};

describe('prompts-pack prompt registrations', () => {
	it('defines six prompts with metadata and renderers', () => {
		const built = prompts();
		expect(built).toHaveLength(6);
		for (const prompt of built) {
			expect(prompt.id).toBe(prompt.name);
			expect(prompt.description.length).toBeGreaterThan(20);
			expect(typeof prompt.template).toBe('function');
			expect(prompt.arguments.length).toBeGreaterThan(0);
			for (const arg of prompt.arguments) {
				expect(arg.name.length).toBeGreaterThan(0);
				expect(arg.description.length).toBeGreaterThan(0);
				expect(typeof arg.required).toBe('boolean');
			}
		}
	});

	it('references only shipped tool ids from the generated catalog', async () => {
		const catalog = await loadCatalogToolIds();
		for (const prompt of prompts()) {
			const text = prompt.template(sampleArgs[prompt.name] ?? {});
			const ids = text.match(toolIdPattern) ?? [];
			expect(ids.length).toBeGreaterThan(0);
			for (const id of ids) {
				expect(catalog.has(id)).toBe(true);
			}
		}
	});

	it('never mentions provider names in metadata or rendered text', () => {
		for (const prompt of prompts()) {
			const rendered = prompt.template(sampleArgs[prompt.name] ?? {});
			expect(prompt.name).not.toMatch(providerPattern);
			expect(prompt.description).not.toMatch(providerPattern);
			expect(rendered).not.toMatch(providerPattern);
			for (const arg of prompt.arguments) {
				expect(arg.description).not.toMatch(providerPattern);
			}
		}
	});

	it('registers MCP prompts and renders with sample arguments', async () => {
		for (const prompt of prompts()) {
			const { server, calls } = fakeServer();
			await prompt.register(server as never);
			expect(calls).toHaveLength(1);
			expect(calls[0]?.name).toBe(`prompts-pack_${prompt.name}`);
			expect(calls[0]?.def.description).toBe(prompt.description);
			const result = await calls[0]?.handler(
				sampleArgs[prompt.name] ?? {},
			);
			expect(result?.messages[0]?.content.type).toBe('text');
			expect(
				result?.messages[0]?.content.text.length ?? 0,
			).toBeGreaterThan(40);
		}
	});
});
