/**
 * reconciler.service.ts — one pass that derives the desired state of every
 * ref and converges to it through a port.
 *
 * Nothing here decides from memory: each pass reads a fresh snapshot, so a
 * pass run twice changes nothing the second time.
 */
import type { IPolicyBranches } from '../contracts/interfaces/development-policy.interface';
import type {
	IDesiredState,
	IReconcilerSettings,
	IRefForge,
} from '../contracts/interfaces/ref-reconciler.interface';
import { DEFAULT_EMPTY_UNIT_GRACE_SECONDS } from '../contracts/constants/ref-kinds.constant';
import { desiredState } from './desired-state.helper';

const DEFAULT_RECONCILER_SETTINGS: IReconcilerSettings = {
	emptyUnitGraceSeconds: DEFAULT_EMPTY_UNIT_GRACE_SECONDS,
};

export class RefReconcilerService {
	constructor(
		private readonly forge: IRefForge,
		private readonly branches: IPolicyBranches,
		private readonly settings: IReconcilerSettings = DEFAULT_RECONCILER_SETTINGS,
	) {}

	/** Read, decide, act; the state it decided and acted on is returned. */
	async pass(): Promise<IDesiredState> {
		const snapshot = await this.forge.snapshot();
		const desired = desiredState(snapshot, this.branches, this.settings);
		for (const action of desired.actions) {
			await this.forge.apply(action);
		}
		return desired;
	}
}
