/**
 * capabilities/versioning.ts — f00194 (Track K / capability versioning).
 *
 * Semver-aware resolution for plugin capability requirements. A plugin
 * can declare
 *
 *     requires: { 'git:write': '^2.0.0' }
 *
 * and the host, before activating the plugin, verifies the capability
 * provider exposes a compatible version. The resolution is **pure** —
 * no I/O, no plugin loader dependency — so the contract is testable
 * without bringing up the router or the lifecycle.
 *
 * Design notes (SRP + OCP):
 *   - The module ships a tiny pure-JS semver adapter under
 *     `internalSemver` so the contract works under BOTH the Bun
 *     runtime (production: `Bun.semver`) AND the Node runtime
 *     (vitest in this repo). No new npm deps.
 *   - `CapabilityRequirement` is just `Record<string, string>` so
 *     manifests can declare it inline without a wrapper schema; the
 *     dedicated `parseCapabilityRequirement` validator is the SRP
 *     gate.
 *   - Non-versioned capabilities (legacy, pre-f00194) are treated as
 *     `0.0.0` — any range matches them. This is the soft-migration
 *     safety net so existing plugins keep working while upgraded
 *     providers can use real ranges.
 *
 * Privacy (R1.1, R1.2): this module records capability ids (public)
 * and semver strings (public). No tool names, no paths, no plugin
 * author info.
 */

import { isCapability, type Capability } from './schema';

/**
 * A plugin-side requirement: a capability id mapped to a semver range.
 *
 *     { 'git:write': '^2.0.0', 'fs:read': '>=1.2.0' }
 */
export type CapabilityRequirement = Readonly<Record<string, string>>;

/**
 * The provider-side declaration: which version of which capability
 * is exposed. Unknown future capabilities use `string` as the id
 * (the gate falls back to a soft check when the id is not in the
 * typed `Capability` union).
 */
export interface IVersionedCapability {
	readonly capability: string;
	readonly version: string;
	readonly transport?: 'inline' | 'stdio' | 'http';
}

/**
 * Refusal envelope returned by `resolveCapabilityVersion` when a
 * plugin's `requires` clause cannot be satisfied by any of the
 * provided versions.
 */
export interface ICapabilityVersionRefusal {
	readonly kind: 'capability-version-mismatch';
	readonly capability: string;
	readonly required: string;
	readonly available: readonly string[];
}

/**
 * Successful resolution: which version of the capability satisfied
 * the requirement, plus the original requirement token so callers
 * can audit the match.
 */
export interface ICapabilityVersionResolution {
	readonly kind: 'capability-version-ok';
	readonly capability: string;
	readonly required: string;
	readonly version: string;
	readonly transport?: 'inline' | 'stdio' | 'http';
}

/**
 * Sum type returned by the resolver. Discriminated by `kind` so
 * callers can branch without an `instanceof` check.
 */
export type CapabilityVersionResult =
	| ICapabilityVersionResolution
	| ICapabilityVersionRefusal;

/** Built-in wildcard that matches any semver — used for legacy
 *  capabilities and as the default when a plugin omits `requires`. */
export const WILDCARD_RANGE = '*';

// ---------------------------------------------------------------------------
// Pure-JS semver adapter (subset).
//
// Supports the range operators the manifest contract actually emits:
// `^X.Y.Z`, `~X.Y.Z`, `>=X.Y.Z`, `>X.Y.Z`, `<=X.Y.Z`, `<X.Y.Z`,
// `=X.Y.Z`, `X.Y.Z` (bare), `*` (wildcard). Pre-release tags are
// stripped before comparison so a `2.0.0-rc.1` parses as `2.0.0` —
// capability versioning here is about major/minor/patch compatibility,
// not npm pre-release semantics.
//
// When `Bun.semver` is present (the production runtime) we delegate
// to it for richer compatibility (`||`, hyphen ranges, etc.): the
// npm registry uses those, and Bun implements them natively.
// ---------------------------------------------------------------------------

interface ISemverParts {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)/;

const parseSemver = (value: string): ISemverParts | null => {
	const match = SEMVER_RE.exec(value);
	if (!match) return null;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (
		!Number.isFinite(major) ||
		!Number.isFinite(minor) ||
		!Number.isFinite(patch)
	) {
		return null;
	}
	return { major, minor, patch };
};

const compareParts = (a: ISemverParts, b: ISemverParts): number => {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	return a.patch - b.patch;
};

/** Pad a `1` or `1.2` shorthand to a full `1.0.0` / `1.2.0` semver. */
const padSemver = (raw: string): string => {
	const parts = raw.split('.');
	if (parts.length === 1) return `${parts[0]}.0.0`;
	if (parts.length === 2) return `${parts[0]}.${parts[1]}.0`;
	return raw;
};

const meetsComparator = (
	version: ISemverParts,
	comparator: string,
): boolean => {
	const trimmed = comparator.trim();
	if (trimmed === '*' || trimmed === '') return true;
	// Accept `>=2` shorthand (major-only); pad to `2.0.0`.
	const opMatch = /^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+(?:\.\d+)?)?)$/.exec(
		trimmed,
	);
	if (!opMatch) return false;
	const [, op, raw] = opMatch;
	const padded = padSemver(raw!);
	const target = parseSemver(padded);
	if (!target) return false;
	const cmp = compareParts(version, target);
	switch (op ?? '=') {
		case '>=':
			return cmp >= 0;
		case '<=':
			return cmp <= 0;
		case '>':
			return cmp > 0;
		case '<':
			return cmp < 0;
		case '=':
		case '':
			return cmp === 0;
		default:
			return false;
	}
};

const pureSatisfies = (version: string, range: string): boolean => {
	const parts = parseSemver(version);
	if (!parts) return false;
	const trimmed = range.trim();
	if (trimmed === '' || trimmed === '*') return true;

	// Bare version: exact match (e.g. plugin writes `requires: { 'x:y': '2.0.0' }`).
	if (SEMVER_RE.test(trimmed) && !/^[~^<>=]/.test(trimmed)) {
		const target = parseSemver(trimmed);
		return target !== null && compareParts(parts, target) === 0;
	}

	if (trimmed.startsWith('^')) {
		const target = parseSemver(trimmed.slice(1));
		if (!target) return false;
		// Caret: same major, version >= target. For 0.x and 0.0.x, the
		// semantics tighten (npm-compatible): 0.2.3 ^ means >=0.2.3 <0.3.0;
		// 0.0.3 ^ means >=0.0.3 <0.0.4.
		if (target.major > 0) {
			return (
				parts.major === target.major && compareParts(parts, target) >= 0
			);
		}
		if (target.minor > 0) {
			return (
				parts.major === 0 &&
				parts.minor === target.minor &&
				compareParts(parts, target) >= 0
			);
		}
		return (
			parts.major === 0 &&
			parts.minor === 0 &&
			parts.patch === target.patch
		);
	}

	if (trimmed.startsWith('~')) {
		const target = parseSemver(trimmed.slice(1));
		if (!target) return false;
		return (
			parts.major === target.major &&
			parts.minor === target.minor &&
			compareParts(parts, target) >= 0
		);
	}

	// Single-comparator forms: `>=`, `<=`, `>`, `<`, `=`.
	if (
		trimmed.startsWith('>=') ||
		trimmed.startsWith('<=') ||
		trimmed.startsWith('>') ||
		trimmed.startsWith('<') ||
		trimmed.startsWith('=')
	) {
		return meetsComparator(parts, trimmed);
	}

	// Compound (space-separated AND): every comparator must hold.
	const conjuncts = trimmed.split(/\s+/).filter((c) => c.length > 0);
	if (conjuncts.length > 1) {
		return conjuncts.every((c) => pureSatisfies(version, c));
	}

	return false;
};

const pureOrder = (a: string, b: string): number => {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	if (!pa || !pb) return 0;
	return compareParts(pa, pb);
};

interface ISemverAdapter {
	readonly satisfies: (version: string, range: string) => boolean;
	readonly order: (a: string, b: string) => number;
}

/** Resolve the runtime semver implementation. Bun provides a
 *  fully-spec-compliant `Bun.semver`; under Node we fall back to
 *  the pure subset above. The contract surface stays the same. */
const resolveSemverAdapter = (): ISemverAdapter => {
	const bun = (globalThis as { Bun?: { semver?: ISemverAdapter } }).Bun;
	if (bun?.semver) {
		return bun.semver;
	}
	return { satisfies: pureSatisfies, order: pureOrder };
};

const semver: ISemverAdapter = resolveSemverAdapter();

/**
 * Parse + validate a `CapabilityRequirement` literal coming from a
 * manifest. Unknown capability ids are tolerated (forward compat):
 * the resolver only refuses when the capability is provided AND the
 * range does not match. Pure.
 *
 * The returned object is frozen so downstream consumers can rely on
 * structural equality.
 */
export const parseCapabilityRequirement = (
	input: unknown,
): Readonly<CapabilityRequirement> => {
	if (input === null || input === undefined) return Object.freeze({});
	if (typeof input !== 'object' || Array.isArray(input)) {
		throw new Error(
			`requires: expected an object mapping capability → semver range, got ${typeof input}`,
		);
	}
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(input)) {
		if (typeof key !== 'string' || key.length === 0) {
			throw new Error(
				`requires: capability id must be a non-empty string, got ${JSON.stringify(key)}`,
			);
		}
		if (typeof value !== 'string' || value.length === 0) {
			throw new Error(
				`requires: range for ${JSON.stringify(key)} must be a non-empty semver string, got ${JSON.stringify(value)}`,
			);
		}
		out[key] = value;
	}
	return Object.freeze(out);
};

/**
 * Resolve which version of `capability` satisfies `range`, given the
 * list of versions a provider exposes.
 *
 * Behavior:
 *   - Empty `available` for a capability that has a non-wildcard
 *     requirement → refusal (`available: []`).
 *   - Multiple matching versions → highest wins (stable ordering:
 *     `semver.order`).
 *   - Multiple provided versions but NONE matches → refusal with the
 *     full available list (the gate wants to know what was offered).
 *
 * Pure.
 */
export const resolveCapabilityVersion = (
	capability: string,
	range: string,
	available: readonly IVersionedCapability[],
): CapabilityVersionResult => {
	const matching = available
		.filter((entry) => {
			if (entry.capability !== capability) return false;
			// Legacy sentinel (pre-f00194 plugins): any range matches.
			// This is the soft-migration safety net declared in the proposal.
			if (entry.version === '0.0.0') return true;
			return semver.satisfies(entry.version, range);
		})
		.slice()
		.sort((a, b) => semver.order(b.version, a.version));
	if (matching.length > 0) {
		const winner = matching[0]!;
		const resolved: ICapabilityVersionResolution = {
			kind: 'capability-version-ok',
			capability,
			required: range,
			version: winner.version,
			...(winner.transport !== undefined
				? { transport: winner.transport }
				: {}),
		};
		return resolved;
	}
	const refusal: ICapabilityVersionRefusal = {
		kind: 'capability-version-mismatch',
		capability,
		required: range,
		available: available
			.filter((entry) => entry.capability === capability)
			.map((entry) => entry.version),
	};
	return refusal;
};

/**
 * Resolve every entry of a `CapabilityRequirement` against a flat
 * list of provided versions. Returns the full result map so the
 * caller (router, lint, matrix) can decide what to do with partial
 * mismatches.
 *
 * Order:
 *   1. Loop over the requirement entries; the first refusal stops
 *      the resolver (`fail-fast`) so the activation refusal carries
 *      one decisive cause.
 *   2. Wildcard ranges (`*`) always resolve to `0.0.0` if the
 *      capability is provided at all, else to a refusal.
 */
export const resolveAllCapabilityVersions = (
	requirement: CapabilityRequirement,
	available: readonly IVersionedCapability[],
): Readonly<Record<string, CapabilityVersionResult>> => {
	const out: Record<string, CapabilityVersionResult> = {};
	for (const [capability, range] of Object.entries(requirement)) {
		out[capability] = resolveCapabilityVersion(
			capability,
			range,
			available,
		);
	}
	return Object.freeze(out);
};

/**
 * Format a refusal as a single deterministic line for the boot log.
 * Pure, safe for log output (no embedded tool names, no paths).
 */
export const formatCapabilityVersionRefusal = (
	refusal: ICapabilityVersionRefusal,
): string => {
	const avail =
		refusal.available.length === 0
			? '<none>'
			: refusal.available.join(', ');
	return `capability-version-mismatch: ${refusal.capability} requires ${refusal.required} but host offers [${avail}]`;
};

/**
 * Synthetic "legacy" version for a capability that is declared by a
 * plugin without an explicit version. Lets the resolver treat the
 * pre-f00194 plugins as `0.0.0` so any range matches them.
 */
export const legacyVersionedCapability = (
	capability: Capability | string,
): IVersionedCapability => ({
	capability,
	version: '0.0.0',
	transport: 'inline',
});

/**
 * Combine a plugin's declared capabilities with their required
 * versions. Returns the flat list the resolver expects, treating
 * capabilities without a `requires` clause as `0.0.0` (legacy).
 *
 * If the plugin declared a capability in its `requires` but never
 * declared the capability itself, the requirement is preserved —
 * the resolver will produce a refusal with `available: []`.
 */
export const buildAvailableVersions = (
	declaredCapabilities: readonly (Capability | string)[],
	provided: readonly IVersionedCapability[],
): readonly IVersionedCapability[] => {
	const declaredSet = new Set<string>(declaredCapabilities);
	const fromProvided = provided.filter((entry) =>
		declaredSet.has(entry.capability),
	);
	const providedSet = new Set(fromProvided.map((entry) => entry.capability));
	const legacyFill: IVersionedCapability[] = [];
	for (const capability of declaredCapabilities) {
		if (!providedSet.has(capability)) {
			legacyFill.push(legacyVersionedCapability(capability));
		}
	}
	return Object.freeze([...fromProvided, ...legacyFill]);
};

/**
 * Convenience helper used by the activation gate: returns `null`
 * when every requirement is satisfied, or the FIRST refusal when
 * any one fails. Pure.
 */
export const checkCapabilityRequirements = (
	requirement: CapabilityRequirement,
	declaredCapabilities: readonly (Capability | string)[],
	provided: readonly IVersionedCapability[],
): ICapabilityVersionRefusal | null => {
	const available = buildAvailableVersions(declaredCapabilities, provided);
	for (const [capability, range] of Object.entries(requirement)) {
		const result = resolveCapabilityVersion(capability, range, available);
		if (result.kind === 'capability-version-mismatch') return result;
	}
	return null;
};

/**
 * Re-export for callers that want a typed capability id without
 * pulling the schema module directly.
 */
export const isKnownCapability = isCapability;
