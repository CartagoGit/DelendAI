import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import {
	buildI18nValidateRegistration,
	I18nValidateOutputSchema,
} from '../../../../src/lib/tools/i18n-validate.tool';
import plugin from '../../../../src/index';

interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

interface ICapturedTool {
	readonly name: string;
	readonly config: {
		description: string;
		inputSchema: unknown;
		outputSchema: unknown;
	};
	readonly handler: (args: Record<string, unknown>) => Promise<IToolResult>;
}

const captureTool = async (reg: IToolRegistration): Promise<ICapturedTool> => {
	const captured: ICapturedTool[] = [];
	const server = {
		registerTool: (
			name: string,
			config: ICapturedTool['config'],
			handler: ICapturedTool['handler'],
		) => {
			captured.push({ name, config, handler });
		},
	} as unknown as Parameters<IToolRegistration['register']>[0];
	await reg.register(server);
	const tool = captured[0];
	if (tool === undefined) throw new Error('tool did not register');
	return tool;
};

describe('i18n_validate tool', () => {
	it('registers with schemas and no side effects', async () => {
		const registration = buildI18nValidateRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
			deps: { listLocales: async () => [] },
		});
		const tool = await captureTool(registration);
		expect(tool.name).toBe('i18n_i18n_validate');
		expect(tool.config.inputSchema).toBeDefined();
		expect(tool.config.outputSchema).toBeDefined();
		expect(registration.effects).toBeUndefined();
	});

	it('returns ICU validation findings through the MCP envelope', async () => {
		const registration = buildI18nValidateRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
			deps: {
				listLocales: async () => [
					{
						locale: 'en',
						data: {
							items: '{count, plural, one {# item} other {# items}}',
						},
					},
					{
						locale: 'es',
						data: {
							items: '{total, plural, one {# articulo} other {# articulos}}',
							extra: 'Solo en es',
						},
					},
				],
			},
		});
		const tool = await captureTool(registration);
		const result = await tool.handler({});
		const payload = I18nValidateOutputSchema.parse(
			result.structuredContent,
		);
		expect(payload.sourceLocale).toBe('en');
		expect(
			payload.findings.some(
				(finding) => finding.ruleId === 'placeholder-mismatch',
			),
		).toBe(true);
		expect(
			payload.findings.some(
				(finding) => finding.ruleId === 'extra-locale',
			),
		).toBe(true);
		expect(result.isError).toBeUndefined();
	});

	// x00168 (S1): `localesDir` used to reach `joinUnderRoot` un-contained —
	// a caller could point it at any directory the host process can read.
	it('rejects a localesDir that escapes the workspace when no deps override is supplied', async () => {
		const registration = buildI18nValidateRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
		});
		const tool = await captureTool(registration);
		const result = await tool.handler({ localesDir: '../../../../etc' });
		expect(result.isError).toBe(true);
	});

	it('rejects an absolute localesDir when no deps override is supplied', async () => {
		const registration = buildI18nValidateRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
		});
		const tool = await captureTool(registration);
		const result = await tool.handler({ localesDir: '/etc' });
		expect(result.isError).toBe(true);
	});

	it('the plugin registers the validate tool alongside i18n_check', async () => {
		const ctx = {
			options: {},
			args: {},
			namespacePrefix: 'i18n',
			pluginCacheDir: 'i18n',
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			workspace: {
				root: '/workspace',
				resolve: (rel: string) => rel,
			},
		} as unknown as Parameters<typeof plugin.register>[0];
		const registered = await plugin.register(ctx);
		expect((registered.tools ?? []).map((tool) => tool.id)).toContain(
			'i18n_validate',
		);
	});
});
