/**
import type { IAgentDescriptor } from '../../contracts/interfaces/agent-descriptor.interface';
 * f00084 S3 + f00088 S3 — read the live `agent-catalog.generated.json`
 * and produce the canonical set of `.github/agents/mcp-vertex-<role>.agent.md`
 * files.
 *
 * The catalog is the source of truth for `name`, `description`, and the
 * `tools` list of every agent. The module degrades gracefully when the
 * catalog is missing: it falls back to a hardcoded set of 5 canonical
 * roles (locale-keyed; English + Spanish today) so the bootstrap never
 * silently produces nothing.
 *
 * f00088 S3: the fallback agents are now keyed by locale (English is the
 * canonical set; Spanish preserved for backwards compatibility), and
 * `loadAgentDescriptors` accepts an `options.namespacePrefix` so the
 * fallback tools match whatever the operator's running server actually
 * exposes (instead of the hardcoded `mcp-vertex_*` from f00084 S3).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

;

/**
 * f00088 S3: locale-keyed fallback agents. Adding a new locale is one
 * entry; missing locales fall back to the English set. The English set
 * is the canonical source of truth — every other locale mirrors it
 * until a translator fills the gap.
 */
const FALLBACK_AGENTS_BY_LOCALE: Readonly<
	Record<string, readonly IAgentDescriptor[]>
> = {
	en: [
		{
			role: 'orchestrator',
			description: 'Multi-agent orchestrator for mcp-vertex',
			tools: [
				'PROP_proposals_auto_work',
				'PROP_proposals_compact_status',
				'PROP_proposals_proposal_board',
			],
			body:
				'For implementation tasks, delegate to mcp-vertex via auto_work.\n' +
				'For swarm status, use compact_status or proposal_board.',
		},
		{
			role: 'proposal-guardian',
			description: 'Proposal hygiene and planning',
			tools: [
				'PROP_proposals_create_proposal',
				'PROP_proposals_plan',
				'PROP_proposals_proposal_adopt',
			],
			body:
				'Create proposals before implementing. Run plan to validate slice\n' +
				'disjointness. Use proposal_adopt to register existing folders.',
		},
		{
			role: 'technical-investigator',
			description: 'Focused technical investigation',
			tools: [
				'PROP_proposals_delegate',
				'PROP_search_search',
				'PROP_docs_docs_read',
			],
			body:
				'Investigate workspace code using mcp-vertex tools.\n' +
				'For deep analysis, prefer delegate with agent=technical_investigator.',
		},
		{
			role: 'implementation-runner',
			description: 'Slice executor (atomic writes with locks)',
			tools: ['PROP_fs_write', 'PROP_fs_read', 'PROP_search_search'],
			body:
				'Implement isolated slices. Before writing, verify no other\n' +
				'agent holds the file lock. Use fs_write with createDirs=true.',
		},
		{
			role: 'delivery-verifier',
			description: 'Acceptance and gates verifier',
			tools: [
				'PROP_quality_run_quality',
				'PROP_proposals_proposal_review',
			],
			body:
				'Verify acceptance criteria for each slice. Run quality_run_quality\n' +
				'before approving. Use proposal_review with approve only when the slice passes gates.',
		},
	],
	es: [
		{
			role: 'orchestrator',
			description: 'Orquestador multi-agente de mcp-vertex',
			tools: [
				'PROP_proposals_auto_work',
				'PROP_proposals_compact_status',
				'PROP_proposals_proposal_board',
			],
			body:
				'Para tareas de implementación, delega a mcp-vertex usando auto_work.\n' +
				'Para ver el estado del swarm, usa compact_status o proposal_board.',
		},
		{
			role: 'proposal-guardian',
			description: 'Higiene y planificación de propuestas',
			tools: [
				'PROP_proposals_create_proposal',
				'PROP_proposals_plan',
				'PROP_proposals_proposal_adopt',
			],
			body:
				'Crea propuestas antes de implementar. Ejecuta plan para validar\n' +
				'disjointness de slices. Usa proposal_adopt para dar de alta carpetas existentes.',
		},
		{
			role: 'technical-investigator',
			description: 'Investigación técnica focalizada',
			tools: [
				'PROP_proposals_delegate',
				'PROP_search_search',
				'PROP_docs_docs_read',
			],
			body:
				'Investiga código del workspace usando las tools de mcp-vertex.\n' +
				'Para análisis profundo, prefiere delegate con agent=technical_investigator.',
		},
		{
			role: 'implementation-runner',
			description: 'Ejecutor de slices (escritura atómica con locks)',
			tools: ['PROP_fs_write', 'PROP_fs_read', 'PROP_search_search'],
			body:
				'Implementa slices aislados. Antes de escribir, verifica que ningún\n' +
				'otro agente tiene el lock del archivo. Usa fs_write con createDirs=true.',
		},
		{
			role: 'delivery-verifier',
			description: 'Verificador de aceptación y gates',
			tools: [
				'PROP_quality_run_quality',
				'PROP_proposals_proposal_review',
			],
			body:
				'Verifica acceptance criteria de cada slice. Ejecuta quality_run_quality\n' +
				'antes de aprobar. Usa proposal_review con approve solo si el slice pasa gates.',
		},
	],
};

/** Substitute the literal `PROP` with the resolved namespace prefix. */
const prefixTools = (
	descriptor: IAgentDescriptor,
	namespacePrefix: string,
): IAgentDescriptor => ({
	...descriptor,
	tools: descriptor.tools.map((tool) =>
		tool.startsWith('PROP_') ? `${namespacePrefix}_${tool.slice(5)}` : tool,
	),
});

const pickLocaleFallback = (locale: string): readonly IAgentDescriptor[] =>
	FALLBACK_AGENTS_BY_LOCALE[locale] ?? FALLBACK_AGENTS_BY_LOCALE.en ?? [];

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
 *
 * f00088 S3: accepts `namespacePrefix` (default `'mcp-vertex'`) and
 * `locale` (default `'en'`). The fallback path applies the prefix to
 * every `PROP_<tool>` placeholder so the rendered agent files match
 * what the operator's running server actually exposes.
 */
export const loadAgentDescriptors = async (
	workspace: string,
	options: { readonly namespacePrefix?: string; readonly locale?: string } = {},
): Promise<readonly IAgentDescriptor[]> => {
	const namespacePrefix = options.namespacePrefix ?? 'mcp-vertex';
	const locale = options.locale ?? 'en';
	const catalog = await tryReadCatalog(workspace);
	if (catalog === undefined) {
		return pickLocaleFallback(locale).map((d) =>
			prefixTools(d, namespacePrefix),
		);
	}
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
				`mcp-vertex agent: ${role}`,
			),
			tools: asStringArray(entry.tools),
			body: asString(entry.body, `mcp-vertex agent (${role}).`),
		});
	}
	if (out.length > 0) return out;
	return pickLocaleFallback(locale).map((d) =>
		prefixTools(d, namespacePrefix),
	);
};
