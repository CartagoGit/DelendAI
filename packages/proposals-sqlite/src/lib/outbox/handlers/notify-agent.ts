import type { IOutboxRecord } from '../../repository/outbox-repo';
import type { TOutboxHandler } from '../processor';

export interface INotifyAgentHandlerOptions {
	readonly notify: (record: IOutboxRecord) => void;
}

export const createNotifyAgentHandler = (
	options: INotifyAgentHandlerOptions,
): TOutboxHandler => (record) => {
	options.notify(record);
};
