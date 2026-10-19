# CP-10: production registration never wires candidate handoff

Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

## Production call path

`plugins/commit-policy/src/index.ts` calls `createPolicyPersistence` while registering the plugin. The options passed at lines 534–555 are `policy`, `run`, `wip`, `agentId`, `agentDeclared`, `resolveTopic`, `remote`, and `runtimeBehindCheckout`; no `integration` port is passed. The interface declares that port optional (`wip-persistence.interface.ts:27`).

After a successful durable checkpoint, `wip-persistence.ts:297–305` calls `handOff` with `options.integration`. For an eligible candidate under a PR policy, `handOff` returns `attempted: false` with reason `no integration engine is wired into commit-policy; the candidate is checkpointed and waiting` when the port is absent (`:344–358`). It calls `submit` only when a port exists (`:360–371`).

The repository's configured profile is `shared-checkout-pr` (`delendai.config.json:13`); the corresponding profile sets `integration.requiresPullRequest: true` (`packages/core/src/lib/development-policy/profiles.ts:103–106`). The core factory `createIntegrationEngine` exists (`packages/core/src/lib/integration-engine/index.ts:106`) but repository production TypeScript has no call site; the only call is in the test harness (`packages/core/tests/src/lib/integration-engine/harness.ts:117`).

## Test coverage and limit

`plugins/commit-policy/tests/src/lib/persistence/engine-policy-routing.spec.ts:200–224` builds the `shared-checkout-pr` policy and injects a mock `integration.submit`, then asserts it was called and returned `opened`. This proves the port path works when an external host supplies the port; it does not exercise the production registration. No external forge was contacted and no PR was opened.

## Conclusion

For this repository's PR-required profile, production `commit-policy` persists a candidate to the WIP ref but has no wired caller that submits it to the core integration engine. The status is surfaced honestly as waiting, so this is missing automatic integration functionality rather than silent data loss. The configured workflow can still be completed manually outside this call path; that workaround does not fulfill the plugin's documented candidate-handoff behavior.
