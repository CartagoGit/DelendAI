/**
 * effect-guard.interface.ts — vocabulary for `dry-run/effect-guard.helper.ts`.
 *
 * `TEffectCapabilityKind` mirrors `IPlannedRun['shape']` /
 * `IPlannedChange['kind']` in `protocol.ts` so a refusal can be reported
 * using the same words as a plan. `IDryRunEffectRefusal` is the typed
 * refusal payload carried by `DryRunEffectRefusedError` (see
 * `dry-run/effect-guard.helper.ts` for the guard implementation).
 */

/** The vocabulary a guarded capability declares itself as. */
export type TEffectCapabilityKind =
	| 'write'
	| 'delete'
	| 'spawn'
	| 'network'
	| 'git';

export interface IDryRunEffectRefusal {
	readonly kind: 'dry-run-effect-refused';
	readonly capability: TEffectCapabilityKind;
	readonly reason: string;
}
