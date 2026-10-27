/**
 * account-environment.interface.ts — the environment a provider process
 * starts with.
 */

/**
 * `inherit` keeps the server's environment (only for an invoker built
 * without an environment policy, in tests); `isolated` is the only
 * environment an account's process sees; `refused` says why the account
 * cannot run this invocation at all.
 */
export type IAccountEnvironment =
	| { readonly kind: 'inherit' }
	| {
			readonly kind: 'isolated';
			readonly env: Readonly<Record<string, string>>;
	  }
	| { readonly kind: 'refused'; readonly reason: string };

/** The key an API call is made with, or why the account refuses it. */
export type IAccountApiCredential =
	| { readonly kind: 'key'; readonly key: string }
	| { readonly kind: 'refused'; readonly reason: string };
