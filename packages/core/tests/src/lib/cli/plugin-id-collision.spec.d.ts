/**
 * plugin-id-collision.spec.ts
 *
 * R12: two distinct plugins may each ship a tool with the same internal
 * id (e.g. `status`). Their MCP names are namespaced (`a_status`,
 * `b_status`) and never collide, so assembly must succeed — the
 * registration-order uniqueness check runs on the qualified id.
 */
export {};
