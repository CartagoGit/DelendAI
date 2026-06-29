import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	InitAnswers,
	type IInitAnswers,
} from '../../../src/commands/init/init-answers.schema';
import {
	renderInitBundle,
	resolvePluginSet,
} from '../../../src/commands/init/init-render';
import {
	writeMcpVertexConfig,
	writeWorkspaceText,
} from '../../../src/commands/init/init-writers';

const parseAnswers = (
	workspaceRoot: string,
	partial: Partial<IInitAnswers> = {},
): IInitAnswers => InitAnswers.parse({ workspaceRoot, ...partial });

describe('init integration (f00084 S10)', () => {
	let workspace: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'mcpv-init-integration-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('renders, writes, re-renders idempotently, and persists plugin defaults end-to-end', async () => {
		const answers = parseAnswers(workspace, {
			preset: 'full',
			extraPlugins: ['audit'],
		});
		const resolvedPlugins = resolvePluginSet(answers);
		const first = await renderInitBundle(answers);

		for (const file of first.files) {
			if (file.relPath === 'mcp-vertex.config.json') {
				const parsed = JSON.parse(file.content) as Record<string, unknown>;
				const result = await writeMcpVertexConfig(workspace, parsed, false);
				expect(result.kind).toBe('written');
				continue;
			}

			const result = await writeWorkspaceText(
				workspace,
				file.relPath,
				file.content,
				answers.hostInstructions,
			);
			expect(result.kind).toBe('written');
		}

		const configOnDisk = await readFile(
			join(workspace, 'mcp-vertex.config.json'),
			'utf8',
		);
		const parsedConfig = JSON.parse(configOnDisk) as {
			plugins: Record<string, { options: Record<string, unknown> }>;
		};

		for (const pluginId of resolvedPlugins) {
			expect(parsedConfig.plugins[pluginId]).toBeDefined();
			expect(parsedConfig.plugins[pluginId]?.options).toBeDefined();
			expect(typeof parsedConfig.plugins[pluginId]?.options).toBe('object');
		}

		if ('audit' in parsedConfig.plugins) {
			const audit = parsedConfig.plugins.audit?.options;
			expect(audit.auditDir).toBeDefined();
			expect(audit.topActions).toBeDefined();
		}

		if ('memory' in parsedConfig.plugins) {
			const memory = parsedConfig.plugins.memory?.options;
			expect(memory.bm25K1).toBeDefined();
			expect(memory.bm25B).toBeDefined();
		}

		if ('web-fetch' in parsedConfig.plugins) {
			const webFetch = parsedConfig.plugins['web-fetch']?.options;
			expect(webFetch.allowList).toBeDefined();
			expect(Array.isArray(webFetch.allowList)).toBe(true);
		}

		const second = await renderInitBundle(answers);
		const firstByPath = new Map(first.files.map((file) => [file.relPath, file.content]));
		const secondByPath = new Map(second.files.map((file) => [file.relPath, file.content]));

		expect(secondByPath).toEqual(firstByPath);
	});
});