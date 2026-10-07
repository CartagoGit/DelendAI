/** Constants for the cache layout lifecycle. */
import type {
	ICacheArtifactClass,
	ICacheLayoutManifest,
} from '../interfaces/cache-layout.interface';

/**
 * The layout epoch this build reads and writes.
 *
 * Independent of the package version, of the SQLite schema version and
 * of every store's own schema. Bump it only when the persisted layout
 * stops being readable by the previous build, and ship the migration
 * `N -> N + 1` in the same change.
 */
export const CACHE_LAYOUT_EPOCH = 9;

export const CACHE_ARTIFACT_CLASSES: readonly ICacheArtifactClass[] = [
	'derived',
	'ephemeral',
	'operational',
	'records',
];

/**
 * The classes a layout migration must never delete: `results/*` belongs
 * to its owner plugin, and operational state is live.
 */
export const CACHE_PERSISTENT_CLASSES: readonly ICacheArtifactClass[] = [
	'operational',
	'records',
];

/**
 * The layout the current build reads, written down so that changing it
 * without a migration is visible in review. It lists what core owns or
 * what a plugin declares through `cacheNamespace`; artifacts that a
 * domain plugin keeps in its own directory are that plugin's to declare.
 * It is documentation, not an allow-list: nothing is deleted because it is missing here, and TTL
 * retention stays with the cache eviction registry.
 */
export const CACHE_LAYOUT_MANIFEST: ICacheLayoutManifest = {
	epoch: CACHE_LAYOUT_EPOCH,
	artifacts: [
		{
			id: 'verify-tmp',
			owner: 'core',
			path: 'verify-tmp',
			class: 'ephemeral',
		},
		{
			id: 'commit-policy',
			owner: 'commit-policy',
			path: 'commit-policy',
			class: 'operational',
		},
		{
			id: 'agents-lock',
			owner: 'agent-orchestrator',
			path: 'agents.lock.json',
			class: 'operational',
		},
		{
			id: 'memory',
			owner: 'memory',
			path: 'results/memory',
			class: 'records',
		},
		{
			id: 'logs',
			owner: 'logs',
			path: 'results/logs',
			class: 'records',
		},
		{
			id: 'logs-errors',
			owner: 'logs',
			path: 'results/logs-errors',
			class: 'records',
		},
		{
			id: 'usage-tracking',
			owner: 'usage-tracking',
			path: 'results/usage-tracking',
			class: 'records',
		},
		{
			id: 'auto-agent-selector',
			owner: 'auto-agent-selector',
			path: 'results/auto-agent-selector',
			class: 'records',
		},
	],
};
