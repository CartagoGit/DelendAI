import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'framework-knowledge',
	package: '@delendai/framework-knowledge',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Resolves what the project’s installed framework version allows, recommends and forbids, before an agent writes code.',
	tags: ['knowledge', 'frameworks', 'policy'],
	maturity: 'experimental',
	// No tools yet (f00547 S2–S4 land the knowledge record, the policy
	// resolver and the convention detector as library code only). The
	// manifest schema refuses an empty `permissions` array, so this
	// declares the one permission every consumer of this plugin will
	// need at minimum — reading the manifest/lockfile to resolve a
	// version — leaving S5 to decide whether its tools need more.
	permissions: ['filesystem-read'],
	// Deliberately in NO preset while it has no tools to expose, and per
	// the proposal's own acceptance criteria once it does: adopting a
	// framework rule is a decision a project opts into, not a default.
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'zod'],
	capabilities: [],
});
