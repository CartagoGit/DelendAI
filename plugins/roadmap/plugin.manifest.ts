import { definePluginManifest } from '@delendai/core/public';

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
	// Measured through an assembled host and a listing client
	// (`roadmap-agnosticism.spec.ts`, which holds the listing under the
	// hard cap): seven tools, 10,222 B; the largest one, 2,258 B.
	tokenBudget: {
		staticBytes: 10_250,
		adaptiveActivationBytes: 2_260,
		caps: { hard: 11_500, warning: 10_800 },
		measuredAt: '2026-10-11',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@delendai/changelog', 'zod', 'yaml'],
	capabilities: ['roadmap', 'release'],
});
