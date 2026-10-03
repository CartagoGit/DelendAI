/**
 * Internal barrel for the ETA engine (q00020 F3). Not exported from
 * the package root yet: `f00510` S5 / F3-S4 own the public surface.
 */
export {
	computeFeatureVector,
	canonicalHash,
	type IWorkFeatureVector,
	type IFeatureVectorInputs,
} from './feature-vector';

export {
	DurationHistoryFacade,
	MemoryDurationHistoryStore,
	SqliteDurationHistoryStore,
	recordTransitionDuration,
	passesMedianGuard,
	isRecordableOutcome,
	DEFAULT_DURATION_HISTORY_PATH,
	DURATION_HISTORY_SCHEMA_SQL,
	DURATION_HISTORY_TABLE_SQL,
	DURATION_HISTORY_BOOT_PRAGMAS,
	MEDIAN_GUARD_MIN_SAMPLES,
	MEDIAN_DELTA_THRESHOLD,
	RECORDABLE_OUTCOMES,
	type IDurationHistoryStore,
	type IDurationSample,
	type IDurationSampleSource,
	type IRecordDurationInput,
	type ITransitionDurationInput,
	type TDurationHistoryBackend,
	type TRecordDurationResult,
	type TRecordableOutcome,
	type TSkipReason,
} from './duration-history';

export {
	median,
	medianOrUndefined,
	percentileLinear,
	percentileNearestRank,
} from './eta-aggregation';

export {
	computeEta,
	estimateFromSamples,
	EtaEngine,
	MIN_SAMPLES,
	CONFIDENCE_VECTOR_ACTOR,
	CONFIDENCE_TASK_KIND,
	RANGE_LOW_QUANTILE,
	RANGE_HIGH_QUANTILE,
	type IComputeEtaParams,
	type IEtaEstimate,
	type IEtaResult,
	type TEtaBasis,
	type TEtaReason,
} from './eta-engine';
