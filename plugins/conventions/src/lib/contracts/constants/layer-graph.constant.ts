/**
 * The declared layer graph: which part of this repository may import
 * which, and the lint that makes each rule true.
 *
 * It lives in `contracts/constants/` because `types-in-contracts` keeps
 * exported constants there, and the behaviour that reads it lives in
 * `../../layers/layer-graph.service.ts`.
 *
 * Every rule is a reading of a gate that already runs in CI and names it
 * in `enforcedBy`. Nothing here invents an edge: an agent is told what
 * it may import, and the same rule is what fails afterwards if it did
 * not. `findUnenforcedRules` reports any rule whose enforcer has gone
 * missing, so a declaration can never quietly become a promise nobody
 * checks.
 */

import type {
	ILayer,
	ILayerGraph,
	ILayerRule,
} from '../interfaces/layer-graph.interface';

const LAYERS: readonly ILayer[] = [
	{
		id: 'core-contracts',
		prefixes: ['packages/contracts/src'],
		summary: 'Type-only contracts. Pure TypeScript, no runtime.',
	},
	{
		id: 'state',
		prefixes: ['packages/state/src'],
		summary: 'The deterministic state model. Pure TypeScript.',
	},
	{
		id: 'client',
		prefixes: ['packages/client/src'],
		summary:
			'The MCP client. Takes types from contracts, runtime from core/public.',
	},
	{
		id: 'cli',
		prefixes: ['packages/cli/src'],
		summary: 'The CLI. Reaches core only through its public barrel.',
	},
	{
		id: 'tools',
		prefixes: ['tools/scripts'],
		summary:
			'Repo tooling and gates. Reaches core only through its public barrel.',
	},
	{
		id: 'core',
		prefixes: ['packages/core/src'],
		summary:
			'The runtime core. Owns the contracts every other layer reads.',
	},
	{
		id: 'plugins',
		prefixes: ['plugins'],
		summary: 'MCP plugins. Compose core; never reach into tooling.',
	},
];

const RULES: readonly ILayerRule[] = [
	{
		from: 'core-contracts',
		forbids:
			'the Node builtins the lint lists (with or without `node:`, and their subpaths), and `@delendai/core`',
		enforcedBy: 'lint:no-node-imports-in-contracts',
		detector: 'no-node-imports-in-contracts',
		because:
			'A consumer must be able to take a type from the contracts without inheriting the core runtime.',
	},
	{
		from: 'state',
		forbids:
			'the Node builtins the lint lists, `@delendai/core` and `@delendai/state-sqlite` — also in `plugins/*/src/lib/state`',
		enforcedBy: 'lint:no-node-imports-in-state',
		detector: 'no-node-imports-in-state',
		because:
			'The state model stays portable; persistence lives in a separate package that may use Node.',
	},
	{
		from: 'client',
		forbids:
			'TYPE imports from exactly `@delendai/core/public` or bare `@delendai/core`',
		enforcedBy: 'lint:no-core-public-types-in-client',
		detector: 'no-core-public-types-in-client',
		because:
			'Types come from `@delendai/core/contracts`; only runtime values come from the public barrel.',
	},
	{
		from: 'cli',
		forbids:
			'`@delendai/core/lib`, `@delendai/core/dist`, and relative paths into `packages/core/src/lib`',
		enforcedBy: 'lint:cli-imports',
		detector: 'no-internal-core-imports',
		because:
			'Anything shipped to a consumer may depend on the public API only, or it couples to core internals.',
	},
	{
		from: 'tools',
		forbids:
			'`@delendai/core/lib`, `@delendai/core/dist`, and relative paths into `packages/core/src/lib`',
		enforcedBy: 'lint:cli-imports',
		detector: 'no-internal-core-imports',
		because:
			'The same rule covers `tools/scripts`: a gate that imports internals breaks when they move.',
	},
	{
		from: '*',
		forbids:
			'a machine-absolute specifier such as `/home/<user>/...` from anywhere in the repo',
		enforcedBy: 'lint:no-absolute-local-imports',
		detector: 'no-absolute-local-imports',
		because:
			'It resolves on the machine that wrote it and nowhere else, so local typecheck passes while CI fails.',
	},
	{
		from: '*',
		forbids:
			'`@delendai/test-kit` and relative paths into `tests/`, `testing/`, `__tests__/`, `fixtures/`, the test-kit or a spec — from production source (`packages/*/src`, `plugins/*/src`, outside specs and those directories)',
		enforcedBy: 'lint:no-test-support-in-production',
		detector: 'no-test-support-in-production',
		because:
			'Fakes belong in the test-kit and specs may use them; code that ships may not, or a test dependency becomes a runtime one. A fake two packages need goes in the kit instead of being copied.',
	},
];

export const LAYER_GRAPH: ILayerGraph = { layers: LAYERS, rules: RULES };
