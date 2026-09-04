/**
 * f00084 S3 + f00088 S3 + x00202 S1 — read the live
 * `agent-catalog.generated.json` and produce the canonical set of
 * `.github/agents/delendai-<role>.agent.md` files.
 *
 * The catalog is the source of truth for `name` and `description`. The
 * module degrades gracefully when the catalog is missing (or has no
 * `agents` array — true for every project today: nothing in this repo
 * has ever written that key, so this fallback is not a rare edge case,
 * it is the ONLY path `delendai init` has ever exercised): it falls back to
 * a hardcoded set of 5 canonical roles (locale-keyed; English + Spanish
 * today) so the bootstrap never silently produces nothing.
 *
 * x00202 S1: the fallback bodies no longer hardcode plugin-specific tool
 * names (`auto_work`, `fs_write`, `search_search`, …) — several had
 * already rotted (`search_search` doesn't exist; the real tool is
 * `search`) and this was live-shipping to every `delendai init` adopter,
 * silently, because the "read the live catalog" branch above is dead
 * code. Bodies are now the same rot-proof redirector shape used
 * elsewhere in this repo (f00031): call `{PREFIX}_overview`, follow
 * `recommendedNextAction`, never restate a plugin's tool surface — the
 * ONE tool name safe to hardcode is `overview` itself, a core contract
 * every delendai server guarantees, unlike a plugin's tools.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IAgentDescriptor } from '../../contracts/interfaces/agent-descriptor.interface';

export type { IAgentDescriptor };

/** Substituted with the resolved namespace prefix in every fallback body. */
const PREFIX_TOKEN = '{PREFIX}';

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
			description: 'Multi-agent orchestrator for delendai',
			body: `This file is a thin redirector. The canonical contract lives in the \`delendai\` MCP server. On the first call of every turn, invoke \`${PREFIX_TOKEN}_overview\` and follow its \`recommendedNextAction\`. For non-trivial work, delegate through the swarm-coordination tools \`overview\` reports. Do not restate the workflow here — hardcoded tool names rot within days.`,
		},
		{
			role: 'proposal-guardian',
			description: 'Proposal hygiene and planning',
			body: `This file is a thin redirector. The canonical contract lives in the \`delendai\` MCP server. On the first call of every turn, invoke \`${PREFIX_TOKEN}_overview\` and follow its \`recommendedNextAction\` — it lists the live proposal/planning tools, which change often enough that a hardcoded list here would go stale. Do not restate the workflow here.`,
		},
		{
			role: 'technical-investigator',
			description: 'Focused technical investigation',
			body: `This file is a thin redirector. The canonical contract lives in the \`delendai\` MCP server. On the first call of every turn, invoke \`${PREFIX_TOKEN}_overview\` and follow its \`recommendedNextAction\`. Keep investigation narrow and hypothesis-driven; hand back the minimal actionable slice instead of expanding scope. Do not restate the workflow here.`,
		},
		{
			role: 'implementation-runner',
			description: 'Slice executor (atomic writes with locks)',
			body: `This file is a thin redirector. The canonical contract lives in the \`delendai\` MCP server. On the first call of every turn, invoke \`${PREFIX_TOKEN}_overview\` and follow its \`recommendedNextAction\`. Claim files before writing with the agent-lock tool \`overview\` reports; a hardcoded tool list here would go stale. Do not restate the workflow here.`,
		},
		{
			role: 'delivery-verifier',
			description: 'Acceptance and gates verifier',
			body: `This file is a thin redirector. The canonical contract lives in the \`delendai\` MCP server. On the first call of every turn, invoke \`${PREFIX_TOKEN}_overview\` and follow its \`recommendedNextAction\` — it lists the live quality-gate and proposal-review tools, which change often enough that a hardcoded list here would go stale. Do not restate the workflow here.`,
		},
	],
	es: [
		{
			role: 'orchestrator',
			description: 'Orquestador multi-agente de delendai',
			body: `Este archivo es un redirector mínimo. El contrato canónico vive en el servidor MCP \`delendai\`. En la primera llamada de cada turno, invoca \`${PREFIX_TOKEN}_overview\` y sigue su \`recommendedNextAction\`. Para trabajo no trivial, delega a través de las herramientas de coordinación de swarm que reporta \`overview\`. No repitas el flujo de trabajo aquí — los nombres de herramientas fijos quedan obsoletos en días.`,
		},
		{
			role: 'proposal-guardian',
			description: 'Higiene y planificación de propuestas',
			body: `Este archivo es un redirector mínimo. El contrato canónico vive en el servidor MCP \`delendai\`. En la primera llamada de cada turno, invoca \`${PREFIX_TOKEN}_overview\` y sigue su \`recommendedNextAction\` — enumera las herramientas de propuestas/planificación vigentes, que cambian con la frecuencia suficiente para que una lista fija aquí quede obsoleta. No repitas el flujo de trabajo aquí.`,
		},
		{
			role: 'technical-investigator',
			description: 'Investigación técnica focalizada',
			body: `Este archivo es un redirector mínimo. El contrato canónico vive en el servidor MCP \`delendai\`. En la primera llamada de cada turno, invoca \`${PREFIX_TOKEN}_overview\` y sigue su \`recommendedNextAction\`. Mantén la investigación acotada y guiada por hipótesis; entrega el slice accionable mínimo en vez de ampliar el alcance. No repitas el flujo de trabajo aquí.`,
		},
		{
			role: 'implementation-runner',
			description: 'Ejecutor de slices (escritura atómica con locks)',
			body: `Este archivo es un redirector mínimo. El contrato canónico vive en el servidor MCP \`delendai\`. En la primera llamada de cada turno, invoca \`${PREFIX_TOKEN}_overview\` y sigue su \`recommendedNextAction\`. Reclama los archivos antes de escribir con la herramienta de bloqueo que reporta \`overview\`; una lista fija aquí quedaría obsoleta. No repitas el flujo de trabajo aquí.`,
		},
		{
			role: 'delivery-verifier',
			description: 'Verificador de aceptación y gates',
			body: `Este archivo es un redirector mínimo. El contrato canónico vive en el servidor MCP \`delendai\`. En la primera llamada de cada turno, invoca \`${PREFIX_TOKEN}_overview\` y sigue su \`recommendedNextAction\` — enumera las herramientas de quality-gate y revisión de propuestas vigentes, que cambian con la frecuencia suficiente para que una lista fija aquí quede obsoleta. No repitas el flujo de trabajo aquí.`,
		},
	],
};

/** Substitutes `{PREFIX}` with the resolved namespace prefix in a descriptor's body. */
const applyNamespacePrefix = (
	descriptor: IAgentDescriptor,
	namespacePrefix: string,
): IAgentDescriptor => ({
	...descriptor,
	body: descriptor.body.replaceAll(PREFIX_TOKEN, namespacePrefix),
});

const pickLocaleFallback = (locale: string): readonly IAgentDescriptor[] =>
	FALLBACK_AGENTS_BY_LOCALE[locale] ?? FALLBACK_AGENTS_BY_LOCALE.en ?? [];

/**
 * Try to read the catalog at `<workspace>/docs/delendai/agent-catalog.generated.json`.
 * Returns the parsed JSON, or `undefined` when the file is missing or
 * malformed (the caller falls back to the hardcoded set).
 */
const tryReadCatalog = async (
	workspace: string,
): Promise<
	{ readonly agents: ReadonlyArray<Record<string, unknown>> } | undefined
> => {
	const path = join(workspace, 'docs/delendai/agent-catalog.generated.json');
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

/**
 * Read the catalog (if present) and return the descriptor list. The
 * returned array is the **only** truth — callers should not branch on
 * whether the catalog was read.
 *
 * f00088 S3: accepts `namespacePrefix` (default `'delendai'`) and
 * `locale` (default `'en'`). The fallback path applies the prefix to
 * the `{PREFIX}_overview` placeholder in every body so the rendered
 * agent files match what the operator's running server actually exposes.
 */
export const loadAgentDescriptors = async (
	workspace: string,
	options: {
		readonly namespacePrefix?: string;
		readonly locale?: string;
	} = {},
): Promise<readonly IAgentDescriptor[]> => {
	const namespacePrefix = options.namespacePrefix ?? 'delendai';
	const locale = options.locale ?? 'en';
	const catalog = await tryReadCatalog(workspace);
	if (catalog === undefined) {
		return pickLocaleFallback(locale).map((d) =>
			applyNamespacePrefix(d, namespacePrefix),
		);
	}
	const out: IAgentDescriptor[] = [];
	for (const entry of catalog.agents) {
		const name = asString(entry.name);
		if (name.length === 0) continue;
		const role = slugify(name.replace(/^delendai-/, ''));
		if (role.length === 0) continue;
		out.push({
			role,
			description: asString(entry.description, `delendai agent: ${role}`),
			body: asString(entry.body, `delendai agent (${role}).`),
		});
	}
	if (out.length > 0) return out;
	return pickLocaleFallback(locale).map((d) =>
		applyNamespacePrefix(d, namespacePrefix),
	);
};
