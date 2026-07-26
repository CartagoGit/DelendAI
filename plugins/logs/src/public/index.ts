export { default } from '../index';
export { createLogStore } from '../lib/services/log-store';
export type {
	ILogRangeFilter,
	ILogStore,
	ILogStoreOptions,
	ILogTailOptions,
} from '../lib/services/log-store';
export {
	isErrorOutcome,
	LOG_OUTCOMES,
	normalizeEvent,
	outcomeForKind,
	serializeRedactedEvent,
} from '../lib/services/normalize-event';
export type {
	ILogEvent,
	LogEventKind,
	LogOutcome,
} from '../lib/services/normalize-event';
export {
	incidentTypeForKind,
	INCIDENT_TYPE_PATTERN,
	isValidIncidentType,
	KIND_TO_INCIDENT_TYPE,
	LOG_SEVERITIES,
	severityForOutcome,
} from '../lib/services/kinds';
export type { IncidentType, LogSeverity } from '../lib/services/kinds';
export { correlateEvents } from '../lib/services/correlate';
export type { ICorrelateOptions, ILogGap } from '../lib/services/correlate';
export { redactTest } from '../lib/services/redact-test';
export { subscribeToBus } from '../lib/services/subscribe';
export type {
	ILogBusSubscription,
	ILogEventBus,
	LogBusEventKind,
} from '../lib/services/subscribe';
export { logIncidents, logSearch } from '../lib/services/log-search-incidents';
export type {
	ILogIncident,
	ILogIncidentsOptions,
	ILogSearchOptions,
} from '../lib/services/log-search-incidents';
