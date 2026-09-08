import type { IOutboxRecord } from '../../repository/outbox-repo';
import type { TOutboxHandler } from '../processor';

export interface IRegenerateIndexHandlerOptions {
	readonly regenerate: (record: IOutboxRecord) => void;
}

export const createRegenerateIndexHandler = (
	options: IRegenerateIndexHandlerOptions,
): TOutboxHandler => (record) => {
	options.regenerate(record);
};
