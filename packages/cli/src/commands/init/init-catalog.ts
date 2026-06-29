/**
 * f00084 S3 — read the live `agent-catalog.generated.json` and produce
 * the canonical set of `.github/agents/mcp-vertex-<role>.agent.md` files.
 *
 * The catalog is the source of truth for `name`, `description`, and the
 * `tools` list of every agent. The module degrades gracefully when the
 * catalog is missing: it falls back to a hardcoded set of 5 canonical
 * roles so the bootstrap never silently produces nothing.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type IAgentDescriptor = {
	readonly role: string;
	readonly description: string;
	readonly tools: readonly string[];
	readonly body: string;
};

const FALLBACK_AGENTS: readonly IAgentDescriptor[] = [
	{
		role: 'orchestrator',
		description: 'Orquestador multi-agente de mcp-vertex',
		tools: [
			'mcp-vertex_proposals_auto_work',
			'mcp-vertex_proposals_compact_status',
			'mcp-vertex_proposals_proposal_board',
		],
		body:
			'Para tareas de implementación, delega a mcp-vertex usando auto_work.\n' +
			'Para ver el estado del swarm, usa compact_status o proposal_board.',
	},
	{
		role: 'proposal-guardian',
		description: 'Higiene y planificación de propuestas',
		tools: [
			'mcp-vertex_proposals_create_proposal',
			'mcp-vertex_proposals_plan',
			'mcp-vertex_proposals_proposal_adopt',
		],
		body:
			'Crea propuestas antes de implementar. Ejecuta plan para validar\n' +
			'disjointness de slices. Usa proposal_adopt para dar de alta carpetas existentes.',
	},
	{
		role: 'technical-investigator',
		description: 'Investigación técnica focalizada',
		tools: [
			'mcp-vertex_proposals_delegate',
			'mcp-vertex_search_search',
			'mcp-vertex_docs_docs_read',
		],
		body:
			'Investiga código del workspace usando las tools de mcp-vertex.\n' +
			'Para análisis profundo, prefiere delegate con agent=technical_investigator.',
	},
	{
		role: 'implementation-runner',
		description: 'Ejecutor de slices (escritura atómica con locks)',
		tools: [
			'mcp-vertex_fs_write',
			'mcp-vertex_fs_read',
			'mcp-vertex_search_search',
		],
		body:
			'Implementa slices aislados. Antes de escribir, verifica que ningún\n' +
			'otro agente tiene el lock del archivo. Usa fs_write con createDirs=true.',
	},
	{
		role: 'delivery-verifier',
		description: 'Verificador de aceptación y gates',
		tools: [
			'mcp-vertex_quality_run_quality',
			'mcp-vertex_proposals_proposal_review',
		],
		body:
			'Verifica acceptance criteria de cada slice. Ejecuta quality_run_quality\n' +
			'antes de aprobar. Usa proposal_review con approve solo si el slice pasa gates.',
	},
];

/**
 * Try to read the catalog at `<workspace>/docs/mcp-vertex/agent-catalog.generated.json`.
 * Returns the parsed JSON, or `undefined` when the file is missing or
 * malformed (the caller falls back to the hardcoded set).
 */
const tryReadCatalog = async (
	workspace: string,
): Promise<
	{ readonly agents: ReadonlyArray<Record<string, unknown>> } | undefined
> => {
	const path = join(
		workspace,
		'docs/mcp-vertex/agent-catalog.generated.json',
	);
	if (!existsSync(path)) return undefined;
	try {
		const raw = await readFile(path, 'utf8');
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const agents = parsed.agents;
		if (!Array.isArray(agents)) return undefined;
		return { agents: agents as ReadonlyArray<Record<string, unknown>> };
	} catch {
		return undefined;
	}
};

const slugify = (name: string): string =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);

const asString = (v: unknown, fallback = ''): string =>
	typeof v === 'string' ? v : fallback;

const asStringArray = (v: unknown): readonly string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * Read the catalog (if present) and return the descriptor list. The
 * returned array is the **only** truth — callers should not branch on
 * whether the catalog was read.
 */
export const loadAgentDescriptors = async (
	workspace: string,
): Promise<readonly IAgentDescriptor[]> => {
	const catalog = await tryReadCatalog(workspace);
	if (catalog === undefined) return FALLBACK_AGENTS;
	const out: IAgentDescriptor[] = [];
	for (const entry of catalog.agents) {
		const name = asString(entry.name);
		if (name.length === 0) continue;
		const role = slugify(name.replace(/^mcp-vertex-/, ''));
		if (role.length === 0) continue;
		out.push({
			role,
			description: asString(
				entry.description,
				`Agente mcp-vertex: ${role}`,
			),
			tools: asStringArray(entry.tools),
			body: asString(entry.body, `Agente mcp-vertex (${role}).`),
		});
	}
	return out.length > 0 ? out : FALLBACK_AGENTS;
};
