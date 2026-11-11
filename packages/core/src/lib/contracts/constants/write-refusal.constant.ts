/**
 * write-refusal.constant.ts — the code a write refused in the shared
 * checkout carries (x00719).
 *
 * A caller that must tell "the tool is broken" from "the policy said no",
 * such as `verify:tools` probing every tool in the checkout agents use,
 * reads this code instead of the prose around it.
 */
export const SHARED_CHECKOUT_WRITE_REFUSED = 'shared-checkout-write-refused';
