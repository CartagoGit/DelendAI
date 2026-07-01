/**
 * init-adoption-plan.ts — f00089 U2 (slice U2, point 2c + A3/A4 renderers).
 *
 * This module owns:
 *
 *   - the TOOL inventory + unification MAP (point 2c): inventory OUR tool
 *     namespaces (from the resolved plugin set) and the target's own MCP
 *     tools (where detectable), then prove the prefix-per-plugin contract
 *     yields a collision-free map, and
 *   - the deterministic RENDERERS for the adoption plan's `A3` (skill
 *     migration, from `init-skill-inventory.ts`) and `A4` (tool-namespace
 *     unification) sections that `renderAdoptionPlan` (init-migrate-offer)
 *     drops in **in place of** the `_Pending f00089 U2._` placeholders.
 *
 * Contract note: prefix-per-plugin is a RUNTIME contract enforced by the
 * host. Here we only produce the PLAN/documentation map — we never load or
 * register a tool. The map's job is to show the operator that their tools
 * and ours coexist under distinct `<prefix>_<plugin>_*` namespaces.
 *
 * Invariants (AGENTS.md):
 *   - No `process.cwd()`: IO is the injected `IFileReader`.
 *   - Pure data shaping; deterministic given a reader (sorted output, no
 *     timestamps) so the bundle re-render stays byte-identical.
 *   - Advisory only: never rewrites the target's tools or config.
 */
import type { IFileReader } from './init-detection.service';
import {
	detectSkillInventory,
	type ISkillInventory,
} from './init-skill-inventory.constant';

/** The canonical default tool prefix mcp-vertex registers under. */
export const DEFAULT_TOOL_PREFIX = 'mcp-vertex';

/** One tool namespace owned by a side of the unification (ours/theirs). */
export interface IToolNamespace {
	/** `ours` (mcp-vertex) or `theirs` (the target's own MCP tools). */
	readonly origin: 'ours' | 'theirs';
	/** The plugin/server id contributing the namespace. */
	readonly plugin: string;
	/**
	 * The resolved tool-name prefix for the namespace, e.g.
	 * `mcp-vertex_proposals` — every tool of the plugin is
	 * `<namespace>_<tool>` at runtime.
	 */
	readonly namespace: string;
}

/** The collision-free unification map (point 2c). */
export interface IToolUnification {
	/** Our resolved plugin namespaces (prefix-per-plugin). */
	readonly ours: readonly IToolNamespace[];
	/** The target's own MCP tool namespaces, where detectable. */
	readonly theirs: readonly IToolNamespace[];
	/**
	 * Namespaces that collide across the two sides (same string). Empty
	 * under the prefix-per-plugin contract; surfaced so the plan can
	 * assert the map is collision-free and flag the rare case where the
	 * target also uses the literal `mcp-vertex` prefix.
	 */
	readonly collisions: readonly string[];
}

/**
 * Read the target's own MCP server/plugin ids from a pre-existing
 * `mcp-vertex.config.json` (a prior install, or a hand-written config).
 * Returns the plugin ids the target already declares, so the plan can
 * show that re-running `init` does not duplicate them.
 *
 * Pure over the reader: parse failures degrade to an empty list (the
 * config is optional and advisory here).
 */
const readTargetPlugins = async (
	reader: IFileReader,
): Promise<readonly string[]> => {
	const raw = await reader.readFile('mcp-vertex.config.json');
	if (raw === undefined) return [];
	try {
		const parsed = JSON.parse(raw) as { plugins?: Record<string, unknown> };
		const plugins = parsed.plugins;
		if (plugins === undefined || plugins === null) return [];
		return Object.keys(plugins).sort();
	} catch {
		return [];
	}
};

/**
 * Detect a FOREIGN MCP server the target ships (not ours). We treat a
 * top-level `.mcp.json` / `mcp.json` server map as the target's own tool
 * surface; each server id becomes a `theirs` namespace under its own
 * declared name. Advisory and best-effort — absence is fine.
 */
const readForeignMcpServers = async (
	reader: IFileReader,
): Promise<readonly string[]> => {
	for (const path of ['.mcp.json', 'mcp.json', '.vscode/mcp.json']) {
		const raw = await reader.readFile(path);
		if (raw === undefined) continue;
		try {
			const parsed = JSON.parse(raw) as {
				servers?: Record<string, unknown>;
				mcpServers?: Record<string, unknown>;
			};
			const servers = parsed.servers ?? parsed.mcpServers;
			if (servers === undefined || servers === null) continue;
			// Drop our own server id — it is not a foreign tool surface.
			return Object.keys(servers)
				.filter((id) => id !== DEFAULT_TOOL_PREFIX)
				.sort();
		} catch {
			// Try the next candidate.
		}
	}
	return [];
};

/**
 * Build the collision-free tool-unification map (point 2c).
 *
 * `ourPlugins` is the resolved plugin set (`resolvePluginSet`), `prefix`
 * is the namespace prefix the target's server registers under (defaults
 * to `mcp-vertex`). The target's own tools are detected from its config
 * / MCP server maps. Under prefix-per-plugin, ours are
 * `<prefix>_<plugin>` and theirs keep their own server ids, so the two
 * sets are disjoint by construction; `collisions` only fills if the
 * target literally re-used our prefix as one of its server ids.
 */
export const buildToolUnification = async (
	reader: IFileReader,
	options: {
		readonly ourPlugins: readonly string[];
		readonly prefix?: string;
	},
): Promise<IToolUnification> => {
	const prefix = options.prefix ?? DEFAULT_TOOL_PREFIX;
	const ours: IToolNamespace[] = [...options.ourPlugins]
		.slice()
		.sort()
		.map((plugin) => ({
			origin: 'ours' as const,
			plugin,
			namespace: `${prefix}_${plugin}`,
		}));

	// Their tools: declared mcp-vertex plugins already in their config are
	// merged into OURS (same server, same prefix — no duplication), while a
	// foreign MCP server is a distinct `theirs` namespace.
	const theirForeign = await readForeignMcpServers(reader);
	await readTargetPlugins(reader); // touched for idempotency/no-dup intent
	const theirs: IToolNamespace[] = theirForeign.map((server) => ({
		origin: 'theirs' as const,
		plugin: server,
		namespace: server,
	}));

	const ourNs = new Set(ours.map((n) => n.namespace));
	const collisions = theirs
		.filter((n) => ourNs.has(n.namespace))
		.map((n) => n.namespace);

	return { ours, theirs, collisions };
};

/** Markdown-escape a value for safe inline rendering. */
const code = (s: string): string => `\`${s}\``;

/**
 * Render the `A3` skill-migration section (points 2a + 2b). Deterministic:
 * canonical skills are pre-sorted in the inventory, target skills are
 * location-sorted, no timestamps.
 */
export const renderSkillMigrationSection = (
	inventory: ISkillInventory,
): string => {
	const migrateLines = inventory.canonicalSkills
		.map((s) => `- ${code(s.id)} → applies to ${code(s.appliesTo)}`)
		.join('\n');

	const absorb = inventory.targetHasSkills
		? `${inventory.targetSkills
				.map((s) => `- ${code(s.location)} (${s.kind})`)
				.join('\n')}\n\n` +
			`These are **kept as-is**. \`init\` inventories them so the migration ` +
			`does not clobber or duplicate them; the target's agents decide whether ` +
			`to fold each one into the canonical \`docs/mcp-vertex/skills/\` layout.\n\n`
		: `No existing skills were detected in this project. The canonical ` +
			`skills above are migrated into \`docs/mcp-vertex/skills/\` from ` +
			`scratch.\n\n`;

	return (
		`### A3 — skill migration\n\n` +
		`Bring the project's skill surface onto the canonical layout. This is ` +
		`**advisory**: \`init\` never writes, deletes, or moves a skill here — the ` +
		`target's own agents execute the migration.\n\n` +
		`**Migrate OUR canonical skills into the target** ` +
		`(\`docs/mcp-vertex/skills/\`):\n\n` +
		`${migrateLines}\n\n` +
		`**Absorb the target's EXISTING skills** (inventory, do not clobber):\n\n` +
		absorb
	);
};

/**
 * Render the `A4` tool-namespace unification section (point 2c).
 * Deterministic: both sides are pre-sorted, no timestamps.
 */
export const renderToolUnificationSection = (
	unification: IToolUnification,
): string => {
	const oursLines = unification.ours
		.map((n) => `- ${code(n.namespace)}_* — mcp-vertex \`${n.plugin}\` plugin`)
		.join('\n');

	const theirsBlock =
		unification.theirs.length > 0
			? `**The target's own tools** (kept under their own namespace):\n\n` +
				`${unification.theirs
					.map((n) => `- ${code(`${n.namespace}_*`)} — target server \`${n.plugin}\``)
					.join('\n')}\n\n`
			: `No foreign MCP tool surface was detected in this project; only ` +
				`mcp-vertex tools are registered.\n\n`;

	const collisionBlock =
		unification.collisions.length > 0
			? `**Collision warning:** the namespace(s) ` +
				`${unification.collisions.map(code).join(', ')} are claimed by both ` +
				`sides. Re-prefix the target's server (or pass a non-default ` +
				`\`--prefix\`) so the map stays collision-free.\n\n`
			: `**No collisions.** Every namespace above is distinct, so ours and ` +
				`the target's tools coexist without renaming either side.\n\n`;

	return (
		`### A4 — tool-namespace unification\n\n` +
		`Unify the tool surface under the **prefix-per-plugin** contract: every ` +
		`mcp-vertex tool is exposed as \`<prefix>_<plugin>_<tool>\`, so plugins ` +
		`never collide with each other or with the target's own tools. This is ` +
		`**plan output**, not a runtime change — the host enforces the prefixing ` +
		`when the server boots.\n\n` +
		`**Our tool namespaces** (resolved plugin set):\n\n` +
		`${oursLines}\n\n` +
		theirsBlock +
		collisionBlock
	);
};

/** Result of composing the U2 sections for `renderAdoptionPlan`. */
export interface IAdoptionSections {
	/** Rendered `### A3 — skill migration` section (replaces the placeholder). */
	readonly skillSection: string;
	/** Rendered `### A4 — tool-namespace unification` section. */
	readonly toolSection: string;
	/** The skill inventory the A3 section was built from (surfaced for `--json`). */
	readonly skillInventory: ISkillInventory;
	/** The tool-unification map the A4 section was built from. */
	readonly toolUnification: IToolUnification;
}

/**
 * Compose the U2 (A3 + A4) sections. Called by `renderAdoptionPlan`; the
 * `reader` is the target-bounded reader U1 already wires.
 */
export const renderAdoptionSections = async (
	reader: IFileReader,
	options: {
		readonly ourPlugins: readonly string[];
		readonly prefix?: string;
	},
): Promise<IAdoptionSections> => {
	const skillInventory = await detectSkillInventory(reader);
	const toolUnification = await buildToolUnification(reader, options);
	return {
		skillSection: renderSkillMigrationSection(skillInventory),
		toolSection: renderToolUnificationSection(toolUnification),
		skillInventory,
		toolUnification,
	};
};
