import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'roadmap',
	package: '@delendai/roadmap',
	version: '0.1.0',
	visibility: 'private',
	summary:
		'Versioned roadmap: what each target version promises, what is delivered, whether it can be promoted, and the bump its promises imply.',
	tags: ['roadmap', 'release', 'timeline'],
	maturity: 'experimental',
	// No `git-write`, by design: the plugin informs a promotion, the
	// forge and the release gate make it.
	permissions: ['filesystem-read', 'filesystem-write'],
	toolPermissions: {
		roadmap_show: ['filesystem-read'],
		roadmap_sync: ['filesystem-read'],
		roadmap_readiness: ['filesystem-read'],
		roadmap_delta: ['filesystem-read'],
		roadmap_promotion: ['filesystem-read'],
		roadmap_plan_init: ['filesystem-read', 'filesystem-write'],
		roadmap_plan_close: ['filesystem-read', 'filesystem-write'],
	},
	// Private like `changelog`, which it asks for the bump rule and which
	// is never published: no preset may advertise a package an adopter
	// cannot install. Reachable with `--plugins=roadmap` in this monorepo.
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@delendai/changelog', 'zod', 'yaml'],
	capabilities: ['roadmap', 'release'],
});
