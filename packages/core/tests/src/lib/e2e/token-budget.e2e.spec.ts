import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { nodeDynamicImport } from '@delendai/core/lib/plugins/load-plugins';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { SKILL_MANIFEST_REL } from '@delendai/core/lib/skills/skill-paths';
import {
	TOKEN_BUDGETS,
	type IMcpToolSurfaceMode,
} from '@delendai/core/public';

/**
 * Token budget benchmark [N23]. Invariant: cold-start protocol payloads stay
 * under explicit byte ceilings, and `overview { compact:true }` stays
 * materially cheaper than the full surface.
 *
 * Why this matters: "low-token" is a measurable product promise, so this spec
 * guards the real wire payloads instead of prose.
 *
 * Risk rule: if a change regresses the measured bytes, tighten the budgets or
 * the surface deliberately. Rough estimate only: ~4 bytes/token. See N23 and
 * docs/mcp-vertex/TOKEN-BUDGETS.md.
 */
const budgetWarning = (label: string, value: number, warning: number): void => {
	if (value > warning) {
		console.warn(
			`[token-budget warning] ${label}: ${value}B exceeds warning ceiling ${warning}B`,
		);
	}
};

const expectWithinBudget = (
	label: string,
	value: number,
	budget: { hard: number; warning: number },
): void => {
	budgetWarning(label, value, budget.warning);
	expect(value, `${label} = ${value}B`).toBeLessThanOrEqual(budget.hard);
};

const jsonBytes = (value: unknown): number =>
	Buffer.byteLength(JSON.stringify(value), 'utf8');

const dynamicSurfaceCapabilities: ClientCapabilities = {
	extensions: {
		'mcp-vertex/surface': {
			toolsListChanged: true,
		},
	},
};

const modernClientInfo: Implementation = {
	name: 'vscode-copilot',
	version: '1.0.0',
};

const classifyToolOwner = (
	toolName: string,
	pluginIds: readonly string[],
): string => {
	const qualifiedPrefix = 'mcp-vertex_';
	const unqualified = toolName.startsWith(qualifiedPrefix)
		? toolName.slice(qualifiedPrefix.length)
		: toolName;
	for (const pluginId of [...pluginIds].sort(
		(left, right) => right.length - left.length,
	)) {
		if (unqualified.startsWith(`${pluginId}_`)) {
			return pluginId;
		}
	}
	return 'core';
};

const marginalPluginBytes = (
	tools: readonly {
		readonly name: string;
		readonly description?: string | undefined;
		readonly inputSchema?: unknown | undefined;
		readonly outputSchema?: unknown | undefined;
	}[],
	pluginIds: readonly string[],
): number => {
	const totals = new Map<string, number>();
	for (const tool of tools) {
		const owner = classifyToolOwner(tool.name, pluginIds);
		if (owner === 'core') {
			continue;
		}
		totals.set(owner, (totals.get(owner) ?? 0) + jsonBytes(tool));
	}
	return Math.max(0, ...totals.values());
};

describe('e2e: token budget (cold-start payloads)', async () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	const connectClient = async (
		pluginList: string,
		preset = false,
		input?: {
			readonly clientInfo?: Implementation;
			readonly capabilities?: ClientCapabilities;
			// x00296 S1 (AUD-B06) regression guard: lets a test pin an
			// explicit surface the same way `connectTokenBudgetClient`
			// (the dashboard's fixture measurement) does, so the test below
			// can prove an explicit `surfaceMode` always wins regardless of
			// what `decideSurfaceModeFromCapabilities` would infer from
			// `capabilities`/`clientInfo` — the exact invariant whose
			// absence let AUD-B06 slip through when AUD-C01 was fixed.
			readonly surfaceMode?: IMcpToolSurfaceMode;
		},
	): Promise<{
		client: Client;
		close: () => Promise<void>;
		pluginIds: readonly string[];
	}> => {
		const args = parseCliArgs(
			[
				`--${preset ? 'preset' : 'plugins'}=${pluginList}`,
				`--workspace=${workspace}`,
				// r00026 (TOK-004) made `adaptive` the default surface for a
				// plain client with no capability negotiation. This suite
				// measures raw cold-start payload sizes for the FULL/native
				// surface (the historical budget baseline every threshold
				// here was calibrated against) UNLESS the caller passes
				// `capabilities` explicitly to exercise real adaptive
				// negotiation (a couple of tests below do exactly that) —
				// an explicit `--surface` flag would override capability
				// detection entirely, so only pin it when there is no
				// capability-driven case to preserve.
				...(input?.surfaceMode !== undefined
					? [`--surface=${input.surfaceMode}`]
					: input?.capabilities === undefined
						? ['--surface=native']
						: []),
			],
			workspace,
		);
		const assembledConfig = await assembleCliConfig(args, {
			import: async (specifier: string) =>
				(await nodeDynamicImport(specifier)) as { default: unknown },
			readFile: async () => undefined,
		});
		const assembled = await createMcpProject(assembledConfig.config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		const connectedClient = new Client(
			input?.clientInfo ?? { name: 'tok', version: '0' },
			{ capabilities: input?.capabilities ?? {} },
		);
		await connectedClient.connect(clientTransport);
		return {
			client: connectedClient,
			pluginIds: args.plugins,
			close: async () => {
				await connectedClient.close();
				await assembled.server.close();
			},
		};
	};

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'tok-'));
		mkdirSync(join(workspace, 'docs'), { recursive: true });
		mkdirSync(join(workspace, 'src'), { recursive: true });
		writeFileSync(
			join(workspace, 'docs', 'README.md'),
			[
				'# Proposal workflow',
				'',
				'Use proposal slices and compact docs.',
			].join('\n'),
		);
		writeFileSync(
			join(workspace, 'src', 'app.ts'),
			['export const proposal = "compact search baseline";'].join('\n'),
		);
		mkdirSync(join(workspace, 'docs', 'proposals'), { recursive: true });
		const skillManifestAbs = join(
			workspace,
			...SKILL_MANIFEST_REL.split('/'),
		);
		mkdirSync(dirname(skillManifestAbs), { recursive: true });
		writeFileSync(
			skillManifestAbs,
			JSON.stringify({
				generatedAt: '2026-06-25T00:00:00.000Z',
				skills: [
					{
						id: 'mcp-vertex-token-budget-playbook',
						version: '1.0.0',
						minCoreVersion: '0.1.0',
						bodyPath:
							'packages/core/skills/mcp-vertex-token-budget-playbook/SKILL.md',
						tags: ['metrics', 'compact'],
					},
				],
			}),
		);
		writeFileSync(
			join(workspace, 'docs', 'proposals', 'index.json'),
			JSON.stringify({
				generated_at: '2026-06-25T00:00:00.000Z',
				count: 3,
				proposals: [
					{
						id: 'f00056',
						title: 'Agent discovery catalog',
						track: 'host+extension+skills+docs',
						status: 'ready',
						date: '2026-06-25',
					},
					{
						id: 'c00002',
						title: 'Pause npm publish',
						track: 'docs+release',
						status: 'paused',
						date: '2026-06-21',
					},
					{
						id: 'a00001',
						title: 'Repository audit',
						track: 'archive',
						status: 'done',
						date: '2026-06-15',
					},
				],
			}),
		);
		({ client, close } = await connectClient(
			TOKEN_BUDGETS.fixturePluginIds.join(','),
		));
	});

	afterEach(async () => {
		await close();
		rmSync(workspace, { recursive: true, force: true });
	});

	const textBytes = async (
		name: string,
		args: Record<string, unknown>,
	): Promise<number> => {
		const res = await client.callTool({ name, arguments: args });
		if (res.structuredContent !== undefined) {
			return Buffer.byteLength(
				JSON.stringify(res.structuredContent),
				'utf8',
			);
		}
		const text = (res.content as Array<{ type: string; text: string }>)[0]
			?.text;
		return Buffer.byteLength(text ?? '', 'utf8');
	};

	/**
	 * x00296 S2 (AUD-B06): `overview` is also directly callable under the
	 * `native` surface (the default `client` above is pinned to
	 * `--surface=native`), which lists the full tool catalog — a
	 * materially larger, independently-governed payload than the
	 * `managed` bootstrap listing `overviewFull`/`overviewCompact` cover.
	 * `overviewFullNative`/`overviewCompactNative` are a NEW ceiling pair
	 * (`token-budgets.constant.ts`), not a redefinition of the existing
	 * `managed` ones.
	 */
	it('native overview listing stays under its own dedicated budget', async () => {
		const full = await textBytes('mcp-vertex_overview', {});
		const compact = await textBytes('mcp-vertex_overview', {
			compact: true,
		});
		expectWithinBudget(
			'overview full (native)',
			full,
			TOKEN_BUDGETS.toolPayloads.overviewFullNative,
		);
		expectWithinBudget(
			'overview compact (native)',
			compact,
			TOKEN_BUDGETS.toolPayloads.overviewCompactNative,
		);
		expect(compact).toBeLessThan(full);
	});

	it('cold-start overview stays under budget; compact is much cheaper', async () => {
		const adaptive = await connectClient(
			TOKEN_BUDGETS.fixturePluginIds.join(','),
			false,
			{
				clientInfo: modernClientInfo,
				capabilities: dynamicSurfaceCapabilities,
			},
		);
		try {
			const adaptiveTextBytes = async (
				name: string,
				args: Record<string, unknown>,
			): Promise<number> => {
				const res = await adaptive.client.callTool({
					name,
					arguments: args,
				});
				if (res.structuredContent !== undefined) {
					return Buffer.byteLength(
						JSON.stringify(res.structuredContent),
						'utf8',
					);
				}
				const text = (
					res.content as Array<{ type: string; text: string }>
				)[0]?.text;
				return Buffer.byteLength(text ?? '', 'utf8');
			};
			const full = await adaptiveTextBytes('mcp-vertex_overview', {});
			const compact = await adaptiveTextBytes('mcp-vertex_overview', {
				compact: true,
			});

			// Documented baseline (printed for visibility on failures):
			expectWithinBudget(
				'overview full',
				full,
				TOKEN_BUDGETS.toolPayloads.overviewFull,
			);
			expectWithinBudget(
				'overview compact',
				compact,
				TOKEN_BUDGETS.toolPayloads.overviewCompact,
			);
			// Compact must be a real saving, not cosmetic.
			expect(compact).toBeLessThan(
				full * TOKEN_BUDGETS.invariants.compactVsFullMaxRatio,
			);
		} finally {
			await adaptive.close();
		}
	});

	it('swarm preset keeps its real static and resume surfaces bounded', async () => {
		const swarmOverviewCompactBudget =
			TOKEN_BUDGETS.presets.swarm.overviewCompact;
		const swarmRoundContextBudget =
			TOKEN_BUDGETS.presets.swarm.roundContext;
		expect(swarmOverviewCompactBudget).toBeDefined();
		expect(swarmRoundContextBudget).toBeDefined();
		const swarm = await connectClient('swarm', true, {
			clientInfo: modernClientInfo,
			capabilities: dynamicSurfaceCapabilities,
		});
		try {
			const toolList = await swarm.client.listTools();
			const toolsListBytes = Buffer.byteLength(
				JSON.stringify(toolList.tools),
				'utf8',
			);
			const maxPluginBytes = marginalPluginBytes(
				toolList.tools,
				swarm.pluginIds,
			);
			const textBytesForSwarm = async (
				name: string,
				args: Record<string, unknown>,
			): Promise<number> => {
				const response = await swarm.client.callTool({
					name,
					arguments: args,
				});
				const text = (
					response.content as Array<{ type: string; text: string }>
				)[0]?.text;
				return Buffer.byteLength(text ?? '', 'utf8');
			};
			const overviewCompact = await textBytesForSwarm(
				'mcp-vertex_overview',
				{ compact: true },
			);
			const roundContext = await textBytesForSwarm(
				'mcp-vertex_proposals_round_context',
				{},
			);

			expectWithinBudget(
				'swarm tools/list',
				toolsListBytes,
				TOKEN_BUDGETS.presets.swarm.toolsList,
			);
			expectWithinBudget(
				'swarm overview compact',
				overviewCompact,
				swarmOverviewCompactBudget!,
			);
			expectWithinBudget(
				'swarm round context',
				roundContext,
				swarmRoundContextBudget!,
			);
			expectWithinBudget('swarm marginal plugin bytes', maxPluginBytes, {
				hard: TOKEN_BUDGETS.presets.swarm.toolsList.marginalPluginHard,
				warning:
					TOKEN_BUDGETS.presets.swarm.toolsList.marginalPluginWarning,
			});
		} finally {
			await swarm.close();
		}
	});

	it('lean preset remains materially smaller than the collaboration surface', async () => {
		const lean = await connectClient('lean', true, {
			clientInfo: modernClientInfo,
			capabilities: dynamicSurfaceCapabilities,
		});
		try {
			const toolList = await lean.client.listTools();
			const toolsListBytes = Buffer.byteLength(
				JSON.stringify(toolList.tools),
				'utf8',
			);
			const maxPluginBytes = marginalPluginBytes(
				toolList.tools,
				lean.pluginIds,
			);
			expectWithinBudget(
				'lean tools/list',
				toolsListBytes,
				TOKEN_BUDGETS.presets.lean.toolsList,
			);
			expectWithinBudget('lean marginal plugin bytes', maxPluginBytes, {
				hard: TOKEN_BUDGETS.presets.lean.toolsList.marginalPluginHard,
				warning:
					TOKEN_BUDGETS.presets.lean.toolsList.marginalPluginWarning,
			});
			expect(toolsListBytes).toBeLessThan(
				TOKEN_BUDGETS.presets.swarm.toolsList.hard *
					TOKEN_BUDGETS.invariants.leanVsSwarmToolsListMaxRatio,
			);
		} finally {
			await lean.close();
		}
	});

	/**
	 * AUD-B02/x00283: the dashboard's "Marginal Status" column used to
	 * default an undeclared `marginalPluginHard` to `0` and report "over
	 * hard (0B)" for minimal/standard/full/vertex — a permanent false
	 * alarm no gate shared. `swarm` and `lean` already had real ceilings
	 * and their own dedicated assertions above; this closes the other
	 * four governed presets so all six are asserted, matching what
	 * `IGovernedToolsListBudget` now requires the contract to declare.
	 */
	it.each(['minimal', 'standard', 'full', 'vertex'] as const)(
		'%s preset keeps its marginal plugin ceiling honest',
		async (presetId) => {
			const connection = await connectClient(presetId, true, {
				clientInfo: modernClientInfo,
				capabilities: dynamicSurfaceCapabilities,
			});
			try {
				const toolList = await connection.client.listTools();
				const maxPluginBytes = marginalPluginBytes(
					toolList.tools,
					connection.pluginIds,
				);
				const budget = TOKEN_BUDGETS.presets[presetId].toolsList;
				expectWithinBudget(
					`${presetId} marginal plugin bytes`,
					maxPluginBytes,
					{
						hard: budget.marginalPluginHard,
						warning: budget.marginalPluginWarning,
					},
				);
			} finally {
				await connection.close();
			}
		},
	);

	it('agent catalog stays under budget; compact is materially cheaper than full', async () => {
		const catalogOnly = await connectClient('');
		const catalogTextBytes = async (
			name: string,
			args: Record<string, unknown>,
		): Promise<number> => {
			const res = await catalogOnly.client.callTool({
				name,
				arguments: args,
			});
			const text = (
				res.content as Array<{ type: string; text: string }>
			)[0]?.text;
			return Buffer.byteLength(text ?? '', 'utf8');
		};
		try {
			const compact = await catalogTextBytes('mcp-vertex_agent_catalog', {
				mode: 'compact',
			});
			const full = await catalogTextBytes('mcp-vertex_agent_catalog', {
				mode: 'full',
			});

			expectWithinBudget(
				'agent catalog compact',
				compact,
				TOKEN_BUDGETS.toolPayloads.agentCatalogCompact,
			);
			expectWithinBudget(
				'agent catalog full',
				full,
				TOKEN_BUDGETS.toolPayloads.agentCatalogFull,
			);
			expect(compact).toBeLessThan(full);
		} finally {
			await catalogOnly.close();
		}
	});

	it('auto_work returns a tight action plan, not prose', async () => {
		const proposalDir = join(
			workspace,
			'docs',
			'mcp-vertex',
			'proposals',
			'ready',
		);
		mkdirSync(proposalDir, { recursive: true });
		writeFileSync(
			join(proposalDir, 'p9000-token-budget.md'),
			`---
id: p9000
status: ready
type: proposal
track: tests
date: 2026-07-25
kind: perf
title: token budget fixture
---

# p9000 — token budget fixture

## Slices

- global_gate: type

### S1 — bounded payload
- **Files**: \`src/app.ts\`
- **Gate**: type
- **Status**: pending
`,
		);
		await client.callTool({
			name: 'mcp-vertex_proposals_sync_proposals',
			arguments: {},
		});
		const bytes = await textBytes('mcp-vertex_proposals_auto_work', {});
		expectWithinBudget(
			'auto_work claim-ready plan',
			bytes,
			TOKEN_BUDGETS.toolPayloads.autoWork,
		);
	});

	it('bootstrap discovery and planning are bounded BY DEFAULT (x00101)', async () => {
		// Bare calls — the compact summary is the default since x00101;
		// the exhaustive payload (205 963 B measured against this repo)
		// requires full:true.
		const analyze = await textBytes('mcp-vertex_analyze_project', {});
		const plan = await textBytes('mcp-vertex_plan_mcp_project', {});
		expectWithinBudget(
			'analyze compact',
			analyze,
			TOKEN_BUDGETS.toolPayloads.analyzeCompact,
		);
		expectWithinBudget(
			'plan compact',
			plan,
			TOKEN_BUDGETS.toolPayloads.planCompact,
		);
	});

	it('read-only long-session surfaces stay on bounded compact paths', async () => {
		const extra = await connectClient('proposals,memory,search,docs,logs');
		const extraTextBytes = async (
			name: string,
			args: Record<string, unknown>,
		): Promise<number> => {
			const res = await extra.client.callTool({ name, arguments: args });
			const text = (
				res.content as Array<{ type: string; text: string }>
			)[0]?.text;
			return Buffer.byteLength(text ?? '', 'utf8');
		};
		try {
			// Prime a few events so mcp-vertex_logs_tail has real output.
			await extra.client.callTool({
				name: 'mcp-vertex_search_search',
				arguments: { query: 'proposal', maxResults: 5, context: 0 },
			});
			await extra.client.callTool({
				name: 'mcp-vertex_docs_docs_list',
				arguments: { limit: 10 },
			});

			const search = await extraTextBytes('mcp-vertex_search_search', {
				query: 'proposal',
				maxResults: 5,
				context: 0,
			});
			const docsList = await extraTextBytes('mcp-vertex_docs_docs_list', {
				limit: 10,
			});
			const roundContext = await extraTextBytes(
				'mcp-vertex_proposals_round_context',
				{},
			);
			const logsTail = await extraTextBytes('mcp-vertex_logs_tail', {
				limit: 10,
			});

			expectWithinBudget(
				'search',
				search,
				TOKEN_BUDGETS.toolPayloads.search,
			);
			expectWithinBudget(
				'docs_list',
				docsList,
				TOKEN_BUDGETS.toolPayloads.docsList,
			);
			expectWithinBudget(
				'round_context',
				roundContext,
				TOKEN_BUDGETS.toolPayloads.roundContext,
			);
			expectWithinBudget(
				'mcp-vertex_logs_tail',
				logsTail,
				TOKEN_BUDGETS.toolPayloads.logsTail,
			);
		} finally {
			await extra.close();
		}
	});

	/**
	 * x00296 S1 (AUD-B06) regression pin: fixing AUD-C01 (`x00285`) changed
	 * what `decideSurfaceModeFromCapabilities` infers for a client that
	 * declares no capabilities (managed -> native), and the dashboard's
	 * fixture measurement (`connectTokenBudgetClient` in
	 * `token-budget-report-lib.ts`) never declared an explicit
	 * `surfaceMode`, so it silently started measuring a different surface
	 * than the one its ceilings were calibrated for. The fix is that every
	 * fixture-gated connection now passes an explicit `surfaceMode`, which
	 * `resolveExplicitSurfaceMode` always honours ahead of any
	 * capability-based inference (see `decide-mode.ts`). This test proves
	 * that invariant directly: an explicit `surfaceMode` produces the same
	 * `overview` payload regardless of what capabilities/clientInfo would
	 * otherwise have inferred, so a FUTURE change to
	 * `decideSurfaceModeFromCapabilities`'s default cannot silently move a
	 * fixture-gated row onto a different surface ever again.
	 */
	it('an explicit surfaceMode overrides capability-based inference (AUD-B06 regression)', async () => {
		// No capabilities at all would infer `native` (AUD-C01's fixed
		// behaviour); pinning `managed` here must still win.
		const managedNoCapabilities = await connectClient(
			TOKEN_BUDGETS.fixturePluginIds.join(','),
			false,
			{ surfaceMode: 'managed' },
		);
		// Capabilities that declare `mcp-vertex/surface` listChanged support
		// would infer `managed`; pinning `native` here must still win.
		const nativeWithManagedCapabilities = await connectClient(
			TOKEN_BUDGETS.fixturePluginIds.join(','),
			false,
			{
				clientInfo: modernClientInfo,
				capabilities: dynamicSurfaceCapabilities,
				surfaceMode: 'native',
			},
		);
		try {
			const managedBytes = await (async () => {
				const res = await managedNoCapabilities.client.callTool({
					name: 'mcp-vertex_overview',
					arguments: {},
				});
				const text = (
					res.content as Array<{ type: string; text: string }>
				)[0]?.text;
				return Buffer.byteLength(text ?? '', 'utf8');
			})();
			const nativeBytes = await (async () => {
				const res = await nativeWithManagedCapabilities.client.callTool(
					{ name: 'mcp-vertex_overview', arguments: {} },
				);
				const text = (
					res.content as Array<{ type: string; text: string }>
				)[0]?.text;
				return Buffer.byteLength(text ?? '', 'utf8');
			})();

			// `managed` (bootstrap-only listing) must stay well within the
			// `overviewFull` ceiling regardless of the absent capabilities
			// that would otherwise infer `native`.
			expectWithinBudget(
				'overview full (managed, no capabilities)',
				managedBytes,
				TOKEN_BUDGETS.toolPayloads.overviewFull,
			);
			// `native` (full catalog listing) must stay materially larger
			// than the `managed` measurement above regardless of the
			// listChanged-capable client that would otherwise infer
			// `managed`, proving the two connections really measured two
			// different surfaces, not the same one twice.
			expect(nativeBytes).toBeGreaterThan(managedBytes);
		} finally {
			await Promise.all([
				managedNoCapabilities.close(),
				nativeWithManagedCapabilities.close(),
			]);
		}
	});
});
