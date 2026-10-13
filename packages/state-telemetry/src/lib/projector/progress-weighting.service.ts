import {
	PROGRESS_FULL,
	WEIGHT_BASE,
	WEIGHT_OVERRIDE_MAX,
	WEIGHT_OVERRIDE_MIN,
} from './contracts/constants/work-progress.constant';
import type {
	IWeightedSlice,
	IWorkItemInput,
} from './contracts/interfaces/work-progress.interface';

/** `1 + log2(count)`; a slice with no criteria weighs the base weight. */
export const defaultWeight = (acceptanceCount: number): number =>
	acceptanceCount >= 1
		? WEIGHT_BASE + Math.log2(acceptanceCount)
		: WEIGHT_BASE;

/** An override counts only inside the accepted range. */
export const sliceWeight = (
	item: Pick<IWorkItemInput, 'acceptanceCount' | 'weight'>,
): number =>
	item.weight !== undefined &&
	Number.isFinite(item.weight) &&
	item.weight >= WEIGHT_OVERRIDE_MIN &&
	item.weight <= WEIGHT_OVERRIDE_MAX
		? item.weight
		: defaultWeight(item.acceptanceCount);

/** 0..100: checked criteria over all criteria; `done` is full whatever the count. */
export const sliceProgress = (
	item: Pick<IWorkItemInput, 'acceptanceCount' | 'acceptanceDone' | 'status'>,
): number => {
	if (item.status === 'done') return PROGRESS_FULL;
	if (item.acceptanceCount <= 0) return 0;
	const done = Math.min(
		Math.max(item.acceptanceDone, 0),
		item.acceptanceCount,
	);
	return (done / item.acceptanceCount) * PROGRESS_FULL;
};

/** Sum(progress x weight) / Sum(weight), summed in canonical slice-id order. */
export const aggregateProgress = (
	slices: readonly IWeightedSlice[],
): number => {
	const ordered = [...slices].sort((a, b) =>
		a.sliceId.localeCompare(b.sliceId),
	);
	let weighted = 0;
	let total = 0;
	for (const slice of ordered) {
		weighted += slice.progress * slice.weight;
		total += slice.weight;
	}
	return total === 0 ? 0 : weighted / total;
};
