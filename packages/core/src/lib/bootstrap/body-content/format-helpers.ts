// body-content/format-helpers: tiny string formatters shared by the
// prompt and skill body builders.
//
// SOLID — Single Responsibility. The formatters own ONE thing:
// turning structured fields into markdown bullets. They know nothing
// about frameworks, languages or the analysis.

/** Render a list as a markdown bullet list. Empty ⇒ `_(none detected)_`. */
export const formatList = (items: readonly string[]): string =>
	items.length === 0
		? '_(none detected)_'
		: items.map((s) => `- \`${s}\``).join('\n');

/** Render the `scripts` map as a one-line-per-role bullet list. */
export const formatScripts = (
	scripts: Readonly<Record<string, string>>,
): string => {
	const roles = Object.keys(scripts);
	if (roles.length === 0) return '_(no quality scripts detected)_';
	return roles
		.map((role) => `- \`${role}\` → \`${scripts[role]}\``)
		.join('\n');
};
