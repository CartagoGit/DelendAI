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
		forbids: 'any `node:*` builtin, and `@delendai/core`',
		enforcedBy: 'lint:no-node-imports-in-contracts',
		matcher: {
			kind: 'any-of',
			matchers: [
				{ kind: 'node-builtin' },
				{ kind: 'module-name', names: ['@delendai/core'] },
			],
		},
		because:
			'A consumer must be able to take a type from the contracts without inheriting the core runtime.',
	},
	{
		from: 'state',
		forbids: 'any `node:*` builtin',
		enforcedBy: 'lint:no-node-imports-in-state',
		matcher: { kind: 'node-builtin' },
		because:
			'The state model stays portable; persistence lives in a separate package that may use Node.',
	},
	{
		from: 'client',
		forbids:
			'TYPE imports from `@delendai/core/public` or bare `@delendai/core`',
		enforcedBy: 'lint:no-core-public-types-in-client',
		matcher: {
			kind: 'specifier-prefix',
			prefixes: ['@delendai/core', '@delendai/core/public'],
			importKind: 'type-only',
		},
		because:
			'Types come from `@delendai/core/contracts`; only runtime values come from the public barrel.',
	},
	{
		from: 'cli',
		forbids:
			'`@delendai/core/lib`, `@delendai/core/dist`, and relative paths into `packages/core/src/lib`',
		enforcedBy: 'lint:cli-imports',
		matcher: { kind: 'core-internal' },
		because:
			'Anything shipped to a consumer may depend on the public API only, or it couples to core internals.',
	},
	{
		from: 'tools',
		forbids:
			'`@delendai/core/lib`, `@delendai/core/dist`, and relative paths into `packages/core/src/lib`',
		enforcedBy: 'lint:cli-imports',
		matcher: { kind: 'core-internal' },
		because:
			'The same rule covers `tools/scripts`: a gate that imports internals breaks when they move.',
	},
	{
		from: '*',
		forbids:
			'a machine-absolute specifier such as `/home/<user>/...` from anywhere in the repo',
		enforcedBy: 'lint:no-absolute-local-imports',
		matcher: { kind: 'absolute-specifier' },
		because:
			'It resolves on the machine that wrote it and nowhere else, so local typecheck passes while CI fails.',
	},
];

export const LAYER_GRAPH: ILayerGraph = { layers: LAYERS, rules: RULES };
