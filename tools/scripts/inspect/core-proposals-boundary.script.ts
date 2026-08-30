#!/usr/bin/env bun

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export type TCouplingCategory =
	| 'import'
	| 'path'
	| 'plugin-name'
	| 'type'
	| 'message'
	| 'index-access';

export type TProposedDestination =
	| 'contract'
	| 'adapter'
	| 'composition'
	| 'intentional-compat';

export interface IBoundaryFindingRule {
	readonly file: string;
	readonly symbolOrLiteral: string;
	readonly category: TCouplingCategory;
	readonly destination: TProposedDestination;
	readonly needle: string;
	readonly note: string;
}

export interface IBoundaryFinding extends IBoundaryFindingRule {
	readonly occurrences: number;
	readonly lines: readonly number[];
}

export interface IBoundaryCandidate {
	readonly file: string;
	readonly line: number;
	readonly content: string;
}

export interface IBoundaryScanResult {
	readonly findings: readonly IBoundaryFinding[];
	readonly unclassified: readonly IBoundaryCandidate[];
	readonly missing: readonly IBoundaryFindingRule[];
	readonly scannedFiles: number;
}

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const DOC_PATH = join(
	REPO_ROOT,
	'docs/mcp-vertex/CORE-PROPOSALS-BOUNDARY-INVENTORY.md',
);

export const INVENTORY_RULES: readonly IBoundaryFindingRule[] = [
	{
		file: 'packages/core/src/public/index.ts',
		symbolOrLiteral: '../lib/proposals/validate-evidence.schema',
		category: 'path',
		destination: 'contract',
		needle: "} from '../lib/proposals/validate-evidence.schema';",
		note: 'El barrel publico reexporta un schema desde un subpath proposals interno del core.',
	},
	{
		file: 'packages/core/src/public/index.ts',
		symbolOrLiteral: 'ACTIONABLE_PROPOSAL_STATUSES',
		category: 'type',
		destination: 'contract',
		needle: 'ACTIONABLE_PROPOSAL_STATUSES,',
		note: 'El barrel publico reexporta el vocabulario del workflow con nombre proposals.',
	},
	{
		file: 'packages/core/src/public/index.ts',
		symbolOrLiteral: 'PROPOSAL_STATUS_VALUES',
		category: 'type',
		destination: 'contract',
		needle: 'PROPOSAL_STATUS_VALUES,',
		note: 'La lista publica de estados usa nomenclatura proposals.',
	},
	{
		file: 'packages/core/src/public/index.ts',
		symbolOrLiteral: 'IProposalSummary',
		category: 'type',
		destination: 'contract',
		needle: 'IProposalSummary,',
		note: 'Los consumidores externos siguen importando el DTO nominal de proposals desde core/public.',
	},
	{
		file: 'packages/core/src/public/index.ts',
		symbolOrLiteral: 'ProposalStatus',
		category: 'type',
		destination: 'contract',
		needle: 'ProposalStatus,',
		note: 'El estado del workflow se exporta con nombre proposals desde el barrel estable.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
		symbolOrLiteral: 'proposals store managed by the mcp-vertex',
		category: 'message',
		destination: 'adapter',
		needle: 'This folder is the proposals store managed by the mcp-vertex',
		note: 'El estimador de escritura documenta el store de proposals como estructura propia.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
		symbolOrLiteral: '`proposals` plugin',
		category: 'plugin-name',
		destination: 'adapter',
		needle: '`proposals` plugin. Each proposal is one markdown file with',
		note: 'La ayuda bootstrap del store sigue nombrando el plugin concreto.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
		symbolOrLiteral: 'create_proposal',
		category: 'message',
		destination: 'adapter',
		needle: 'Create proposals with the `create_proposal` tool (it allocates the',
		note: 'La ayuda del store remite a una tool de proposals concreta.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
		symbolOrLiteral: 'sync_proposals inventory message',
		category: 'message',
		destination: 'adapter',
		needle: 'index is regenerated at any time via `sync_proposals`.',
		note: 'La ayuda del store referencia el regenerado del indice del plugin.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
		symbolOrLiteral: 'docsDir/proposals/.gitkeep',
		category: 'path',
		destination: 'adapter',
		needle: 'path: `${docsDir}/proposals/${folder}/.gitkeep`,',
		note: 'El layout concreto del store de proposals se materializa en el core.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
		symbolOrLiteral: 'docsDir/proposals/README.md',
		category: 'path',
		destination: 'adapter',
		needle: '{ path: `${docsDir}/proposals/README.md`, content: PROPOSALS_README },',
		note: 'El README del store sigue generado por una ruta hardcodeada de proposals.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
		symbolOrLiteral: 'Bootstrapped proposals store files',
		category: 'message',
		destination: 'adapter',
		needle: 'Bootstrapped proposals store files (.gitkeep per status + README).',
		note: 'El resumen de escritura expone el store de proposals como artefacto del core.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project.tool.ts',
		symbolOrLiteral: 'buildProposalsStoreFiles',
		category: 'import',
		destination: 'adapter',
		needle: 'buildProposalsStoreFiles,',
		note: 'El bootstrap del store de proposals no debe seguir ensamblado en el core.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project.tool.ts',
		symbolOrLiteral: 'config.plugins.proposals',
		category: 'plugin-name',
		destination: 'adapter',
		needle: 'config.plugins.proposals ??= { options: {} };',
		note: 'La siembra del plugin debe vivir en un adaptador de adopcion.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project.tool.ts',
		symbolOrLiteral: 'proposals + issues plugins',
		category: 'message',
		destination: 'adapter',
		needle: 'the config loads the proposals + issues plugins;',
		note: 'El texto visible al host sigue describiendo una relacion de plugins concreta.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project.tool.ts',
		symbolOrLiteral: 'sync_proposals',
		category: 'message',
		destination: 'adapter',
		needle: 'sync_proposals',
		note: 'La instruccion residual debe salir del adaptador del workflow.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project.tool.ts',
		symbolOrLiteral: 'bootstrap the proposals store',
		category: 'message',
		destination: 'adapter',
		needle: 'bootstrap the proposals store + generate agents/instructions',
		note: 'La descripcion publica del tool sigue anunciando el store de proposals como responsabilidad del core.',
	},
	{
		file: 'packages/core/src/lib/adopt/adopt-project.tool.ts',
		symbolOrLiteral: 'proposals-store bootstrap',
		category: 'message',
		destination: 'adapter',
		needle: 'the proposals-store bootstrap, and the host agent/instructions scaffold',
		note: 'La ayuda del tool mantiene el bootstrap del store como detalle del core.',
	},
	{
		file: 'packages/core/src/lib/adopt/adoption-assessment.service.ts',
		symbolOrLiteral:
			'Estimated adopt_project write surface ... proposals store',
		category: 'message',
		destination: 'adapter',
		needle: 'Estimated adopt_project write surface (config + agents/instructions + proposals store).',
		note: 'La evaluacion de adopcion sigue contabilizando proposals store como responsabilidad del core.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'readProposalsIndex',
		category: 'import',
		destination: 'composition',
		needle: "import { readProposalsIndex } from './read-proposals-index';",
		note: 'La composicion actual importa el lector concreto del indice de proposals.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'proposalSummaries type',
		category: 'type',
		destination: 'composition',
		needle: 'readonly proposalSummaries: Awaited<ReturnType<typeof readProposalsIndex>>;',
		note: 'El resultado expuesto por el ensamblado aun tiene vocabulario de proposals.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'readProposalsIndex()',
		category: 'index-access',
		destination: 'composition',
		needle: 'const proposalSummaries = await readProposalsIndex(',
		note: 'El overview del core sigue leyendo el indice del plugin en tiempo de ensamblado.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'isLoaded proposals',
		category: 'plugin-name',
		destination: 'composition',
		needle: "const hasProposals = isLoaded('proposals');",
		note: 'La siguiente accion recomendada aun depende del nombre del plugin.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'config + agents + proposals store',
		category: 'message',
		destination: 'adapter',
		needle: 'config + agents + proposals store',
		note: 'El mensaje de adopcion expone el bootstrap del store como detalle del core.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'proposals_auto_work',
		category: 'message',
		destination: 'composition',
		needle: 'proposals_auto_work',
		note: 'La recomendacion publica sigue nombrando directamente la tool del plugin.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'do not hand-create proposals',
		category: 'message',
		destination: 'composition',
		needle: 'do not hand-create proposals or docs outside the server workflow.',
		note: 'El mensaje de mismatch sigue mencionando el layout de proposals desde el core.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-skills.ts',
		symbolOrLiteral: 'proposalSummaries value',
		category: 'type',
		destination: 'composition',
		needle: 'proposalSummaries,',
		note: 'La composicion sigue propagando proposalSummaries a la capa superior.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble.ts',
		symbolOrLiteral: 'proposalSummaries into CLI assembly',
		category: 'type',
		destination: 'composition',
		needle: 'proposalSummaries,',
		note: 'El ensamblado CLI sigue transportando proposalSummaries como parte del estado.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-core-tools.ts',
		symbolOrLiteral: "TSkillsPhase['proposalSummaries']",
		category: 'type',
		destination: 'composition',
		needle: "readonly proposalSummaries: TSkillsPhase['proposalSummaries'];",
		note: 'La fase de ensamblado superior todavia transporta proposalSummaries.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-core-tools.ts',
		symbolOrLiteral: 'proposalSummaries',
		category: 'type',
		destination: 'composition',
		needle: 'proposalSummaries,',
		note: 'La composicion del catalogo inyecta proposalSummaries de forma nominal.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-core-tools.ts',
		symbolOrLiteral: 'proposals: () => proposalSummaries',
		category: 'type',
		destination: 'composition',
		needle: 'proposals: () => proposalSummaries,',
		note: 'La fuente del catalogo sigue cableada con el nombre proposals.',
	},
	{
		file: 'packages/core/src/lib/cli/assemble-core-tools.ts',
		symbolOrLiteral: 'bootstraps the proposals',
		category: 'message',
		destination: 'adapter',
		needle: 'bootstraps the proposals',
		note: 'La ayuda de adopt_project describe todavia el bootstrap de proposals desde el core.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'IProposalSummary import',
		category: 'type',
		destination: 'contract',
		needle: "import type { IProposalSummary } from '../catalog/agent-discovery-types';",
		note: 'La forma publica del resumen de workflow aun esta nombrada como proposal.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'IProposalIndexFileEntry',
		category: 'type',
		destination: 'adapter',
		needle: 'interface IProposalIndexFileEntry {',
		note: 'El schema concreto del indice pertenece al adaptador de proposals.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'IProposalIndexFile',
		category: 'type',
		destination: 'adapter',
		needle: 'interface IProposalIndexFile {',
		note: 'El contenedor del indice sigue definido en el core.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'proposals[]',
		category: 'index-access',
		destination: 'adapter',
		needle: 'readonly proposals?: readonly IProposalIndexFileEntry[];',
		note: 'El payload cacheado del plugin sigue interpretado directamente por el core.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'proposalKindFromId',
		category: 'type',
		destination: 'adapter',
		needle: "export const proposalKindFromId = (id: string): IProposalSummary['kind'] => {",
		note: 'La semantica de ids de proposals no deberia residir en el core.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'normalizeProposalStatus',
		category: 'type',
		destination: 'adapter',
		needle: 'export const normalizeProposalStatus = (',
		note: 'La normalizacion del estado del workflow debe venir del adaptador.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: "IProposalSummary['status']",
		category: 'type',
		destination: 'contract',
		needle: "): IProposalSummary['status'] => {",
		note: 'La salida del normalizador sigue expresada con el tipo nominal de proposal.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'readProposalsIndex exported',
		category: 'index-access',
		destination: 'adapter',
		needle: 'export const readProposalsIndex = async (',
		note: 'El adaptador del indice sigue residiendo fisicamente dentro del core.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'Promise<IProposalSummary[]>',
		category: 'type',
		destination: 'contract',
		needle: '): Promise<readonly IProposalSummary[]> => {',
		note: 'La firma del lector devuelve todavia el DTO nominal de proposals.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'parsed: IProposalIndexFile',
		category: 'type',
		destination: 'adapter',
		needle: 'let parsed: IProposalIndexFile;',
		note: 'El core sigue tipando internamente el payload del indice del plugin.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'JSON.parse(raw) as IProposalIndexFile',
		category: 'type',
		destination: 'adapter',
		needle: 'parsed = JSON.parse(raw) as IProposalIndexFile;',
		note: 'La deserializacion del indice concreto sigue ocurriendo en el core.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'proposals/index.json',
		category: 'index-access',
		destination: 'adapter',
		needle: "join(workspaceRoot, cacheDir, 'proposals', 'index.json'),",
		note: 'La ruta del indice cacheado es propia del plugin.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'Array.isArray(parsed.proposals)',
		category: 'index-access',
		destination: 'adapter',
		needle: 'if (!Array.isArray(parsed.proposals)) return [];',
		note: 'La validacion estructural sigue mirando directamente la clave proposals.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'parsed.proposals',
		category: 'index-access',
		destination: 'adapter',
		needle: 'return parsed.proposals',
		note: 'La lectura del array de proposals sigue acoplada a la forma interna del indice.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: "Required<Pick<IProposalIndexFileEntry, 'id'>>",
		category: 'type',
		destination: 'adapter',
		needle: "): entry is Required<Pick<IProposalIndexFileEntry, 'id'>> &",
		note: 'El narrowing del payload sigue nombrando el schema concreto del plugin.',
	},
	{
		file: 'packages/core/src/lib/cli/read-proposals-index.ts',
		symbolOrLiteral: 'IProposalIndexFileEntry => typeof entry.id',
		category: 'type',
		destination: 'adapter',
		needle: "IProposalIndexFileEntry => typeof entry.id === 'string',",
		note: 'El predicado de tipo sigue anclado al entry del indice de proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'CatalogSection.proposals',
		category: 'plugin-name',
		destination: 'intentional-compat',
		needle: "export type CatalogSection = 'tools' | 'skills' | 'proposals';",
		note: 'La API publica de descubrimiento ya expone proposals como seccion compatible.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'ProposalStatus',
		category: 'type',
		destination: 'contract',
		needle: 'export type ProposalStatus =',
		note: 'El resumen publico del workflow fija el vocabulario de estados de proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'IProposalSummary',
		category: 'type',
		destination: 'contract',
		needle: 'export interface IProposalSummary {',
		note: 'El DTO visible desde core aun esta modelado como proposal concreta.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'readonly status: ProposalStatus',
		category: 'type',
		destination: 'contract',
		needle: 'readonly status: ProposalStatus;',
		note: 'El DTO del workflow sigue exponiendo ProposalStatus en el core.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'counts.proposals',
		category: 'type',
		destination: 'intentional-compat',
		needle: 'readonly proposals: number;',
		note: 'El recuento publico conserva la clave proposals por compatibilidad.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'proposalStatusCounts',
		category: 'type',
		destination: 'contract',
		needle: 'readonly proposalStatusCounts: Readonly<Record<ProposalStatus, number>>;',
		note: 'El snapshot compacto expone contadores del workflow con nombre de proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'proposals: IProposalSummary[]',
		category: 'type',
		destination: 'contract',
		needle: 'readonly proposals: readonly IProposalSummary[];',
		note: 'El catalogo publica la lista como proposals en vez de workflow summaries.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'proposals(): IProposalSummary[]',
		category: 'type',
		destination: 'contract',
		needle: 'readonly proposals: () => readonly IProposalSummary[];',
		note: 'La fuente inyectable del catalogo conoce el nombre del dominio.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'PROPOSAL_STATUS_VALUES',
		category: 'type',
		destination: 'contract',
		needle: 'export const PROPOSAL_STATUS_VALUES: readonly ProposalStatus[] = [',
		note: 'Los estados se publican desde core como constante del dominio proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
		symbolOrLiteral: 'ACTIONABLE_PROPOSAL_STATUSES',
		category: 'type',
		destination: 'contract',
		needle: 'export const ACTIONABLE_PROPOSAL_STATUSES: readonly ProposalStatus[] = [',
		note: 'La accionabilidad del workflow esta fijada en el core con nombre proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'ACTIONABLE_PROPOSAL_STATUSES',
		category: 'type',
		destination: 'contract',
		needle: 'ACTIONABLE_PROPOSAL_STATUSES,',
		note: 'La politica de accionabilidad del workflow entra en el catalogo desde core.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'IProposalSummary import',
		category: 'type',
		destination: 'contract',
		needle: 'type IProposalSummary,',
		note: 'El constructor del catalogo recibe el resumen concreto de proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'PROPOSAL_STATUS_VALUES',
		category: 'type',
		destination: 'contract',
		needle: 'PROPOSAL_STATUS_VALUES,',
		note: 'El catalogo importa la lista nominal de estados de proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'proposal: IProposalSummary',
		category: 'type',
		destination: 'contract',
		needle: 'proposal: IProposalSummary,',
		note: 'La clonacion del catalogo recibe el tipo nominal IProposalSummary.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: '): IProposalSummary => ({',
		category: 'type',
		destination: 'contract',
		needle: '): IProposalSummary => ({',
		note: 'La salida del clonador sigue fijada al DTO de proposal.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'sources.proposals()',
		category: 'type',
		destination: 'contract',
		needle: 'const allProposals = sortBy(sources.proposals(), (proposal) => proposal.id);',
		note: 'La fuente del catalogo sigue nombrando proposals como entidad primaria.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'proposalStatusCounts',
		category: 'type',
		destination: 'contract',
		needle: 'const proposalStatusCounts = Object.fromEntries(',
		note: 'Los contadores siguen codificados como proposalStatusCounts.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'PROPOSAL_STATUS_VALUES.map',
		category: 'type',
		destination: 'contract',
		needle: 'PROPOSAL_STATUS_VALUES.map((status) => [status, 0]),',
		note: 'El recuento de estados itera sobre la constante nominal de proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'Record<typeof PROPOSAL_STATUS_VALUES>',
		category: 'type',
		destination: 'contract',
		needle: ') as Record<(typeof PROPOSAL_STATUS_VALUES)[number], number>;',
		note: 'La forma del contador sigue tipada con PROPOSAL_STATUS_VALUES.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'proposalStatusCounts[proposal.status]',
		category: 'type',
		destination: 'contract',
		needle: 'proposalStatusCounts[proposal.status] += 1;',
		note: 'El agregado de estados usa proposalStatusCounts con el vocabulario del plugin.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'visibleProposals',
		category: 'type',
		destination: 'contract',
		needle: 'const visibleProposals =',
		note: 'El filtro de visibilidad sigue especializado en proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'ACTIONABLE_PROPOSAL_STATUSES.includes',
		category: 'type',
		destination: 'contract',
		needle: 'ACTIONABLE_PROPOSAL_STATUSES.includes(proposal.status),',
		note: 'La logica de visibilidad sigue dependiendo de actionable proposals.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'counts.proposals',
		category: 'type',
		destination: 'intentional-compat',
		needle: 'proposals: proposals.length,',
		note: 'El conteo publico mantiene la clave proposals por compatibilidad.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'proposalStatusCounts result',
		category: 'type',
		destination: 'contract',
		needle: 'proposalStatusCounts,',
		note: 'El snapshot devuelve proposalStatusCounts como parte del contrato publico.',
	},
	{
		file: 'packages/core/src/lib/catalog/agent-discovery-catalog.ts',
		symbolOrLiteral: 'proposals result',
		category: 'type',
		destination: 'intentional-compat',
		needle: 'proposals,',
		note: 'La propiedad proposals del snapshot se mantiene por compatibilidad del catalogo.',
	},
	{
		file: 'packages/core/src/lib/contracts/file-conventions.contract.ts',
		symbolOrLiteral: "folderRule('proposal', 'proposals')",
		category: 'path',
		destination: 'contract',
		needle: "const ProposalRule = folderRule('proposal', 'proposals');",
		note: 'La convencion de ficheros publica el plural proposals como layout nominal.',
	},
	{
		file: 'packages/core/src/lib/contracts/constants/token-budgets.constant.ts',
		symbolOrLiteral: "fixturePluginIds: ['proposals', 'memory']",
		category: 'plugin-name',
		destination: 'intentional-compat',
		needle: "fixturePluginIds: ['proposals', 'memory'],",
		note: 'Los fixtures de presupuesto siguen nombrando proposals como plugin representativo.',
	},
	{
		file: 'packages/core/src/lib/resources/agent-catalog-resource.ts',
		symbolOrLiteral: 'actionable proposals resource',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'Compact JSON discovery catalog for tools, skills and actionable proposals.',
		note: 'El recurso de catalogo documenta proposals en su resumen publico.',
	},
	{
		file: 'packages/core/src/lib/setup/setup-steps.ts',
		symbolOrLiteral: 'Load the host with proposals + issues',
		category: 'message',
		destination: 'adapter',
		needle: "title: 'Load the host with proposals + issues',",
		note: 'El checklist de setup sigue describiendo la pareja proposals + issues desde el core.',
	},
	{
		file: 'packages/core/src/lib/setup/setup-steps.ts',
		symbolOrLiteral: 'issues hard-depends on proposals',
		category: 'message',
		destination: 'adapter',
		needle: "detail: 'issues hard-depends on proposals; load both in the same set.',",
		note: 'La dependencia con issues sigue expresada en el texto de setup del core.',
	},
	{
		file: 'packages/core/src/lib/setup/setup-steps.ts',
		symbolOrLiteral: 'mcp-vertex --plugins=proposals,issues',
		category: 'plugin-name',
		destination: 'adapter',
		needle: "command: 'mcp-vertex --plugins=proposals,issues',",
		note: 'El comando sugerido fija el nombre del plugin proposals en el core.',
	},
	{
		file: 'packages/core/src/lib/knowledge/host-onboarding.knowledge.ts',
		symbolOrLiteral: 'docs/mcp-vertex/proposals/',
		category: 'path',
		destination: 'adapter',
		needle: 'docs/mcp-vertex/proposals/',
		note: 'La knowledge base de onboarding sigue senalando la ruta concreta del store proposals.',
	},
	{
		file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
		symbolOrLiteral: 'tools/skills/proposals',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'tools/skills/proposals you can use right now.',
		note: 'El prompt bootstrap menciona proposals como categoria publica visible al host.',
	},
	{
		file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
		symbolOrLiteral: 'catalog.proposals.length',
		category: 'type',
		destination: 'intentional-compat',
		needle: 'catalog.proposals.length === 0',
		note: 'La renderizacion del prompt sigue inspeccionando catalog.proposals.',
	},
	{
		file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
		symbolOrLiteral: 'catalog.proposals',
		category: 'type',
		destination: 'intentional-compat',
		needle: ': catalog.proposals',
		note: 'El prompt bootstrap sigue interpolando la lista nominal de proposals.',
	},
	{
		file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
		symbolOrLiteral: 'actionable proposals available right now',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'actionable proposals available right now.',
		note: 'La instruccion bootstrap publica proposals como unidad accionable.',
	},
	{
		file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
		symbolOrLiteral: 'Actionable proposals',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'Actionable proposals: ${actionable}',
		note: 'El resumen textual del prompt sigue nombrando actionable proposals.',
	},
	{
		file: 'packages/core/src/lib/bootstrap/build-blueprint.ts',
		symbolOrLiteral: "plugins.includes('proposals')",
		category: 'plugin-name',
		destination: 'composition',
		needle: "...(plugins.includes('proposals') ? SUBAGENT_SLOTS : []),",
		note: 'La composicion del blueprint activa subagentes segun el plugin proposals.',
	},
	{
		file: 'packages/core/src/lib/bootstrap/prompt-artifact-rules.ts',
		symbolOrLiteral: "plugins.includes('proposals') prompt rule",
		category: 'plugin-name',
		destination: 'composition',
		needle: "includeWhen: ({ plugins }) => plugins.includes('proposals'),",
		note: 'La inclusion de artefactos de prompt depende del nombre del plugin.',
	},
	{
		file: 'packages/core/src/lib/bootstrap/pattern-catalog.ts',
		symbolOrLiteral: "recommendedPlugins ['proposals', 'rules']",
		category: 'plugin-name',
		destination: 'composition',
		needle: "recommendedPlugins: ['proposals', 'rules'],",
		note: 'El catalogo de patrones sigue recomendando proposals desde el core.',
	},
	{
		file: 'packages/core/src/lib/bootstrap/pattern-catalog.ts',
		symbolOrLiteral: 'coordinate parallel work with the proposals plugin',
		category: 'message',
		destination: 'composition',
		needle: 'coordinate parallel work with the proposals plugin.',
		note: 'La descripcion del patron sigue anclada al plugin proposals.',
	},
	{
		file: 'packages/core/src/lib/bootstrap/body-content/prompt-bodies.ts',
		symbolOrLiteral: 'The proposals plugin is loaded',
		category: 'message',
		destination: 'composition',
		needle: 'The `proposals` plugin is loaded. Resolve the next proposal slice end-to-end:',
		note: 'El cuerpo del prompt cambia comportamiento segun proposals cargado.',
	},
	{
		file: 'packages/core/src/lib/bootstrap/derive-config.ts',
		symbolOrLiteral: 'proposal workflow (proposals + coordination)',
		category: 'message',
		destination: 'composition',
		needle: 'proposal workflow (proposals + coordination)',
		note: 'La racionalidad del preset swarm sigue describiendo proposals por nombre.',
	},
	{
		file: 'packages/core/src/lib/plugins/preset-derived.ts',
		symbolOrLiteral: 'preset includes proposals',
		category: 'plugin-name',
		destination: 'composition',
		needle: "'proposals',",
		note: 'El preset derivado materializa proposals en la composicion por defecto.',
	},
	{
		file: 'packages/core/src/lib/plugins/preset-catalog.ts',
		symbolOrLiteral: '{ plugin: proposals }',
		category: 'plugin-name',
		destination: 'composition',
		needle: "{ plugin: 'proposals' },",
		note: 'El catalogo de presets describe proposals como plugin concreto de composicion.',
	},
	{
		file: 'packages/core/src/lib/plugins/plugin-defaults.ts',
		symbolOrLiteral: 'pluginDefaults.proposals',
		category: 'plugin-name',
		destination: 'composition',
		needle: 'proposals: {',
		note: 'Los defaults de plugins reservan un bloque nominal para proposals.',
	},
	{
		file: 'packages/core/src/lib/plugins/plugin-defaults.ts',
		symbolOrLiteral: 'docs/proposals/retired/issues',
		category: 'path',
		destination: 'adapter',
		needle: "scaffoldDir: 'docs/proposals/retired/issues',",
		note: 'Los defaults de issues apuntan a un layout proposals concreto.',
	},
	{
		file: 'packages/core/src/lib/plugins/plugin-defaults.ts',
		symbolOrLiteral: 'docs/proposals/done/audits',
		category: 'path',
		destination: 'adapter',
		needle: "auditDir: 'docs/proposals/done/audits',",
		note: 'La ruta por defecto de auditorias sigue anclada al arbol proposals.',
	},
	{
		file: 'packages/core/src/lib/plugins/diagnose-workspace-layout.ts',
		symbolOrLiteral: 'proposals layout resolve under docsDir',
		category: 'message',
		destination: 'composition',
		needle: 'agent docs and the proposals layout resolve under it;',
		note: 'El diagnostico del workspace sigue asumiendo el layout proposals desde el core.',
	},
	{
		file: 'packages/core/src/lib/tools/overview-tool.ts',
		symbolOrLiteral: 'tools grouped by plugin proposals',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'tools` is grouped by plugin ({ proposals: ["agent_lock",',
		note: 'La documentacion del overview conserva proposals como ejemplo contractual visible.',
	},
	{
		file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
		symbolOrLiteral: 'IProposalSummary',
		category: 'type',
		destination: 'contract',
		needle: 'IProposalSummary,',
		note: 'La tool de catalogo sigue filtrando el dominio proposals de forma nominal.',
	},
	{
		file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
		symbolOrLiteral: 'sectionEnum.proposals',
		category: 'plugin-name',
		destination: 'intentional-compat',
		needle: "const sectionEnum = z.enum(['tools', 'skills', 'proposals']);",
		note: 'La seccion publica proposals se mantiene por compatibilidad del catalogo.',
	},
	{
		file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
		symbolOrLiteral: 'snapshot.proposals.length',
		category: 'type',
		destination: 'intentional-compat',
		needle: 'snapshot.tools.length + snapshot.skills.length + snapshot.proposals.length;',
		note: 'El contador de coincidencias sigue calculando sobre snapshot.proposals.',
	},
	{
		file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
		symbolOrLiteral: 'snapshot.proposals filter',
		category: 'type',
		destination: 'intentional-compat',
		needle: 'proposals: snapshot.proposals.filter((proposal) =>',
		note: 'La consulta filtrada conserva proposals como clave publica.',
	},
	{
		file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
		symbolOrLiteral: 'matchesProposal',
		category: 'type',
		destination: 'contract',
		needle: 'matchesProposal(proposal, needle),',
		note: 'La busqueda compacta sigue modelando proposals como tipo nominal.',
	},
	{
		file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
		symbolOrLiteral: 'actionable proposals summary',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'Unified discovery catalog for loaded tools, versioned skills and actionable proposals. Read-only.',
		note: 'La descripcion publica menciona proposals como parte del contrato visible.',
	},
	{
		file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
		symbolOrLiteral: 'actionable proposals snapshot',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'actionable proposals from one canonical snapshot.',
		note: 'La ayuda larga mantiene proposals como termino contractual del catalogo.',
	},
	{
		file: 'packages/core/src/lib/scaffold/scaffold-host.ts',
		symbolOrLiteral: 'claim files when proposals plugin loads',
		category: 'message',
		destination: 'composition',
		needle: 'claim files before writing with `${prefix}_agent_lock` and report `lock-conflict` instead of retrying; otherwise work with whatever tools `overview` reports.',
		note: 'Las instrucciones scaffoldeadas siguen condicionando escritura al plugin proposals.',
	},
	{
		file: 'packages/core/src/lib/scaffold/scaffold-host.ts',
		symbolOrLiteral: 'multi-agent proposal workflow',
		category: 'message',
		destination: 'intentional-compat',
		needle: 'The multi-agent proposal workflow (`${prefix}_auto_work`, `${prefix}_continue_proposal`, `${prefix}_delegate`, `${prefix}_agent_lock`, quality gates via `${prefix}_get_validation_matrix`) is available when the server loads the `proposals` plugin (`mcp-vertex --plugins=proposals`).',
		note: 'Las instrucciones publicadas siguen describiendo proposals como workflow estable visible al host.',
	},
];

const CANDIDATE_PATTERN =
	/\b(proposals|proposalSummaries|readProposalsIndex|IProposal[A-Za-z0-9_]*|ProposalStatus|PROPOSAL_STATUS_VALUES|ACTIONABLE_PROPOSAL_STATUSES|proposalStatusCounts|visibleProposals|matchesProposal|sync_proposals)\b/u;

const shouldScanSourceLine = (line: string): boolean => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return false;
	if (
		trimmed.startsWith('//') ||
		trimmed.startsWith('/*') ||
		trimmed.startsWith('*') ||
		trimmed.startsWith('*/')
	) {
		return false;
	}
	return CANDIDATE_PATTERN.test(trimmed);
};

const shouldSkipFile = (relPath: string): boolean =>
	relPath.startsWith('packages/core/src/generated/') ||
	relPath.endsWith('.generated.ts');

const walk = async (dir: string): Promise<readonly string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const absolute = join(dir, entry.name);
			if (entry.isDirectory()) return walk(absolute);
			if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
			return [absolute];
		}),
	);
	return nested.flat();
};

const matchRule = (
	relPath: string,
	line: string,
): IBoundaryFindingRule | undefined =>
	INVENTORY_RULES.find(
		(rule) => rule.file === relPath && line.includes(rule.needle),
	);

export const detectUnclassifiedCandidates = (
	relPath: string,
	text: string,
): readonly IBoundaryCandidate[] => {
	const lines = text.split('\n');
	const unclassified: IBoundaryCandidate[] = [];
	for (const [index, line] of lines.entries()) {
		if (!shouldScanSourceLine(line)) continue;
		if (matchRule(relPath, line) !== undefined) continue;
		unclassified.push({
			file: relPath,
			line: index + 1,
			content: line.trim(),
		});
	}
	return unclassified;
};

export const scanCoreProposalsBoundary = async (
	repoRoot: string = REPO_ROOT,
): Promise<IBoundaryScanResult> => {
	const coreRoot = join(repoRoot, 'packages/core/src');
	const files = await walk(coreRoot);
	const occurrences = new Map<
		IBoundaryFindingRule,
		{ count: number; lines: number[] }
	>();
	const unclassified: IBoundaryCandidate[] = [];
	for (const absolutePath of files) {
		const relPath = relative(repoRoot, absolutePath).replaceAll('\\', '/');
		if (shouldSkipFile(relPath)) continue;
		const text = await readFile(absolutePath, 'utf8');
		const lines = text.split('\n');
		for (const [index, line] of lines.entries()) {
			const rule = matchRule(relPath, line);
			if (rule !== undefined) {
				const current = occurrences.get(rule) ?? {
					count: 0,
					lines: [],
				};
				current.count += 1;
				current.lines.push(index + 1);
				occurrences.set(rule, current);
				continue;
			}
			if (!shouldScanSourceLine(line)) continue;
			unclassified.push({
				file: relPath,
				line: index + 1,
				content: line.trim(),
			});
		}
	}
	const findings = INVENTORY_RULES.map((rule) => {
		const found = occurrences.get(rule) ?? { count: 0, lines: [] };
		return {
			...rule,
			occurrences: found.count,
			lines: found.lines,
		};
	}).filter((finding) => finding.occurrences > 0);
	const missing = INVENTORY_RULES.filter(
		(rule) => (occurrences.get(rule)?.count ?? 0) === 0,
	);
	return {
		findings,
		unclassified,
		missing,
		scannedFiles: files.length,
	};
};

const categoryCounts = (findings: readonly IBoundaryFinding[]) => {
	const counts: Record<TCouplingCategory, number> = {
		import: 0,
		path: 0,
		'plugin-name': 0,
		type: 0,
		message: 0,
		'index-access': 0,
	};
	for (const finding of findings) counts[finding.category] += 1;
	return counts;
};

export const renderInventoryMarkdown = (
	result: Pick<IBoundaryScanResult, 'findings' | 'unclassified' | 'missing'>,
): string => {
	const counts = categoryCounts(result.findings);
	const lines = [
		'# Core -> proposals boundary inventory',
		'',
		'Inventario ejecutable de acoplamientos presentes hoy en packages/core/src.',
		'Si el script detecta una linea candidata nueva sin regla en esta tabla, falla.',
		'',
		'## Summary',
		'',
		`- Findings: ${result.findings.length}`,
		`- Unclassified candidates: ${result.unclassified.length}`,
		`- Missing expected findings: ${result.missing.length}`,
		`- import: ${counts.import}`,
		`- path: ${counts.path}`,
		`- plugin-name: ${counts['plugin-name']}`,
		`- type: ${counts.type}`,
		`- message: ${counts.message}`,
		`- index-access: ${counts['index-access']}`,
		'',
		'## Findings',
		'',
		'| File | Symbol or literal | Category | Proposed destination | Occurrences | Notes |',
		'| --- | --- | --- | --- | ---: | --- |',
	];
	for (const finding of [...result.findings].sort((left, right) => {
		const byFile = left.file.localeCompare(right.file);
		if (byFile !== 0) return byFile;
		return left.symbolOrLiteral.localeCompare(right.symbolOrLiteral);
	})) {
		lines.push(
			`| ${finding.file} | ${finding.symbolOrLiteral.replaceAll('|', '\\|')} | ${finding.category} | ${finding.destination} | ${finding.occurrences} | ${finding.note.replaceAll('|', '\\|')} |`,
		);
	}
	if (result.unclassified.length > 0) {
		lines.push(
			'',
			'## Unclassified candidates',
			'',
			'| File | Line | Content |',
			'| --- | ---: | --- |',
		);
		for (const candidate of result.unclassified) {
			lines.push(
				`| ${candidate.file} | ${candidate.line} | ${candidate.content.replaceAll('|', '\\|')} |`,
			);
		}
	}
	if (result.missing.length > 0) {
		lines.push(
			'',
			'## Missing expected findings',
			'',
			'| File | Symbol or literal | Category |',
			'| --- | --- | --- |',
		);
		for (const finding of result.missing) {
			lines.push(
				`| ${finding.file} | ${finding.symbolOrLiteral.replaceAll('|', '\\|')} | ${finding.category} |`,
			);
		}
	}
	lines.push('');
	return lines.join('\n');
};

const printFailures = (result: IBoundaryScanResult): void => {
	if (result.unclassified.length > 0) {
		process.stderr.write('Unclassified core -> proposals candidates:\n');
		for (const candidate of result.unclassified) {
			process.stderr.write(
				`- ${candidate.file}:${candidate.line} ${candidate.content}\n`,
			);
		}
	}
	if (result.missing.length > 0) {
		process.stderr.write('Missing expected classified findings:\n');
		for (const finding of result.missing) {
			process.stderr.write(
				`- ${finding.file} :: ${finding.symbolOrLiteral} (${finding.category})\n`,
			);
		}
	}
};

export const main = async (): Promise<number> => {
	const result = await scanCoreProposalsBoundary(REPO_ROOT);
	process.stdout.write(`${renderInventoryMarkdown(result)}\n`);
	if (result.unclassified.length > 0 || result.missing.length > 0) {
		printFailures(result);
		return 1;
	}
	return 0;
};

export const readCommittedInventory = async (): Promise<string> =>
	readFile(DOC_PATH, 'utf8');

if (import.meta.main) {
	void main().then((code) => {
		process.exitCode = code;
	});
}
