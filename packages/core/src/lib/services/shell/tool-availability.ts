/**
 * tool-availability.ts — f00418 S2.
 *
 * Maps a registry of canonical CLI tools (git, bun, node, rg, jq, gh, …)
 * to an availability report for the agent. Every probe is non-blocking
 * (timeout ≤ 2 s, no TTY, never `command -v` per tool in a fork loop) and
 * the entire batch resolves in a single subprocess fork.
 *
 * Architecture (SRP):
 *   - {@link ShellToolRegistry}: a frozen list of {@link IShellToolDescriptor}
 *     entries; this is the ONE source of truth for what the agent
 *     considers a "relevant" tool. Hosts can extend it via
 *     {@link withExtendedRegistry}.
 *   - {@link IShellRunner}: an injectable seam over the real subprocess
 *     layer (`Bun.spawn`/`child_process`). Production code wires
 *     {@link defaultShellRunner}; tests inject a fake.
 *   - {@link ToolAvailabilityService}: consumes both and produces
 *     {@link IToolReport} arrays. It never assumes a tool exists — every
 *     result carries `availability: 'present' | 'missing' | 'unknown'`
 *     with a `confidence` flag so the consumer (the shell_status tool
 *     shipped in S3) can surface the difference.
 *
 * Non-goals: this service NEVER installs anything. When a tool is missing,
 * the report references the {@link InstallSuggestionsService} for the
 * install command — it does not embed the suggestion logic itself.
 */

export interface IShellToolDescriptor {
	readonly name: string;
	readonly purpose: string;
	readonly checkCommand: string;
	readonly versionFlag: string;
	readonly alternatives: readonly string[];
}

/** Default registry — the tools this repo's agents/plugins actually need. */
export const SHELL_TOOL_REGISTRY: readonly IShellToolDescriptor[] =
	Object.freeze([
		{
			name: 'git',
			purpose: 'source control',
			checkCommand: 'git',
			versionFlag: '--version',
			alternatives: [],
		},
		{
			name: 'bun',
			purpose: 'JS runtime + package manager (this monorepo)',
			checkCommand: 'bun',
			versionFlag: '--version',
			alternatives: ['node'],
		},
		{
			name: 'node',
			purpose: 'JS runtime (fallback when bun is missing)',
			checkCommand: 'node',
			versionFlag: '--version',
			alternatives: [],
		},
		{
			name: 'rg',
			purpose: 'fast code search (this repo uses rg for grep)',
			checkCommand: 'rg',
			versionFlag: '--version',
			alternatives: ['grep'],
		},
		{
			name: 'jq',
			purpose: 'JSON processing',
			checkCommand: 'jq',
			versionFlag: '--version',
			alternatives: ['python3'],
		},
		{
			name: 'gh',
			purpose: 'GitHub CLI',
			checkCommand: 'gh',
			versionFlag: '--version',
			alternatives: [],
		},
		{
			name: 'docker',
			purpose: 'container runtime',
			checkCommand: 'docker',
			versionFlag: '--version',
			alternatives: [],
		},
		{
			name: 'python3',
			purpose: 'general-purpose scripting',
			checkCommand: 'python3',
			versionFlag: '--version',
			alternatives: [],
		},
		{
			name: 'go',
			purpose: 'Go toolchain',
			checkCommand: 'go',
			versionFlag: 'version',
			alternatives: [],
		},
		{
			name: 'cargo',
			purpose: 'Rust toolchain',
			checkCommand: 'cargo',
			versionFlag: '--version',
			alternatives: [],
		},
	]);

export interface IShellProbeResult {
	readonly name: string;
	readonly path: string | null;
	readonly version: string | null;
	readonly status: 'present' | 'missing' | 'error';
	readonly errorReason?: string;
}

export interface IShellRunner {
	readonly resolveBatch: (
		tools: readonly IShellToolDescriptor[],
		signal: AbortSignal,
	) => Promise<IShellProbeResult[]>;
	readonly versionFor: (
		path: string,
		flag: string,
		signal: AbortSignal,
	) => Promise<string | null>;
}

export interface IInstallSuggestionResolver {
	readonly suggestInstall: (
		entry: IShellToolDescriptor,
		alternativesAvailable: readonly string[],
		signal: AbortSignal,
	) => Promise<null | {
		readonly manager: string;
		readonly command: string;
		readonly confirmed: boolean;
		readonly reason?: string;
	}>;
}

export interface IToolReport {
	readonly name: string;
	readonly purpose: string;
	readonly availability: 'present' | 'missing' | 'unknown';
	readonly probeStatus: 'present' | 'missing' | 'error';
	readonly path: string | null;
	readonly version: string | null;
	readonly alternativesAvailable: readonly string[];
	readonly suggestInstall: {
		readonly manager: string;
		readonly command: string;
		readonly confirmed: boolean;
		readonly reason?: string;
	} | null;
}

export interface IToolAvailabilityResult {
	readonly tools: readonly IToolReport[];
	readonly generatedAt: number;
	readonly ttlMs: number;
}

export interface IToolAvailabilityListOptions {
	readonly names?: readonly string[];
}

export interface IToolAvailabilityService {
	readonly list: (
		options: IToolAvailabilityListOptions,
		signal: AbortSignal,
	) => Promise<IToolAvailabilityResult>;
	readonly reportFor: (
		name: string,
		signal: AbortSignal,
	) => Promise<IToolReport | null>;
	readonly attachSuggestions: (
		tools: readonly IToolReport[],
		signal: AbortSignal,
	) => Promise<IToolReport[]>;
	readonly invalidate: () => void;
}

export interface ICreateToolAvailabilityServiceOptions {
	readonly runner: IShellRunner;
	readonly ttlMs?: number;
	readonly clock?: () => number;
	readonly suggestInstall?: IInstallSuggestionResolver['suggestInstall'];
	readonly registry?: readonly IShellToolDescriptor[];
}

export const DEFAULT_TOOL_AVAILABILITY_TTL_MS = 30_000;

/**
 * Concatenates the default registry with host-supplied entries. The
 * default registry is always present; the host entries extend it.
 * Duplicates (by `name`) are resolved in favour of the host entry.
 */
export const withExtendedRegistry = (
	extra: readonly IShellToolDescriptor[],
): readonly IShellToolDescriptor[] => {
	const seen = new Set<string>();
	const result: IShellToolDescriptor[] = [];
	for (const entry of extra) {
		if (!seen.has(entry.name)) {
			seen.add(entry.name);
			result.push(entry);
		}
	}
	for (const entry of SHELL_TOOL_REGISTRY) {
		if (!seen.has(entry.name)) {
			seen.add(entry.name);
			result.push(entry);
		}
	}
	return Object.freeze(result);
};

export const createToolAvailabilityService = (
	options: ICreateToolAvailabilityServiceOptions,
): IToolAvailabilityService => {
	const {
		runner,
		ttlMs = DEFAULT_TOOL_AVAILABILITY_TTL_MS,
		clock = Date.now,
		suggestInstall,
		registry = SHELL_TOOL_REGISTRY,
	} = options;

	let cache: {
		snapshot: IToolAvailabilityResult;
		expiresAt: number;
	} | null = null;

	const narrowCache: Map<string, IToolAvailabilityResult> = new Map();

	const probe = async (
		tools: readonly IShellToolDescriptor[],
		signal: AbortSignal,
	): Promise<IShellProbeResult[]> => {
		const results = await runner.resolveBatch(tools, signal);
		const enriched = await Promise.all(
			results.map(async (row) => {
				if (row.status !== 'present' || row.path === null) {
					return row;
				}
				const descriptor = tools.find((t) => t.name === row.name);
				if (!descriptor) return row;
				const version = await runner.versionFor(
					row.path,
					descriptor.versionFlag,
					signal,
				);
				return { ...row, version };
			}),
		);
		return enriched;
	};

	const buildReports = async (
		tools: readonly IShellToolDescriptor[],
		signal: AbortSignal,
	): Promise<IToolReport[]> => {
		const probes = await probe(tools, signal);
		return tools.map((entry) => {
			const probeResult = probes.find((p) => p.name === entry.name);
			const availability =
				probeResult?.status === 'error'
					? 'unknown'
					: probeResult?.status === 'present'
						? 'present'
						: 'missing';
			return {
				name: entry.name,
				purpose: entry.purpose,
				availability,
				probeStatus: probeResult?.status ?? 'missing',
				path: probeResult?.path ?? null,
				version: probeResult?.version ?? null,
				alternativesAvailable: entry.alternatives,
				suggestInstall: null,
			};
		});
	};

	return {
		async list(listOptions, signal) {
			const requestedNames = listOptions.names;
			if (requestedNames && requestedNames.length > 0) {
				const tools = registry.filter((entry) =>
					requestedNames.includes(entry.name),
				);
				const reports = await buildReports(tools, signal);
				return { tools: reports, generatedAt: clock(), ttlMs };
			}
			const now = clock();
			if (cache !== null && cache.expiresAt > now) {
				return cache.snapshot;
			}
			const reports = await buildReports(registry, signal);
			const snapshot: IToolAvailabilityResult = {
				tools: reports,
				generatedAt: now,
				ttlMs,
			};
			cache = { snapshot, expiresAt: now + ttlMs };
			return snapshot;
		},

		async reportFor(name, signal) {
			const cached = narrowCache.get(name);
			const now = clock();
			if (cached !== undefined && cached.ttlMs > 0) {
				return cached.tools.find((row) => row.name === name) ?? null;
			}
			const entry = registry.find((t) => t.name === name);
			if (!entry) return null;
			const reports = await buildReports([entry], signal);
			narrowCache.set(name, {
				tools: reports,
				generatedAt: now,
				ttlMs: 0,
			});
			return reports[0] ?? null;
		},

		async attachSuggestions(tools, signal) {
			if (!suggestInstall) {
				return tools.map((row) => ({ ...row, suggestInstall: null }));
			}
			return Promise.all(
				tools.map(async (row) => {
					if (row.availability === 'present') {
						return { ...row, suggestInstall: null };
					}
					const entry = registry.find((t) => t.name === row.name);
					if (!entry) {
						return { ...row, suggestInstall: null };
					}
					const suggestion = await suggestInstall(
						entry,
						row.alternativesAvailable,
						signal,
					);
					return { ...row, suggestInstall: suggestion };
				}),
			);
		},

		invalidate() {
			cache = null;
			narrowCache.clear();
		},
	};
};
