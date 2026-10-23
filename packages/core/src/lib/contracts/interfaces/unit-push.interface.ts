/**
 * unit-push.interface.ts — what pushing a unit's branch after a commit did.
 */

export type IUnitPush =
	| { readonly status: 'skipped'; readonly reason: string }
	| {
			readonly status: 'pushed';
			readonly branch: string;
			readonly remote: string;
	  }
	| {
			readonly status: 'refused';
			readonly branch: string;
			readonly remote: string;
			readonly detail: string;
			/** The command that brings the branch in step, never a force. */
			readonly repair: string;
	  };
