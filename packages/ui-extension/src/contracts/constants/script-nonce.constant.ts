/**
 * Stands in a policy's `scriptSrc` for the nonce `injectCspMeta` draws for
 * each document. An injected `<script>` has no nonce and does not run, as
 * it would under `'unsafe-inline'`.
 */
export const SCRIPT_NONCE = "'nonce'";
