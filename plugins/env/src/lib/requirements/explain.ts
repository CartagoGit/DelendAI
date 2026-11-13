/**
 * requirements/explain.ts — f00135 S2: pure diff between a parsed `.env`
 * and a list of env-var requirements.
 *
 * For each requirement, mark the capability unlocked or blocked. A var
 * counts as present when it appears in the parsed env AND is not empty.
 * The result is a stable, sorted DTO the `env_explains` tool returns.
 */
import type { IParsedEnv } from '../contracts/interfaces/env.interface';
import type {
	IBlockedCapability,
	IEnvExplain,
	IEnvRequirement,
	IUnlockedCapability,
} from './types';

const varPresent = (parsed: IParsedEnv, name: string): boolean => {
	for (const entry of parsed.entries) {
		if (entry.key === name && !entry.empty) return true;
	}
	return false;
};

const keyOf = (r: IEnvRequirement): string =>
	r.provider !== undefined
		? `${r.plugin}|${r.provider}|${r.capability}`
		: `${r.plugin}|${r.capability}`;

const groupByCapability = (
	requirements: readonly IEnvRequirement[],
): Map<string, IEnvRequirement[]> => {
	const m = new Map<string, IEnvRequirement[]>();
	for (const r of requirements) {
		const k = keyOf(r);
		const list = m.get(k) ?? [];
		list.push(r);
		m.set(k, list);
	}
	return m;
};

/** Group requirements into capabilities and report unlocked vs blocked. */
export const explain = (
	parsed: IParsedEnv,
	requirements: readonly IEnvRequirement[],
): IEnvExplain => {
	const groups = groupByCapability(requirements);
	const unlocked: IUnlockedCapability[] = [];
	const blocked: IBlockedCapability[] = [];
	const completelyMissing = new Set<string>();

	for (const list of groups.values()) {
		const first = list[0];
		if (first === undefined) continue;
		const satisfiedBy: string[] = [];
		const missing: string[] = [];
		for (const r of list) {
			if (r.required && !varPresent(parsed, r.var)) {
				missing.push(r.var);
				completelyMissing.add(r.var);
				continue;
			}
			if (r.required) {
				satisfiedBy.push(r.var);
			}
		}
		const base = {
			plugin: first.plugin,
			capability: first.capability,
			...(first.provider !== undefined
				? { provider: first.provider }
				: {}),
		};
		if (missing.length > 0) {
			blocked.push({ ...base, missing });
		} else {
			unlocked.push({ ...base, satisfiedBy });
		}
	}

	// Sort for deterministic output.
	const sortByPlugin = <T extends { plugin: string; capability: string }>(
		arr: T[],
	): T[] =>
		[...arr].sort((a, b) => {
			const p = a.plugin.localeCompare(b.plugin);
			if (p !== 0) return p;
			return a.capability.localeCompare(b.capability);
		});

	return {
		capabilities: sortByPlugin([...unlocked, ...blocked]),
		blocked: sortByPlugin(blocked) as readonly IBlockedCapability[],
		unlocked: sortByPlugin(unlocked) as readonly IUnlockedCapability[],
		completelyMissing: [...completelyMissing].sort(),
	};
};
