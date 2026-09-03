import type {
	IHostCapabilityManifest,
	IHostCapabilityProjection,
	IHostCapabilityKey,
} from '@mcp-vertex/contracts';

export type {
	IHostCapabilityManifest,
	IHostCapabilityProjection,
	IHostCapabilityKey,
} from '@mcp-vertex/contracts';

/**
 * The host-neutral default.
 *
 * It lives here rather than in `@mcp-vertex/contracts` because it is a
 * decision, not a shape: which capabilities a generic MCP host may be
 * assumed to have is policy the runtime owns and can revise. A contracts
 * package that also ships defaults gives a consumer two things to
 * disagree about instead of one to agree on.
 */
export const GENERIC_MCP_HOST_CAPABILITY_MANIFEST = {
	contract: 'mcp-vertex.host-capability-manifest',
	version: 1,
	hostId: 'generic-mcp',
	mcp: {
		tools: true,
		prompts: true,
		resources: true,
		structuredContent: true,
		listChanged: false,
		notifications: false,
	},
	skills: 'mcp-tool',
	subagents: 'none',
} satisfies IHostCapabilityManifest;

/** Canonical manifests currently shipped by the host-neutral runtime. */
export const CANONICAL_HOST_CAPABILITY_MANIFESTS: readonly IHostCapabilityManifest[] =
	[GENERIC_MCP_HOST_CAPABILITY_MANIFEST];

const CAPABILITY_READERS: Readonly<
	Record<IHostCapabilityKey, (manifest: IHostCapabilityManifest) => boolean>
> = {
	tools: (manifest) => manifest.mcp.tools,
	prompts: (manifest) => manifest.mcp.prompts,
	resources: (manifest) => manifest.mcp.resources,
	structuredContent: (manifest) => manifest.mcp.structuredContent,
	listChanged: (manifest) => manifest.mcp.listChanged,
	notifications: (manifest) => manifest.mcp.notifications,
	skills: (manifest) => manifest.skills !== 'none',
	subagents: (manifest) => manifest.subagents !== 'none',
};

const isKebabCase = (value: string): boolean =>
	/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value);

const validateManifest = (manifest: IHostCapabilityManifest): void => {
	if (!isKebabCase(manifest.hostId)) {
		throw new Error(
			`host capability manifest id must be kebab-case: ${manifest.hostId}`,
		);
	}
	if (manifest.contract !== 'mcp-vertex.host-capability-manifest') {
		throw new Error('unsupported host capability manifest contract');
	}
	if (manifest.version !== 1) {
		throw new Error(
			`unsupported host capability manifest version: ${manifest.version}`,
		);
	}
	if (manifest.mcp.tools !== true) {
		throw new Error('host capability manifests must support MCP tools');
	}
};

const cloneManifest = (
	manifest: IHostCapabilityManifest,
): IHostCapabilityManifest => ({
	...manifest,
	mcp: { ...manifest.mcp },
});

/**
 * Registry of canonical host manifests.
 *
 * The registry owns identity and lookup only. It never stores a second set of
 * booleans for `supportsX()` calls; every query reads the selected manifest.
 */
export class HostCapabilityRegistry {
	readonly #manifests: ReadonlyMap<string, IHostCapabilityManifest>;

	constructor(manifests: readonly IHostCapabilityManifest[] = []) {
		const entries = new Map<string, IHostCapabilityManifest>();
		for (const manifest of manifests) {
			validateManifest(manifest);
			if (entries.has(manifest.hostId)) {
				throw new Error(
					`duplicate host capability manifest: ${manifest.hostId}`,
				);
			}
			entries.set(manifest.hostId, cloneManifest(manifest));
		}
		this.#manifests = entries;
	}

	/** Return a defensive copy, so callers cannot mutate the source manifest. */
	get(hostId: string): IHostCapabilityManifest | undefined {
		const manifest = this.#manifests.get(hostId);
		return manifest === undefined ? undefined : cloneManifest(manifest);
	}

	/** List manifests in stable host-id order. */
	list(): readonly IHostCapabilityManifest[] {
		return [...this.#manifests.values()]
			.sort((left, right) => left.hostId.localeCompare(right.hostId))
			.map(cloneManifest);
	}

	/** Generic view used by adapters that discover capabilities dynamically. */
	supports(hostId: string, capability: IHostCapabilityKey): boolean {
		const manifest = this.#manifests.get(hostId);
		const reader = CAPABILITY_READERS[capability];
		return manifest === undefined || reader === undefined
			? false
			: reader(manifest);
	}

	supportsTools(hostId: string): boolean {
		return this.supports(hostId, 'tools');
	}

	supportsPrompts(hostId: string): boolean {
		return this.supports(hostId, 'prompts');
	}

	supportsResources(hostId: string): boolean {
		return this.supports(hostId, 'resources');
	}

	supportsStructuredContent(hostId: string): boolean {
		return this.supports(hostId, 'structuredContent');
	}

	supportsListChanged(hostId: string): boolean {
		return this.supports(hostId, 'listChanged');
	}

	supportsNotifications(hostId: string): boolean {
		return this.supports(hostId, 'notifications');
	}

	supportsSkills(hostId: string): boolean {
		return this.supports(hostId, 'skills');
	}

	supportsSubagents(hostId: string): boolean {
		return this.supports(hostId, 'subagents');
	}

	/** Project the canonical manifest for comparison with a legacy adapter. */
	project(hostId: string): IHostCapabilityProjection | undefined {
		const manifest = this.#manifests.get(hostId);
		if (manifest === undefined) return undefined;
		return {
			hostId: manifest.hostId,
			mcp: { ...manifest.mcp },
			skills: manifest.skills,
			subagents: manifest.subagents,
		};
	}
}

export const createHostCapabilityRegistry = (
	manifests: readonly IHostCapabilityManifest[] = [],
): HostCapabilityRegistry => new HostCapabilityRegistry(manifests);
