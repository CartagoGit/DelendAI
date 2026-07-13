import { t } from '@mcp-vertex/shared/i18n';
import { defaultLang, dictsByLang, type Lang } from './index';

export interface IViewCopy {
	readonly lang: Lang;
	readonly agentCatalogTitle: string;
	readonly agentCatalogLead: string;
	readonly copyBootstrap: string;
	readonly refresh: string;
	readonly tools: string;
	readonly skills: string;
	readonly proposals: string;
	readonly metrics: string;
	readonly calls: string;
	readonly callSingular: string;
	readonly errors: string;
	readonly errorSingular: string;
	readonly max: string;
	readonly folder: string;
	readonly slices: string;
	readonly lockOwners: string;
	readonly claimableNow: string;
	readonly notActionable: string;
	readonly noSlices: string;
	readonly slice: string;
	readonly status: string;
	readonly owner: string;
	readonly diagnose: string;
	readonly noDiagnosis: string;
	readonly emptyDiagnosis: string;
	readonly logs: string;
	readonly noLogs: string;
	readonly time: string;
	readonly kind: string;
	readonly agent: string;
	readonly summary: string;
	readonly knowledge: string;
	readonly inputSchema: string;
	readonly noInputSchema: string;
	readonly outputSchema: string;
	readonly noOutputSchema: string;
	readonly noCalls: string;
	readonly items: string;
	readonly required: string;
	readonly optional: string;
	readonly enumLabel: string;
}

const englishUnique = {
	agentCatalogTitle: 'Unified agent catalog',
	agentCatalogLead:
		'One entrypoint for tools, skills, and actionable proposals',
	copyBootstrap: 'Copy bootstrap prompt',
	callSingular: 'call',
	errorSingular: 'error',
	folder: 'Folder',
	slices: 'Slices',
	lockOwners: 'Lock owners',
	claimableNow: 'claimable now',
	notActionable:
		'This proposal is not on the actionable board, so per-slice status is not available here.',
	noSlices: 'No slices.',
	owner: 'Owner',
	diagnose: 'Diagnose',
	noDiagnosis: 'No diagnosis available.',
	emptyDiagnosis: 'Empty diagnosis.',
	noLogs: 'No matching log lines.',
	inputSchema: 'Input schema',
	noInputSchema: 'No input schema.',
	outputSchema: 'Output schema',
	noOutputSchema: 'No output schema.',
	noCalls: 'No calls recorded.',
	items: 'items',
	required: 'required',
	optional: 'optional',
	enumLabel: 'enum',
} as const;

type IUniqueViewCopy = {
	readonly [Key in keyof typeof englishUnique]: string;
};

const spanishUnique: IUniqueViewCopy = {
	agentCatalogTitle: 'Catálogo unificado de agentes',
	agentCatalogLead:
		'Un único punto de entrada para herramientas, skills y propuestas accionables',
	copyBootstrap: 'Copiar prompt de arranque',
	callSingular: 'llamada',
	errorSingular: 'error',
	folder: 'Carpeta',
	slices: 'Fases',
	lockOwners: 'Propietarios del bloqueo',
	claimableNow: 'disponibles ahora',
	notActionable:
		'Esta propuesta no está en el tablero accionable, por lo que aquí no está disponible el estado por fase.',
	noSlices: 'No hay fases.',
	owner: 'Responsable',
	diagnose: 'Diagnóstico',
	noDiagnosis: 'No hay diagnóstico disponible.',
	emptyDiagnosis: 'El diagnóstico está vacío.',
	noLogs: 'No hay líneas de registro coincidentes.',
	inputSchema: 'Esquema de entrada',
	noInputSchema: 'No hay esquema de entrada.',
	outputSchema: 'Esquema de salida',
	noOutputSchema: 'No hay esquema de salida.',
	noCalls: 'No hay llamadas registradas.',
	items: 'elementos',
	required: 'obligatorio',
	optional: 'opcional',
	enumLabel: 'valores',
};

export const resolveViewLang = (persisted: unknown): Lang =>
	typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;

export const viewCopyFor = (lang: Lang): IViewCopy => {
	const dict = dictsByLang[lang];
	const unique = lang === 'es' ? spanishUnique : englishUnique;
	const text = (section: 'extension' | 'site', ...path: readonly string[]) =>
		t(dict, [section, ...path]);
	const spanish = lang === 'es';
	return {
		lang,
		...unique,
		refresh: dict.extension.refresh,
		tools: dict.extension.tabTools,
		skills: text('site', 'skills', 'title'),
		proposals: dict.extension.kpiProposals,
		metrics: dict.extension.tabMetrics,
		calls: spanish
			? 'llamadas'
			: text('extension', 'common.calls').toLocaleLowerCase(lang),
		errors: spanish
			? 'errores'
			: text('extension', 'common.errors').toLocaleLowerCase(lang),
		max: spanish
			? 'máx.'
			: text('extension', 'common.max').toLocaleLowerCase(lang),
		slice: text('extension', 'dashboard.agents.slice'),
		status: text('extension', 'dashboard.health.status'),
		logs: text('site', 'logs', 'page_title'),
		time: text('site', 'logs', 'columns', 'ts'),
		kind: text('extension', 'common.kind'),
		agent: text('extension', 'common.agent'),
		summary: text('site', 'logs', 'columns', 'summary'),
		knowledge: text('extension', 'dashboard.overview.knowledge'),
	};
};
