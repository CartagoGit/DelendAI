export type {
	ICorrelateErrorsWithLocalInput,
	ICorrelateErrorsWithLocalOutput,
	IObsCorrelationMatch,
	IReadLocalCorrelateDeps,
	IReadLocalCorrelateFilter,
	IReadonlyLocalLogLine,
	IReadonlyLocalMetricRecord,
} from './interfaces';
export {
	correlateErrorsWithLocal,
	DEFAULT_CORRELATE_WINDOW_MINUTES,
} from './correlate-errors';
export { realReadLocalCorrelateDeps } from './real-deps';
