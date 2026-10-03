import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import { buildI18nCheckRegistration } from '../../../../src/lib/tools/i18n-check.tool';

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

describe('i18n_check tool', () => {
	it('registers a read-only tool with schemas', async () => {
		const registration = buildI18nCheckRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
			deps: {
				listLocales: async () => [],
				listSourceFiles: async () => [],
			},
		});
		const tool = await captureTool(registration);
		expect(tool.name).toBe('i18n_i18n_check');
		expect(tool.config.inputSchema).toBeDefined();
		expect(tool.config.outputSchema).toBeDefined();
		expect(registration.effects).toBeUndefined();
	});

	it('returns missing-key and unused-key findings from injected fixtures', async () => {
		const registration = buildI18nCheckRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
			deps: {
				listLocales: async () => [
					{
						locale: 'en',
						data: {
							used: 'Used',
							missingOnlyInEnglish: 'Source',
							stale: 'Old',
						},
					},
					{
						locale: 'es',
						data: { used: 'Usado', stale: 'Viejo' },
					},
				],
				listSourceFiles: async () => [
					{
						path: 'src/demo.ts',
						content: "t('used'); t('missingOnlyInEnglish')",
					},
				],
			},
		});
		const tool = await captureTool(registration);
		const result = await tool.handler({});
		const payload = result.structuredContent as {
			findings: Array<{ ruleId: string; message: string }>;
			locales: string[];
			worst: string;
		};
		expect(payload.locales).toEqual(['en', 'es']);
		expect(
			payload.findings.some(
				(finding) =>
					finding.ruleId === 'missing-key' &&
					finding.message.includes('es') &&
					finding.message.includes('missingOnlyInEnglish'),
			),
		).toBe(true);
		expect(
			payload.findings.filter(
				(finding) => finding.ruleId === 'unused-key',
			),
		).toHaveLength(2);
		expect(payload.worst).toBe('medium');
		expect(result.isError).toBeUndefined();
	});

	// x00168 (S1): `localesDir` used to reach `joinUnderRoot` un-contained —
	// a caller could point it at any directory the host process can read.
	it('rejects a localesDir that escapes the workspace when no deps override is supplied', async () => {
		const registration = buildI18nCheckRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
		});
		const tool = await captureTool(registration);
		const result = await tool.handler({ localesDir: '../../../../etc' });
		expect(result.isError).toBe(true);
	});

	it('rejects an absolute localesDir when no deps override is supplied', async () => {
		const registration = buildI18nCheckRegistration({
			namespacePrefix: 'i18n',
			workspaceRootAbs: '/workspace',
		});
		const tool = await captureTool(registration);
		const result = await tool.handler({ localesDir: '/etc' });
		expect(result.isError).toBe(true);
	});
});
