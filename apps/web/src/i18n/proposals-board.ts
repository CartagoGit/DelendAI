/**
 * proposals-board.ts — f00097 S5 web-parity i18n.
 *
 * Strings for the static `/[lang]/proposals` parity page (the read-only
 * observability board mirrored from the VS Code host). Follows the same
 * standalone-`byLang` fallback pattern as `proposalGlossaryByLang` in
 * `./proposals.ts`: `en` is the source of truth, `es` is translated, and every
 * other language falls back to `en`. Because this map is NOT part of the site
 * `ITranslations` (`dictsByLang`), it is outside the `check:i18n` site-dict
 * walk — adding a key here never breaks the 12-lang gate, and the page always
 * resolves for every locale.
 */
import type { Lang } from '#I18N/shared';

export interface IProposalBoardTranslations {
	readonly title: string;
	readonly lead: string;
	readonly readOnly: { readonly title: string; readonly body: string };
	readonly statusesTitle: string;
	readonly kindsTitle: string;
	readonly chipsTitle: string;
	readonly chips: {
		readonly locks: string;
		readonly stale: string;
		readonly queue: string;
		readonly health: string;
	};
	readonly filtersTitle: string;
	readonly filter: {
		readonly status: string;
		readonly text: string;
		readonly tag: string;
	};
	readonly recoverable: string;
	readonly detailTitle: string;
	readonly detail: {
		readonly slices: string;
		readonly diagnose: string;
		readonly logs: string;
		readonly related: string;
	};
}

const en: IProposalBoardTranslations = {
	title: 'Proposals board',
	lead: 'A read-only projection of the proposals workflow — the same board the VS Code host shows, observable from the docs site. It never moves proposals, claims slices, or transitions state; mutation stays in the agent / CLI where the lock manager enforces ownership.',
	readOnly: {
		title: 'Read-only by design',
		body: 'The board consumes only the proposals plugin’s read-only tools (proposal_board, proposal_diagnose, compact_status, state_health, proposal_stale_list, logs_tail). Transition, lock, close-slice and sync tools are never called from the UI.',
	},
	statusesTitle: 'Status groups',
	kindsTitle: 'Kinds',
	chipsTitle: 'Header chips',
	chips: {
		locks: 'Active write locks held across the swarm.',
		stale: 'Proposals whose owner went silent (stale > 7 days).',
		queue: 'Task-queue backpressure — waiter orphans present or clear.',
		health: 'Swarm state health: ok, warn, or crit.',
	},
	filtersTitle: 'Filters',
	filter: {
		status: 'Filter by status',
		text: 'Filter by id',
		tag: 'Filter by tag',
	},
	recoverable:
		'When a tool payload cannot be projected the board shows a recoverable banner with a Copy-error action — never a crash.',
	detailTitle: 'Proposal detail',
	detail: {
		slices: 'Slices',
		diagnose: 'Diagnose',
		logs: 'Logs',
		related: 'Related',
	},
};

const es: IProposalBoardTranslations = {
	title: 'Tablero de propuestas',
	lead: 'Una proyección de solo lectura del flujo de propuestas — el mismo tablero que muestra el host de VS Code, observable desde el sitio de documentación. Nunca mueve propuestas, reclama slices ni cambia de estado; la mutación se queda en el agente / CLI donde el gestor de locks garantiza la propiedad.',
	readOnly: {
		title: 'Solo lectura por diseño',
		body: 'El tablero consume únicamente las herramientas de solo lectura del plugin de propuestas (proposal_board, proposal_diagnose, compact_status, state_health, proposal_stale_list, logs_tail). Las herramientas de transición, lock, cierre de slice y sync nunca se llaman desde la interfaz.',
	},
	statusesTitle: 'Grupos de estado',
	kindsTitle: 'Tipos',
	chipsTitle: 'Indicadores de cabecera',
	chips: {
		locks: 'Locks de escritura activos en el enjambre.',
		stale: 'Propuestas cuyo dueño quedó en silencio (obsoletas > 7 días).',
		queue: 'Contrapresión de la cola de tareas — hay esperas huérfanas o está despejada.',
		health: 'Salud del estado del enjambre: ok, warn o crit.',
	},
	filtersTitle: 'Filtros',
	filter: {
		status: 'Filtrar por estado',
		text: 'Filtrar por id',
		tag: 'Filtrar por etiqueta',
	},
	recoverable:
		'Cuando un payload no se puede proyectar, el tablero muestra un aviso recuperable con una acción de copiar error — nunca un fallo.',
	detailTitle: 'Detalle de la propuesta',
	detail: {
		slices: 'Slices',
		diagnose: 'Diagnóstico',
		logs: 'Registros',
		related: 'Relacionadas',
	},
};

export const proposalBoardByLang: Readonly<
	Record<Lang, IProposalBoardTranslations>
> = {
	ar: en,
	de: en,
	en,
	es,
	fr: en,
	hi: en,
	it: en,
	ja: en,
	pt: en,
	th: en,
	vi: en,
	zh: en,
};
