/**
 * work-event.ts — canonical contract for the Work Event Bus (q00020 F1).
 *
 * The bus is append-only. Events describe a single observation by a
 * single actor about a single work item. The payload itself never
 * lives here: only its `payload_hash` (sha256 of the canonical JSON
 * projection) so secrets and large bodies stay out of the stream.
 *
 * The 18 closed kinds enumerated below are the only kinds allowed on
 * the wire. Adding a new kind is a deliberate cross-proposal change
 * (F1-S1 + F2 + F4 review); the type system refuses anything else.
 */

const WORK_EVENT_KINDS = [
	'git_change',
	'git_change_stale',
	'test_started',
	'test_finished',
	'tool_called',
	'tool_finished',
	'tool_error',
	'lease_claimed',
	'lease_released',
	'lease_heartbeat',
	'lease_heartbeat_missed',
	'proposal_transition',
	'slice_claimed',
	'slice_submitted',
	'slice_approved',
	'slice_changes_requested',
	'phase_inferred',
	'stale_acceptance',
] as const;

export type TWorkEventKind = (typeof WORK_EVENT_KINDS)[number];

/**
 * Closed union — adding a kind requires updating this union and the
 * tests in `work-event.spec.ts`. Anything outside is a hard error.
 */
export const isWorkEventKind = (value: unknown): value is TWorkEventKind =>
	typeof value === 'string' &&
	(WORK_EVENT_KINDS as readonly string[]).includes(value);

/**
 * Work item id is the canonical `<proposalId>/<sliceId>` string.
 * Keeping the type open means the projector can re-derive the parts
 * without an extra hop; the store never trusts the structure.
 */
export type IWorkItemId = string & { readonly __brand: 'IWorkItemId' };

export const asWorkItemId = (value: string): IWorkItemId =>
	value as IWorkItemId;

export interface IWorkEvent {
	/**
	 * Auto-increment primary key, populated by the store at insert time.
	 * Absent when the caller hands an event to the bus — the store
	 * stamps it before persisting.
	 */
	readonly id?: number;
	readonly work_item_id: IWorkItemId;
	readonly actor_id: string | null;
	readonly kind: TWorkEventKind;
	/**
	 * sha256 of the canonical JSON projection of the payload. The
	 * payload itself is not stored: F4 renders from it on demand, and
	 * the projector (F2) only needs the hash to dedupe + correlate.
	 */
	readonly payload_hash: string;
	readonly created_at: number;
}

export const WORK_EVENT_KIND_VALUES: readonly TWorkEventKind[] =
	WORK_EVENT_KINDS;

export interface INewWorkEvent {
	readonly work_item_id: IWorkItemId;
	readonly actor_id: string | null;
	readonly kind: TWorkEventKind;
	readonly payload_hash: string;
	readonly created_at?: number;
}
