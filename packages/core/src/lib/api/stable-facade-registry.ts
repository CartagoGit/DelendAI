import type { IStableToolDescriptor } from './stable-facade';

type TStableToolRegistryListener = () => void;

const stableToolContributions = new Map<
	string,
	readonly IStableToolDescriptor[]
>();
const stableToolRegistryListeners = new Set<TStableToolRegistryListener>();

const freezeDescriptor = (
	descriptor: IStableToolDescriptor,
): IStableToolDescriptor => Object.freeze({ ...descriptor });

const dedupeDescriptors = (
	descriptors: readonly IStableToolDescriptor[],
): readonly IStableToolDescriptor[] => {
	const seenNames = new Set<string>();
	const deduped: IStableToolDescriptor[] = [];
	for (const descriptor of descriptors) {
		if (seenNames.has(descriptor.name)) continue;
		seenNames.add(descriptor.name);
		deduped.push(freezeDescriptor(descriptor));
	}
	return Object.freeze(deduped);
};

const notifyStableToolRegistryListeners = (): void => {
	for (const listener of stableToolRegistryListeners) {
		listener();
	}
};

/** Register or replace one contributor's stable facade descriptors. */
export const registerStableToolDescriptors = (
	contributor: string,
	descriptors: readonly IStableToolDescriptor[],
): readonly IStableToolDescriptor[] => {
	if (contributor.trim().length === 0) {
		throw new Error('stable facade contributor name must not be empty');
	}
	stableToolContributions.set(contributor, dedupeDescriptors(descriptors));
	notifyStableToolRegistryListeners();
	return listRegisteredStableToolDescriptors();
};

/** Remove one contributor or clear the whole registry. */
export const clearStableToolDescriptorContributions = (
	contributor?: string,
): void => {
	if (contributor === undefined) {
		if (stableToolContributions.size === 0) return;
		stableToolContributions.clear();
		notifyStableToolRegistryListeners();
		return;
	}
	if (!stableToolContributions.delete(contributor)) return;
	notifyStableToolRegistryListeners();
};

/** Read the currently registered plugin-owned descriptors. */
export const listRegisteredStableToolDescriptors =
	(): readonly IStableToolDescriptor[] =>
		Object.freeze([...stableToolContributions.values()].flat());

/** Compose core-owned descriptors with plugin contributions. */
export const composeStableToolDescriptors = (
	coreDescriptors: readonly IStableToolDescriptor[],
): readonly IStableToolDescriptor[] =>
	dedupeDescriptors([
		...coreDescriptors,
		...listRegisteredStableToolDescriptors(),
	]);

/** Subscribe to registry changes so facade exports can stay in sync. */
export const onStableToolRegistryChange = (
	listener: TStableToolRegistryListener,
): (() => void) => {
	stableToolRegistryListeners.add(listener);
	return () => {
		stableToolRegistryListeners.delete(listener);
	};
};

/** Test-only helper to restore an empty registry deterministically. */
export const resetStableToolDescriptorRegistryForTests = (): void => {
	clearStableToolDescriptorContributions();
};
