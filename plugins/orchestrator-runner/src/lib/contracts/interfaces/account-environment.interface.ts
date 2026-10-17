/**
 * account-environment.interface.ts — the environment a provider process
 * starts with.
 */

/**
 * `inherit` keeps the server's environment (a roster entry with no
 * account, as before accounts existed); `isolated` is the only
 * environment an account's process sees; `refused` says why the account
 * cannot run this invocation at all.
 */
export type AccountEnvironment =
	| { readonly kind: 'inherit' }
	| {
			readonly kind: 'isolated';
			readonly env: Readonly<Record<string, string>>;
	  }
	| { readonly kind: 'refused'; readonly reason: string };
