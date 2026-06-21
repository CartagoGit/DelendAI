/**
 * load-skills.ts — read `skills/manifest.json` and resolve which entries
 * apply to a given `@mcp-vertex/core` version (f00029 S4).
 *
 * Single Responsibility: this module only reads + filters the manifest. It
 * does not read the SKILL.md bodies themselves (callers do that on demand,
 * the same "lazy, fetch only what you need" pattern as
 * `buildKnowledgeToolRegistration`) and does not know about the CLI/plugin
 * loader — `pluginCacheDir`/`workspace` etc. are irrelevant here, the
 * manifest is a project-level file, not a per-plugin one.
 */
import { readFile } from 'node:fs/promises';

/** One entry from `skills/manifest.json`. */
export interface ISkillBundle {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	readonly bodyPath: string;
	readonly tags: readonly string[];
}

interface ISkillManifestFile {
	readonly generatedAt: string;
	readonly skills: readonly ISkillBundle[];
}

/** Parse "x.y.z" into `[x, y, z]`; throws on anything else (callers control the input — the manifest is repo-authored, not external). */
const parseSemver = (raw: string): readonly [number, number, number] => {
	const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw);
	if (!m) throw new Error(`not a semver "x.y.z": "${raw}"`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
};

/** True when `version >= minVersion` (simple numeric major.minor.patch compare — no pre-release/build metadata in this manifest). */
const versionGte = (version: string, minVersion: string): boolean => {
	const a = parseSemver(version);
	const b = parseSemver(minVersion);
	for (let i = 0; i < 3; i += 1) {
		const av = a[i] as number;
		const bv = b[i] as number;
		if (av !== bv) return av > bv;
	}
	return true;
};

/**
 * Load `skills/manifest.json` from `manifestPathAbs` and return every entry
 * whose `minCoreVersion` is satisfied by `coreVersion` — i.e. the bundle a
 * consumer pinned to `coreVersion` can safely resolve. Skills requiring a
 * newer core than `coreVersion` are silently excluded (not an error): an
 * older core simply does not advertise a skill that depends on a feature it
 * doesn't have.
 *
 * Returns `[]` (not a throw) when the manifest file is missing or malformed
 * — a project without `skills/manifest.json` has no versioned skill bundle,
 * which is a valid (if degraded) state, not a fatal error.
 */
export const loadSkills = async (
	manifestPathAbs: string,
	coreVersion: string,
): Promise<readonly ISkillBundle[]> => {
	let parsed: ISkillManifestFile;
	try {
		parsed = JSON.parse(
			await readFile(manifestPathAbs, 'utf8'),
		) as ISkillManifestFile;
	} catch {
		return [];
	}
	if (!Array.isArray(parsed.skills)) return [];

	return parsed.skills.filter((skill) => {
		try {
			return versionGte(coreVersion, skill.minCoreVersion);
		} catch {
			return false;
		}
	});
};
