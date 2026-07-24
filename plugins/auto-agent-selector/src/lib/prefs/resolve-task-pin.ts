/** Resolve user pins deterministically: explicit request always wins config. */
export const resolveTaskPin = (
	explicitPin: string | undefined,
	taskType: string | undefined,
	taskPins: Readonly<Record<string, string>> | undefined,
): string | undefined => {
	if (explicitPin !== undefined) return explicitPin;
	if (taskType === undefined) return undefined;
	return taskPins?.[taskType];
};
