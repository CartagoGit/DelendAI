/**
 * preset-roles.constant.ts — r00024 (PRESET-001).
 *
 * Human-authored policy: what each preset is *for*, operationally. This
 * is deliberately kept separate from `preset-metadata.generated.ts` —
 * role is not a measurement, so it cannot be regenerated from a
 * measurement, and mixing the two would mean any doc-copy edit collides
 * with generated-artifact drift checking. Every key here must have a
 * matching entry in `PRESET_KIND` (`preset-catalog.ts`) — `preset-catalog.spec.ts`
 * covers the pairing indirectly by resolving every preset's `role` at
 * catalog build time.
 */
export const PRESET_ROLES: Readonly<Record<string, string>> = {
	minimal: 'orientation',
	solo: 'daily-coding',
	'team-pr': 'team-pull-requests',
	swarm: 'multi-agent',
	audit: 'read-only-audit',
	'docs-web': 'docs-and-web',
	everything: 'diagnostic',
	dogfood: 'delendai-dogfood',
};

/**
 * Who each pack is for. Human-authored like the role: the purpose is
 * policy, not a measurement, so it lives apart from the generated metadata.
 */
export const PRESET_PURPOSES: Readonly<Record<string, string>> = {
	minimal: 'Try-out and read-only orientation with the smallest context.',
	solo: 'One developer and one agent doing day-to-day coding.',
	'team-pr':
		'A team working through pull requests with commit and test conventions.',
	swarm: 'Several agents sharing one checkout.',
	audit: 'Read-only review and audit runs.',
	'docs-web': 'Documentation and web sites.',
	everything: 'Diagnostics: every published plugin.',
	dogfood:
		"This repository's own configuration; offered only where that configuration exists.",
};
