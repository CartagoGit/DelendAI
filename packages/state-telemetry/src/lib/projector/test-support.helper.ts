import type { IProducerContext, IProjectionResult } from '@delendai/state';

import {
	asWorkItemId,
	type IWorkEvent,
	type TWorkEventKind,
} from '../events/work-event';
import type { IWorkItemInput } from './contracts/interfaces/work-progress.interface';
import { encodeProducerInputs } from './work-progress-producer.service';

export const makeEvent = (
	workItem: string,
	kind: TWorkEventKind,
	at: number,
	payloadHash = 'h',
): IWorkEvent => ({
	id: at,
	work_item_id: asWorkItemId(workItem),
	actor_id: 'a',
	kind,
	payload_hash: payloadHash,
	created_at: at,
});

export const makeContext = (
	events: readonly IWorkEvent[],
	items: readonly IWorkItemInput[],
	baseProjection?: IProjectionResult,
): IProducerContext => ({
	scope: {
		kind: 'project',
		locator: {
			workspaceRoot: '/w',
			worktreeId: 'w' as never,
			cacheRoot: '/c',
			docsRoot: '/d',
		},
	},
	fingerprint: { abiVersion: 1, producers: [] },
	resolved: encodeProducerInputs(events, items),
	...(baseProjection === undefined ? {} : { baseProjection }),
});
