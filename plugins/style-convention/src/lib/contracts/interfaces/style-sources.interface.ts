export interface IAstroParts {
	/** Markup with frontmatter/style/script blanked — line numbers intact. */
	readonly markup: string;
	/** Contents of component-local `<style>` blocks (define for this file). */
	readonly styleBlocks: readonly string[];
}

export interface IUsedClass {
	readonly className: string;
	readonly line: number;
}
