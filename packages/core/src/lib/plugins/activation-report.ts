/**
 * activation-report.ts — f00107 S2.
 *
 * Pure builder for the {@link IActivationReport}: the authoritative answer
 * to "which plugins are active, from which origin, and why." No I/O — the
 * caller (assemble) passes the already-loaded plugins plus the name-sets
 * that each activation mechanism contributed, and this folds them into a
 * stable, render-ready report.
 */
import type {
	ActivationSource,
	IActivationContribution,
	IActivationEntry,
	IActivationReport,
	IActivationSources,
	ILoadedPluginFacts,
} from '../contracts/interfaces/activation-report.interface';
import type { PluginOrigin } from '../contracts/interfaces/plugin-origin.interface';
import { classifyOrigin } from './classify-origin';

const sourceFor = (
	name: string,
	sources: IActivationSources,
): ActivationSource => {
	if (sources.fromFlag.has(name)) return 'flag';
	if (sources.fromConfig.has(name)) return 'config';
	return 'preset';
};

/** Stable ordering: origin bucket first (ours, then yours, then external), then id. */
const ORIGIN_RANK: Readonly<Record<PluginOrigin, number>> = {
	bundled: 0,
	'user-local': 1,
	external: 2,
};

export const buildActivationReport = (
	loaded: readonly ILoadedPluginFacts[],
	sources: IActivationSources,
	contributions: readonly IActivationContribution[] = [],
): IActivationReport => {
	const entries: IActivationEntry[] = [
		...loaded.map(
			(p): IActivationEntry => ({
				id: p.name,
				origin: classifyOrigin({
					name: p.name,
					resolvedSpecifier: p.resolvedSpecifier,
					hasExplicitPath: p.hasExplicitPath,
					isExternalServer: p.isExternalServer,
				}),
				active: true,
				source: sourceFor(p.name, sources),
				toolCount: p.toolCount,
			}),
		),
		...contributions.map(
			(entry): IActivationEntry => ({
				...entry,
				active: entry.active ?? true,
			}),
		),
	].sort(
		(a, b) =>
			ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin] ||
			a.id.localeCompare(b.id),
	);

	const counts: Record<PluginOrigin, number> = {
		bundled: 0,
		'user-local': 0,
		external: 0,
	};
	let totalTools = 0;
	for (const e of entries) {
		if (!e.active) continue;
		counts[e.origin] += 1;
		totalTools += e.toolCount;
	}

	return { entries, counts, totalTools };
};
