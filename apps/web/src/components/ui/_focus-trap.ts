/**
 * _focus-trap.ts — pure Tab-order helper for modal dialogs. Given the
 * dialog's focusable elements and the one holding focus, it names the
 * element a Tab / Shift+Tab press must move to, or `null` when the
 * browser's default move stays inside the dialog.
 */
export const trapTarget = <T>(
	focusables: ReadonlyArray<T>,
	active: T | null,
	shift: boolean,
): T | null => {
	const first = focusables[0];
	const last = focusables[focusables.length - 1];
	if (first === undefined || last === undefined) return null;
	if (active === null || !focusables.includes(active))
		return shift ? last : first;
	if (shift && active === first) return last;
	if (!shift && active === last) return first;
	return null;
};
