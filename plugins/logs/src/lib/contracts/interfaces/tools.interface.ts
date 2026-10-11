/**
 * tools.interface.ts — the store pair `buildLogToolRegistrations` needs
 * (main timeline + curated error stream). Kept under contracts/interfaces
 * per the types-in-contracts convention.
 */
import type { ILogStore } from '../../services/log-store';

export interface ILogToolStores {
	readonly main: ILogStore;
	readonly errors: ILogStore;
}
