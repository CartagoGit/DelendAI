/** Minimal file glob: `**` crosses directories, `*`/`?` stay within one. */
export const globToRegExp = (glob: string): RegExp => {
	const globstarSentinel = '__DELENDAI_GLOBSTAR_SENTINEL__';
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const pattern = escaped
		.replace(/\*\*/g, globstarSentinel)
		.replace(/\*/g, '[^/]*')
		.replace(/\?/g, '[^/]')
		.replaceAll(globstarSentinel, '.*');
	return new RegExp(`^${pattern}$`);
};
