import type { ILogsTranslations, Lang } from '#I18N/shared';

const en: ILogsTranslations = {
	page_title: 'Logs',
	lead: 'Redacted MCP event timeline for tool calls, agents and recovery signals.',
	empty: 'No log events are available in the static snapshot.',
	filter_outcome: 'Outcome',
	filter_agent: 'Agent',
	filter_task: 'Task',
	copyTask: 'Copy task id',
	outcomes: {
		ok: 'OK',
		failed: 'Failed',
		timed_out: 'Timed out',
		cancelled: 'Cancelled',
		dead: 'Dead',
		idle: 'Idle',
		unknown: 'Unknown',
	},
	columns: {
		ts: 'Time',
		kind: 'Kind',
		agent: 'Agent',
		task: 'Task',
		outcome: 'Outcome',
		summary: 'Summary',
	},
};

const es: ILogsTranslations = {
	page_title: 'Logs',
	lead: 'Cronología redactada de eventos MCP: tools, agentes y señales de recuperación.',
	empty: 'No hay eventos de log disponibles en la captura estática.',
	filter_outcome: 'Resultado',
	filter_agent: 'Agente',
	filter_task: 'Tarea',
	copyTask: 'Copiar task id',
	outcomes: {
		ok: 'OK',
		failed: 'Fallido',
		timed_out: 'Timeout',
		cancelled: 'Cancelado',
		dead: 'Muerto',
		idle: 'Inactivo',
		unknown: 'Desconocido',
	},
	columns: {
		ts: 'Hora',
		kind: 'Tipo',
		agent: 'Agente',
		task: 'Tarea',
		outcome: 'Resultado',
		summary: 'Resumen',
	},
};

export const logsByLang: Readonly<Record<Lang, ILogsTranslations>> = {
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
