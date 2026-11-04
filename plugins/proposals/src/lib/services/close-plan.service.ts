import { toolError, toolOk } from '@delendai/core/public';

import type { IPlanClosureReport } from '../swarm/plan-closure.types';
import {
	alreadyClosedOutcome,
	closedOutcome,
	conflictOutcome,
	lifecycleEntity,
} from './lifecycle-outcome';

type IToolContentPart = {
	readonly text?: string;
};

type IToolLikeResult = {
	readonly content?: readonly IToolContentPart[];
	readonly structuredContent?: unknown;
	readonly isError?: boolean;
};

type ITransitionPayload = {
	readonly kind?: string;
	readonly from?: string;
	readonly to?: string;
	readonly movedTo?: string;
	readonly idempotencyKey?: string;
};

export interface IClosePlanTransitionContext {
	readonly planId: string;
	readonly status: string;
	readonly absPath: string;
	readonly folder: string;
	readonly reason: string;
	readonly idempotencyKey?: string | undefined;
}

const parseToolPayload = (
	result: IToolLikeResult,
): ITransitionPayload | null => {
	const candidate = result.structuredContent;
	if (typeof candidate === 'object' && candidate !== null) {
		return candidate as ITransitionPayload;
	}
	const raw = result.content?.[0]?.text;
	if (typeof raw !== 'string' || raw.length === 0) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		return typeof parsed === 'object' && parsed !== null
			? (parsed as ITransitionPayload)
			: null;
	} catch {
		return null;
	}
};

export const buildClosePlanAlreadyClosedResult = (
	context: IClosePlanTransitionContext,
) => {
	const entity = lifecycleEntity({
		id: context.planId,
		entity: 'plan',
		status: 'done',
		path: context.absPath,
	});
	return toolOk({
		...alreadyClosedOutcome({
			entity,
			reason: 'plan is already closed',
			currentStatus: 'done',
		}),
		...(context.idempotencyKey !== undefined
			? { idempotencyKey: context.idempotencyKey }
			: {}),
		planId: context.planId,
		dryRun: false,
		ok: true,
		closable: true,
		blockers: [],
		preview: {
			from: 'done',
			to: 'done',
			movedFrom: context.absPath,
			movedTo: context.absPath,
		},
	});
};

export const buildClosePlanConflictResult = (
	context: IClosePlanTransitionContext,
	report: IPlanClosureReport,
) =>
	toolOk({
		...conflictOutcome({
			entity: lifecycleEntity({
				id: context.planId,
				entity: 'plan',
				status: context.status,
				path: context.absPath,
			}),
			reason: `plan ${context.planId} is not closable`,
			code: 'plan-not-closable',
			currentStatus: context.status,
		}),
		...(context.idempotencyKey !== undefined
			? { idempotencyKey: context.idempotencyKey }
			: {}),
		planId: context.planId,
		dryRun: false,
		ok: false,
		closable: false,
		blockers: report.reasons,
	});

export const buildClosePlanClosedResult = (
	context: IClosePlanTransitionContext,
	payload: ITransitionPayload | null,
) =>
	toolOk({
		...closedOutcome({
			entity: lifecycleEntity({
				id: context.planId,
				entity: 'plan',
				status: 'done',
				path:
					typeof payload?.movedTo === 'string' &&
					payload.movedTo.length > 0
						? payload.movedTo
						: `done/${context.planId}-...md`,
			}),
			from: payload?.from ?? context.status,
			to: payload?.to ?? 'done',
		}),
		...(context.idempotencyKey !== undefined
			? { idempotencyKey: context.idempotencyKey }
			: {}),
		planId: context.planId,
		dryRun: false,
		ok: true,
		closable: true,
		blockers: [],
		preview: {
			from: payload?.from ?? context.status,
			to: payload?.to ?? 'done',
			movedFrom: `${context.folder}/${context.planId}-...md`,
			movedTo:
				typeof payload?.movedTo === 'string' &&
				payload.movedTo.length > 0
					? payload.movedTo
					: `done/${context.planId}-...md`,
		},
	});

export const runClosePlanTransitionService = async (input: {
	readonly context: IClosePlanTransitionContext;
	readonly runTransition: () => Promise<IToolLikeResult>;
	readonly rerunPreflight: () => Promise<IPlanClosureReport>;
	readonly transitionRejectedNextAction: string;
}) => {
	const result = await input.runTransition();
	const payload = parseToolPayload(result);
	if (result.isError === true) {
		const report = await input.rerunPreflight();
		if (!report.closable) {
			return buildClosePlanConflictResult(input.context, report);
		}
		const text = result.content?.[0]?.text ?? 'transition failed';
		return toolError(text, input.transitionRejectedNextAction);
	}
	if (payload?.kind === 'already_closed') {
		return buildClosePlanAlreadyClosedResult({
			...input.context,
			absPath:
				typeof payload.movedTo === 'string' &&
				payload.movedTo.length > 0
					? payload.movedTo
					: input.context.absPath,
		});
	}
	return buildClosePlanClosedResult(input.context, payload);
};
