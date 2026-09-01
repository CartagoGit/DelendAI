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
	lean: 'habitual-work',
	standard: 'adaptive-task-aware',
	swarm: 'multi-agent',
	full: 'diagnostic',
	vertex: 'mcp-vertex-dogfood',
	'web-app': 'stack-pack-web',
	'backend-api': 'stack-pack-backend',
	'cli-tool': 'stack-pack-cli',
};
