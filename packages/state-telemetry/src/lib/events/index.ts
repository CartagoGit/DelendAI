/**
 * Internal barrel for the Work Event Bus. F1-S1 does not export this
 * from the package root yet; F2-S5 owns the public barrel.
 */
export {
	type IWorkEvent,
	type INewWorkEvent,
	type TWorkEventKind,
	type IWorkItemId,
	asWorkItemId,
	isWorkEventKind,
	WORK_EVENT_KIND_VALUES,
} from './work-event';

export {
	SqliteWorkEventStore,
	WORK_EVENTS_TABLE_SQL,
	WORK_EVENTS_INDEX_SQL,
	WORK_EVENTS_SCHEMA_SQL,
	WORK_EVENTS_BOOT_PRAGMAS,
	type ISqliteWorkEventStoreOptions,
} from './work-event-store.sqlite';

export {
	NdjsonWorkEventStore,
	type INdjsonWorkEventStoreOptions,
} from './work-event-store.ndjson';

export {
	WorkEventStoreFacade,
	type IWorkEventStoreFacadeOptions,
	type IAppendResult,
	type TWorkEventBackend,
} from './work-event-store.facade';
