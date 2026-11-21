/**
 * publication-join.interface.ts — what joining an open publication did.
 */
export type IPublicationJoin =
	| { readonly joined: boolean; readonly refusal?: undefined }
	| { readonly joined: false; readonly refusal: string };
