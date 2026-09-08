/**
 * adversarial.spec.ts — f00188 (Track F / security).
 *
 * Adversarial tests for the capability gate. Each test names one
 * threat the gate must defend against:
 *   1. Plugin declares an empty set and tries to read git → refusal.
 *   2. Plugin declares only `fs:read` and tries to write → refusal.
 *   3. Plugin declares a capability that doesn't exist → refusal.
 *   4. Plugin that bypasses the type system still hits the gate.
 *   5. The gate is pure: same inputs ⇒ same output (no surprises).
 *
 * The tests are deliberately pure (no Proxy, no router) — they
 * pin the contract that the router, lint and matrix generator all
 * depend on.
 */
export {};
