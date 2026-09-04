/**
 * validate-config.spec.ts — the config contract + the `validate_config`
 * dry-run tool (f00068 S1): mandatory version pin, kebab ids, env
 * NAMES-only enforcement, and the resolved autonomy-knob defaults.
 */
import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import { OptionsSchema } from '../../../src/lib/options-schema';
import {
	buildValidateConfigToolRegistration,
	ValidateConfigOutputSchema,
	validateServersPatch,
} from '../../../src/lib/tools/validate-config.tool';

const entry = (
	over: Record<string, unknown> = {},
): Record<string, unknown> => ({
	version: '1.4.2',
	command: 'npx',
	args: ['-y', '@modelcontextprotocol/server-filesystem@1.4.2'],
	...over,
});

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

describe('validateServersPatch (pure dry-run)', () => {
	it('accepts a fully-pinned, kebab-keyed patch with env NAMES', () => {
		const result = validateServersPatch({
			filesystem: entry({
				namespacePrefix: 'ext.fs',
				detect: 'package.json',
			}),
			'my-github': entry({
				command: 'docker',
				args: [
					'run',
					'-i',
					'--rm',
					'ghcr.io/github/github-mcp-server:v0.9.1',
				],
				env: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
			}),
		});
		expect(result).toEqual({ ok: true, issues: [] });
	});

	it('rejects the floating "latest" tag with the missing-version-pin code', () => {
		const result = validateServersPatch({
			filesystem: entry({ version: 'latest' }),
		});
		expect(result.ok).toBe(false);
		expect(
			result.issues.some(
				(issue) =>
					issue.includes('missing-version-pin') &&
					issue.includes('servers.filesystem.version'),
			),
		).toBe(true);
	});

	it('rejects semver RANGES — only exact pins pass', () => {
		const result = validateServersPatch({
			filesystem: entry({ version: '^1.2.3' }),
		});
		expect(result.ok).toBe(false);
		expect(result.issues.join(' ')).toContain('invalid-version');
	});

	it('rejects an entry with no version at all', () => {
		const bare = entry();
		delete bare.version;
		const result = validateServersPatch({ filesystem: bare });
		expect(result.ok).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.includes('servers.filesystem.version'),
			),
		).toBe(true);
	});

	it('rejects non-kebab server ids', () => {
		const result = validateServersPatch({ My_Server: entry() });
		expect(result.ok).toBe(false);
		expect(result.issues.join(' ')).toContain('invalid-server-id');
	});

	it('rejects env entries carrying a VALUE assignment', () => {
		const result = validateServersPatch({
			filesystem: entry({ env: ['API_KEY=not-a-real-value'] }),
		});
		expect(result.ok).toBe(false);
		expect(result.issues.join(' ')).toContain('env-value-not-allowed');
	});

	it('rejects a cleartext-looking 20+ char mixed-case token as an env entry', () => {
		const result = validateServersPatch({
			filesystem: entry({ env: ['FakeFakeFakeFakeFake1'] }),
		});
		expect(result.ok).toBe(false);
		expect(result.issues.join(' ')).toContain('cleartext-secret-suspected');
	});

	it('accepts long UPPER_SNAKE env NAMES (names are not secrets)', () => {
		const result = validateServersPatch({
			filesystem: entry({ env: ['GITHUB_PERSONAL_ACCESS_TOKEN'] }),
		});
		expect(result).toEqual({ ok: true, issues: [] });
	});

	it('rejects unknown fields on an entry (strict schema)', () => {
		const result = validateServersPatch({
			filesystem: entry({ eagerly: true }),
		});
		expect(result.ok).toBe(false);
		expect(result.issues.length).toBeGreaterThan(0);
	});

	it('reports every issue at once so the LLM can fix the patch in one turn', () => {
		const result = validateServersPatch({
			My_Server: entry(),
			filesystem: entry({ version: 'latest' }),
		});
		expect(result.ok).toBe(false);
		expect(result.issues.length).toBeGreaterThanOrEqual(2);
	});
});

describe('validate_config tool (never writes)', () => {
	const registration = buildValidateConfigToolRegistration({
		namespacePrefix: 'external-mcps',
	});

	it('registers under the plugin namespace with schemas and NO effects', async () => {
		const tool = await captureTool(registration);
		expect(tool.name).toBe('external-mcps_validate_config');
		expect(tool.config.inputSchema).toBeDefined();
		expect(tool.config.outputSchema).toBeDefined();
		// Read-only default: a dry-run must not declare write/spawn/network.
		expect(registration.effects).toBeUndefined();
	});

	it('returns {ok:true, issues:[]} for a valid patch', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({
			servers: { filesystem: entry() },
		});
		const payload = ValidateConfigOutputSchema.parse(
			result.structuredContent,
		);
		expect(payload).toEqual({ ok: true, issues: [] });
		expect(result.isError).toBeUndefined();
	});

	it('returns issues (not a protocol error) for an invalid patch', async () => {
		const tool = await captureTool(registration);
		const result = await tool.handler({
			servers: { filesystem: entry({ version: 'latest' }) },
		});
		const payload = ValidateConfigOutputSchema.parse(
			result.structuredContent,
		);
		expect(payload.ok).toBe(false);
		expect(payload.issues.join(' ')).toContain('missing-version-pin');
		expect(result.isError).toBeUndefined();
	});
});

describe('OptionsSchema (resolved autonomy-knob defaults)', () => {
	it('pins the resolved defaults: true / true / FALSE (kill switch off)', () => {
		const options = OptionsSchema.parse({});
		expect(options.llmDecidesActivation).toBe(true);
		expect(options.requireHumanAckWhenLlmDecides).toBe(true);
		expect(options.allowDiscoverySearch).toBe(false);
		expect(options.servers).toBeUndefined();
	});

	it('shares the servers contract: an unpinned roster is rejected', () => {
		const parsed = OptionsSchema.safeParse({
			servers: { filesystem: entry({ version: 'latest' }) },
		});
		expect(parsed.success).toBe(false);
	});

	it('accepts a valid roster and knob overrides, rejects unknown knobs', () => {
		expect(
			OptionsSchema.safeParse({
				servers: { filesystem: entry() },
				allowDiscoverySearch: true,
			}).success,
		).toBe(true);
		expect(OptionsSchema.safeParse({ eagerBoot: true }).success).toBe(
			false,
		);
	});
});
