/** The unit a checkout belongs to, as far as its branch says. */
export interface IForeignUnit {
	readonly branch: string;
	readonly kind: string;
	readonly proposal: string;
}
