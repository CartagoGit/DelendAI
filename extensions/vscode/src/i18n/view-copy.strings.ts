import { t } from '@mcp-vertex/shared/i18n';
import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';
import { defaultLang, dictsByLang, type Lang } from './index';

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
	timelineTitle: 'Agent Timeline',
	timelineRefresh: 'refresh',
	timelinePlugin: 'plugin',
	timelineKind: 'kind',
	timelineSlice: 'slice',
	timelineCost: 'cost',
	timelineTokens: 'tokens',
	timelineCommit: 'commit',
	timelineWhy: 'why',
	timelineInputs: 'inputs',
	timelineOutputs: 'outputs',
	timelineAnyPlugin: '— any plugin —',
	timelineAnyKind: '— any kind —',
	timelineApply: 'Apply',
	timelineReset: 'reset',
	timelineNoMatches: 'No events match the current filters.',
	timelineShowingTotal: 'Showing',
	timelineTotalEvents: 'total events.',
	timelineEmptyValue: '—',
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
	timelineTitle: 'Línea de tiempo de agentes',
	timelineRefresh: 'actualizar',
	timelinePlugin: 'plugin',
	timelineKind: 'tipo',
	timelineSlice: 'fase',
	timelineCost: 'coste',
	timelineTokens: 'tokens',
	timelineCommit: 'commit',
	timelineWhy: 'motivo',
	timelineInputs: 'entradas',
	timelineOutputs: 'salidas',
	timelineAnyPlugin: '— cualquier plugin —',
	timelineAnyKind: '— cualquier tipo —',
	timelineApply: 'Aplicar',
	timelineReset: 'restablecer',
	timelineNoMatches: 'No hay eventos que coincidan con los filtros actuales.',
	timelineShowingTotal: 'Mostrando',
	timelineTotalEvents: 'eventos en total.',
	timelineEmptyValue: '—',
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
	// English copy is the canonical fallback: when a dict entry resolves
	// to a Spanish string but `lang === 'en'`, force the English word so
	// the user never sees "llamadas" in an English tab. The user's bug
	// report explicitly flagged the kpi panel showing Spanish copy in
	// an otherwise English locale; this guards every entry the function
	// returns.
	const maybeEn = (spanishValue: string, englishValue: string): string =>
		spanish ? spanishValue : englishValue;
	return {
		lang,
		...unique,
		refresh: dict.extension.refresh,
		tools: dict.extension.tabTools,
		skills: text('site', 'skills', 'title'),
		proposals: dict.extension.kpiProposals,
		metrics: dict.extension.tabMetrics,
		calls: maybeEn(
			'llamadas',
			text('extension', 'common.calls').toLocaleLowerCase('en'),
		),
		errors: maybeEn(
			'errores',
			text('extension', 'common.errors').toLocaleLowerCase('en'),
		),
		max: maybeEn(
			'máx.',
			text('extension', 'common.max').toLocaleLowerCase('en'),
		),
		slice: maybeEn('Fase', 'Slice'),
		status: maybeEn('Estado', 'Status'),
		logs: maybeEn('Registros', 'Logs'),
		time: maybeEn('Hora', 'Time'),
		kind: maybeEn('Tipo', 'Kind'),
		agent: maybeEn('Agente', 'Agent'),
		summary: maybeEn('Resumen', 'Summary'),
		knowledge: maybeEn('Conocimiento', 'Knowledge'),
	};
};
