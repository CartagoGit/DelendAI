import {
	alreadyClosedOutcome,
	closedOutcome,
	lifecycleEntity,
} from './lifecycle-outcome';

import type { ICloseSliceValidationDecision } from '../tools/authoring-options';

interface ICloseSliceLifecycleContext {
	readonly proposalId: string;
	readonly requestedSliceId: string;
	readonly canonicalSliceId: string;
	readonly path: string;
	readonly validationDecision?: ICloseSliceValidationDecision | undefined;
	readonly idempotencyKey?: string | undefined;
}

const withCloseSliceMetadata = <T extends Record<string, unknown>>(
	context: ICloseSliceLifecycleContext,
	payload: T,
) => ({
	...payload,
	...(context.idempotencyKey !== undefined
		? { idempotencyKey: context.idempotencyKey }
		: {}),
	...(context.validationDecision !== undefined
		? { validationDecision: context.validationDecision }
		: {}),
});

export const buildCloseSliceAlreadyClosedResult = (
	context: ICloseSliceLifecycleContext,
) =>
	withCloseSliceMetadata(context, {
		ok: true,
		...alreadyClosedOutcome({
			entity: lifecycleEntity({
				id: context.proposalId,
				entity: 'slice',
				status: 'done',
				path: context.path,
				sliceId: context.canonicalSliceId,
			}),
			reason: 'slice is already closed',
			currentStatus: 'done',
		}),
		proposalId: context.proposalId,
		sliceId: context.requestedSliceId,
		closed: false,
	});

export const buildCloseSliceClosedResult = (
	context: ICloseSliceLifecycleContext,
) =>
	withCloseSliceMetadata(context, {
		...closedOutcome({
			entity: lifecycleEntity({
				id: context.proposalId,
				entity: 'slice',
				status: 'done',
				path: context.path,
				sliceId: context.canonicalSliceId,
			}),
		}),
		proposalId: context.proposalId,
		sliceId: context.requestedSliceId,
		closed: true,
	});