/** Result of a deny-by-default privacy validation pass. */
export interface IPrivacyValidationResult {
	readonly ok: boolean;
	readonly reasonCode?: string | undefined;
}
