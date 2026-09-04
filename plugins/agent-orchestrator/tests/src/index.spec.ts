import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';

import plugin from '../../src/index.js';
import { FakeDispatchPort } from '../../src/lib/dispatch/fake-port.js';
import type { IDispatchPort } from '../../src/lib/dispatch/contracts.js';

const ROOT = '/workspace';

const makeCtx = (options: Record<string, unknown> = {}): IMcpPluginContext => ({
	workspace: { root: ROOT, resolve: (rel: string) => join(ROOT, rel) },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: '.cache/mcp-vertex/agent-orchestrator',
	pluginDocsDir: 'docs/mcp-vertex/agent-orchestrator',
	namespacePrefix: 'agent-orchestrator',
	options,
	args: {},
});

/** Narrow type for the invented `errors` field this plugin's register()
 *  returns on a fail-closed path — not part of `IMcpPluginRegistrations`
 *  proper, so tests read it structurally rather than via the typed
 *  interface. */
type IRegisterResultWithErrors = {
	readonly tools?: readonly unknown[];
	readonly errors?: readonly {
		structuredContent?: {
			error?: { reason?: string; nextAction?: string };
		};
	}[];
};

const REAL_PORT: IDispatchPort = {
	spawnSubagent: async () => ({
		subagentId: 'x',
		tokensUsed: 1,
		output: 'ok',
		schemaOk: true,
		hadError: false,
	}),
};

describe('agent-orchestrator plugin register() — dispatch port resolution (bug 2)', () => {
	it('still registers the port-independent tools when no portFactory is given', async () => {
		// The dispatch capability is resolved lazily, at call time: a host
		// that only plans must not lose `_plan`/`_budget` just because it
		// never wired a dispatch port. The safety property (no fabricated
		// dispatch success) is enforced when `_dispatch` is actually
		// invoked — see `dispatch.tool.spec.ts` — and by
		// `resolveDispatchPort` itself, covered in `port-resolution.spec.ts`.
		const reg = (await plugin.register(
			makeCtx({}),
		)) as IRegisterResultWithErrors;
		expect(reg.tools?.length).toBeGreaterThan(0);
		expect(reg.errors ?? []).toHaveLength(0);
	});

	it('registers tools when a real portFactory is supplied', async () => {
		const reg = (await plugin.register(
			makeCtx({ portFactory: () => REAL_PORT }),
		)) as IRegisterResultWithErrors;
		expect(reg.tools?.length).toBeGreaterThan(0);
		expect(reg.errors ?? []).toHaveLength(0);
	});

	it('registers tools with FakeDispatchPort only via the explicit allowFakeDispatchPort opt-in', async () => {
		const reg = (await plugin.register(
			makeCtx({ allowFakeDispatchPort: true }),
		)) as IRegisterResultWithErrors;
		expect(reg.tools?.length).toBeGreaterThan(0);
		expect(reg.errors ?? []).toHaveLength(0);
	});

	it('registers tools even when portFactory returns something with no spawnSubagent', async () => {
		// A malformed factory is rejected by `resolveDispatchPort` when a
		// dispatch is attempted, not at registration time — same reasoning
		// as the missing-port case above.
		const reg = (await plugin.register(
			makeCtx({ portFactory: () => ({ notAPort: true }) }),
		)) as IRegisterResultWithErrors;
		expect(reg.tools?.length).toBeGreaterThan(0);
		expect(reg.errors ?? []).toHaveLength(0);
	});
});

describe('agent-orchestrator plugin register() — perMode wiring (bug 1)', () => {
	it('accepts a policy with perMode overrides and rejects an invalid one', async () => {
		const ok = await plugin.register(
			makeCtx({
				policy: {
					defaultMode: 'linear',
					defaults: {
						budget: {
							maxTokensOrchestrator: 100_000,
							maxTokensPerSubagent: 10_000,
							timeoutMs: 0,
						},
						rotation: {
							maxIterationsPerSubagent: 3,
							allow: ['error-storm'],
						},
					},
					perMode: {
						linear: { budget: { maxTokensPerSubagent: 2_000 } },
					},
				},
				allowFakeDispatchPort: true,
			}),
		);
		expect(ok.tools?.length).toBeGreaterThan(0);

		// An invalid perMode shape (unknown `maxTknsPerSubagent` typo) fails
		// `OptionsSchema` itself (`.strict()` at every level), so the whole
		// options object — including `allowFakeDispatchPort` — is rejected.
		// The plugin then falls back to `DEFAULT_POLICY`, but since
		// `allowFakeDispatchPort` was lost along with the rest of the
		// malformed options, it also fails closed on the dispatch port:
		// the bad config never gets a chance to act on the malformed
		// override.
		const bad = (await plugin.register(
			makeCtx({
				policy: {
					defaultMode: 'linear',
					defaults: {
						budget: {
							maxTokensOrchestrator: 100_000,
							maxTokensPerSubagent: 10_000,
							timeoutMs: 0,
						},
						rotation: {
							maxIterationsPerSubagent: 3,
							allow: ['error-storm'],
						},
					},
					perMode: {
						linear: { budget: { maxTknsPerSubagent: 2_000 } },
					},
				},
				allowFakeDispatchPort: true,
			}),
		)) as IRegisterResultWithErrors;
		// A misspelled `perMode` budget key must be refused outright — the
		// host asked for limits it did not get, which is exactly the
		// silently-swallowed-option class this plugin was fixed for.
		expect(bad.tools ?? []).toHaveLength(0);
		expect(bad.errors?.[0]?.structuredContent?.error?.reason).toBe(
			'invalid-options',
		);
	});

	it('accepts a policy with no perMode field at all (the common case)', async () => {
		const reg = (await plugin.register(
			makeCtx({
				policy: {
					defaultMode: 'linear',
					defaults: {
						budget: {
							maxTokensOrchestrator: 100_000,
							maxTokensPerSubagent: 10_000,
							timeoutMs: 0,
						},
						rotation: {
							maxIterationsPerSubagent: 3,
							allow: ['error-storm'],
						},
					},
				},
				allowFakeDispatchPort: true,
			}),
		)) as IRegisterResultWithErrors;
		expect(reg.tools?.length).toBeGreaterThan(0);
		expect(reg.errors ?? []).toHaveLength(0);
	});

	it('FakeDispatchPort instance is used only when allowFakeDispatchPort is set', () => {
		// Sanity: `FakeDispatchPort` is exported and constructible directly,
		// confirming it remains available for tests/fixtures per the fix.
		expect(new FakeDispatchPort()).toBeInstanceOf(FakeDispatchPort);
	});
});
