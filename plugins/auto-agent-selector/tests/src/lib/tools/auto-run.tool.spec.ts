import { describe, expect, it } from 'vitest';

import { buildAutoRunRegistration } from '../../../../src/lib/tools/auto-run.tool';
import type { IRunEscalationDeps } from '../../../../src/lib/contracts/interfaces/escalation.interface';
import type { IDiscoveryDeps } from '../../../../src/lib/contracts/interfaces/roster.interface';
import type { IRosterSnapshotStore } from '../../../../src/lib/discovery/roster-store';

interface IRegisteredTool {
	readonly def: {
		readonly inputSchema: {
			safeParse: (value: unknown) => { success: boolean };
		};
	};
	readonly handler: (args: {
		costCeiling?: number;
		maxDepth?: number;
		costQualityTradeoff?: number;
		pin?: string;
		task?: string;
		execute?: boolean;
		consent?: boolean;
		install?: boolean;
		installProviderId?: string;
	}) => Promise<{ structuredContent?: Record<string, unknown> }>;
}

const capture = async (
	deps: IDiscoveryDeps,
	rosterStore?: IRosterSnapshotStore,
	installRunner?: (argv: readonly [string, ...string[]]) => Promise<{
		code: number;
		stdout: string;
		stderr: string;
		timedOut: boolean;
	}>,
	runProvider?: IRunEscalationDeps['runProvider'],
	checkAcceptance?: IRunEscalationDeps['checkAcceptance'],
): Promise<IRegisteredTool> => {
	let tool: IRegisteredTool | undefined;
	const server = {
		registerTool(
			name: string,
			def: IRegisteredTool['def'],
			handler: IRegisteredTool['handler'],
		): void {
			if (name.endsWith('_auto_run')) tool = { def, handler };
		},
	};
	const reg = buildAutoRunRegistration({
		namespacePrefix: 'mcp',
		defaultTradeoff: 10, // cheap-leaning so the ladder climbs up
		deps,
		...(rosterStore !== undefined ? { rosterStore } : {}),
		...(installRunner !== undefined ? { installRunner } : {}),
		...(runProvider !== undefined ? { runProvider } : {}),
		...(checkAcceptance !== undefined ? { checkAcceptance } : {}),
	});
	await reg.register(server as unknown as Parameters<typeof reg.register>[0]);
	if (!tool) throw new Error('auto_run did not register');
	return tool;
};

// groq (tier 1) + claude CLI (tier 4).
const deps: IDiscoveryDeps = {
	commandExists: async (c) => c === 'claude',
	env: { GROQ_API_KEY: 'g' },
};

describe('auto_run tool', () => {
	it('returns an escalation ladder starting cheap and climbing, with execution left null by default', async () => {
		const tool = await capture(deps);
		const res = await tool.handler({});
		const body = res.structuredContent as {
			ladder: { step: number; id: string; costTier: number }[];
			howToExecute: string;
			costCeiling: number;
			execution: unknown;
		};
		expect(body.ladder.map((r) => r.id)).toEqual([
			'groq-api',
			'claude-cli',
		]);
		expect(body.ladder[0]?.step).toBe(1);
		expect(body.howToExecute).toContain('acceptance gate');
		expect(body.execution).toBeNull();
	});

	it('honours a cost ceiling — never plans a rung above it', async () => {
		const tool = await capture(deps);
		const res = await tool.handler({ costCeiling: 2 });
		const body = res.structuredContent as {
			ladder: { id: string; costTier: number }[];
		};
		expect(body.ladder.map((r) => r.id)).toEqual(['groq-api']);
		expect(body.ladder.every((r) => r.costTier <= 2)).toBe(true);
	});

	it('persists discovery before planning a route', async () => {
		let saves = 0;
		const tool = await capture(deps, {
			save: async () => {
				saves += 1;
			},
		});
		await tool.handler({});
		expect(saves).toBe(1);
	});

	it('returns a trusted install hint when no provider is reachable', async () => {
		const tool = await capture({
			commandExists: async () => false,
			env: {},
		});
		const body = (await tool.handler({})).structuredContent as {
			nextInstall: { id: string; hint: string } | null;
		};
		expect(body.nextInstall).toEqual(
			expect.objectContaining({
				id: 'claude-cli',
				hint: 'npm install -g @anthropic-ai/claude-code',
			}),
		);
	});

	it('runs only the catalogue argv after explicit install consent', async () => {
		const received: Array<readonly [string, ...string[]]> = [];
		const tool = await capture(
			{ commandExists: async () => false, env: {} },
			undefined,
			async (argv) => {
				received.push(argv);
				return { code: 0, stdout: '', stderr: '', timedOut: false };
			},
		);
		const body = (
			await tool.handler({
				install: true,
				installProviderId: 'codex-cli',
			})
		).structuredContent as {
			installation: {
				attempted: boolean;
				ok: boolean;
				providerId: string;
			} | null;
		};
		expect(received).toEqual([['npm', 'install', '-g', '@openai/codex']]);
		expect(body.installation).toEqual(
			expect.objectContaining({
				attempted: true,
				ok: true,
				providerId: 'codex-cli',
			}),
		);
	});

	it('executes the first rung and stops when it passes acceptance', async () => {
		const calls: string[] = [];
		const tool = await capture(
			deps,
			undefined,
			undefined,
			async (candidate) => {
				calls.push(candidate.id);
				return { providerId: candidate.id };
			},
			async (_output, candidate) => candidate.id === 'groq-api',
		);
		const body = (
			await tool.handler({
				task: 'review this diff',
				execute: true,
				consent: true,
			})
		).structuredContent as {
			execution: {
				ok: boolean;
				chosen: { id: string; label: string } | null;
				attempts: { id: string; passed: boolean }[];
			};
		};
		expect(calls).toEqual(['groq-api']);
		expect(body.execution.ok).toBe(true);
		expect(body.execution.chosen?.id).toBe('groq-api');
		expect(body.execution.attempts).toEqual([
			{ id: 'groq-api', passed: true },
		]);
	});

	it('escalates to the second rung when the first fails acceptance', async () => {
		const calls: string[] = [];
		const tool = await capture(
			deps,
			undefined,
			undefined,
			async (candidate) => {
				calls.push(candidate.id);
				return { providerId: candidate.id };
			},
			async (_output, candidate) => candidate.id === 'claude-cli',
		);
		const body = (
			await tool.handler({
				task: 'fix the failing test',
				execute: true,
				consent: true,
			})
		).structuredContent as {
			execution: {
				ok: boolean;
				chosen: { id: string; label: string } | null;
				attempts: { id: string; passed: boolean }[];
			};
		};
		expect(calls).toEqual(['groq-api', 'claude-cli']);
		expect(body.execution.ok).toBe(true);
		expect(body.execution.chosen?.id).toBe('claude-cli');
		expect(body.execution.attempts).toEqual([
			{ id: 'groq-api', passed: false },
			{ id: 'claude-cli', passed: true },
		]);
	});

	it('reports an unsuccessful execution when every rung fails', async () => {
		const tool = await capture(
			deps,
			undefined,
			undefined,
			async (candidate) => ({ providerId: candidate.id }),
			async () => false,
		);
		const body = (
			await tool.handler({
				task: 'ship this feature',
				execute: true,
				consent: true,
			})
		).structuredContent as {
			execution: {
				ok: boolean;
				chosen: { id: string; label: string } | null;
				attempts: { id: string; passed: boolean }[];
			};
		};
		expect(body.execution.ok).toBe(false);
		expect(body.execution.chosen).toBeNull();
		expect(body.execution.attempts).toEqual([
			{ id: 'groq-api', passed: false },
			{ id: 'claude-cli', passed: false },
		]);
	});

	it('requires explicit consent before execute mode is valid', async () => {
		const tool = await capture(deps);
		expect(
			tool.def.inputSchema.safeParse({
				task: 'review',
				execute: true,
			}).success,
		).toBe(false);
		expect(
			tool.def.inputSchema.safeParse({
				task: 'review',
				execute: true,
				consent: true,
			}).success,
		).toBe(true);
	});
});
