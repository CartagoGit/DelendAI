import { randomUUID } from 'node:crypto';
import {
	readFrontmatterField,
	setFrontmatterField,
} from '../../proposals/proposal-frontmatter-writer';
import {
	alreadyClosedOutcome,
	closedOutcome,
	lifecycleEntity,
} from '../../services/lifecycle-outcome';
import type { IProposalTransitionArgs } from '../../contracts/proposal-transition-input.contract';
import {
	LAST_TRANSITION_ID_FIELD,
	LAST_CORRELATION_ID_FIELD,
	LAST_IDEMPOTENCY_KEY_FIELD,
	LAST_TRANSITION_FROM_FIELD,
} from '../../contracts/constants/proposal-transition-schema.constant';
import type {
	IStoredTransitionMetadata,
	IResolvedTransitionMetadata,
} from '../../contracts/interfaces/proposal-transition-tool.interface';

const normalizeOptionalString = (
	value: string | undefined,
): string | undefined => {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

export const resolveTransitionMetadata = (
	args: IProposalTransitionArgs,
): IResolvedTransitionMetadata => {
	const transitionId =
		normalizeOptionalString(args.transitionId) ?? randomUUID();
	const correlationId =
		normalizeOptionalString(args.correlationId) ?? transitionId;
	return {
		transitionId,
		correlationId,
		idempotencyKey: normalizeOptionalString(args.idempotencyKey),
	};
};

export const readStoredTransitionMetadata = (
	raw: string,
): IStoredTransitionMetadata => ({
	transitionId: readFrontmatterField(raw, LAST_TRANSITION_ID_FIELD),
	correlationId: readFrontmatterField(raw, LAST_CORRELATION_ID_FIELD),
	idempotencyKey: readFrontmatterField(raw, LAST_IDEMPOTENCY_KEY_FIELD),
	from: readFrontmatterField(raw, LAST_TRANSITION_FROM_FIELD),
});

export const buildIdempotentReplayResult = (input: {
	readonly proposalId: string;
	readonly currentStatus: string;
	readonly targetStatus: string;
	readonly reason: string;
	readonly relativePath: string;
	readonly metadata: IStoredTransitionMetadata;
}) => {
	const entity = lifecycleEntity({
		id: input.proposalId,
		entity: 'proposal',
		status: input.currentStatus,
		path: input.relativePath,
	});
	if (input.currentStatus === 'done' && input.targetStatus === 'done') {
		const envelope = {
			ok: true as const,
			...alreadyClosedOutcome({
				entity,
				reason: 'idempotent replay detected; the proposal was already closed and no new mutation ran.',
				currentStatus: input.currentStatus,
				previousOutcome: 'closed',
			}),
			id: input.proposalId,
			from: input.metadata.from ?? input.currentStatus,
			to: input.currentStatus,
			reason: input.reason,
			transitionId: input.metadata.transitionId,
			correlationId:
				input.metadata.correlationId ?? input.metadata.transitionId,
			idempotencyKey: input.metadata.idempotencyKey,
			idempotentReplay: true,
			movedTo: input.relativePath,
		};
		return {
			content: [
				{ type: 'text' as const, text: JSON.stringify(envelope) },
			],
			structuredContent: envelope,
		};
	}
	const envelope = {
		ok: true as const,
		...closedOutcome({
			entity,
			from: input.metadata.from ?? input.currentStatus,
			to: input.currentStatus,
			previousOutcome: 'closed',
		}),
		id: input.proposalId,
		from: input.metadata.from ?? input.currentStatus,
		to: input.currentStatus,
		reason: input.reason,
		transitionId: input.metadata.transitionId,
		correlationId:
			input.metadata.correlationId ?? input.metadata.transitionId,
		idempotencyKey: input.metadata.idempotencyKey,
		idempotentReplay: true,
		movedTo: input.relativePath,
		warning:
			'idempotent replay detected; the transition was already applied and no new mutation ran.',
	};
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
		structuredContent: envelope,
	};
};

export const setFrontmatterMetadataField = (
	raw: string,
	fieldName: string,
	newValue: string,
): string => {
	const existing = readFrontmatterField(raw, fieldName);
	if (existing !== undefined) {
		return setFrontmatterField(raw, fieldName, newValue);
	}
	return raw.replace(
		/^(---\r?\n[\s\S]*?)(\r?\n---)/,
		(_, head: string, close: string) =>
			`${head}\n${fieldName}: ${newValue}${close}`,
	);
};
