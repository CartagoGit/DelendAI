---
slug: auto-work-idle
symptom: "`proposals_auto_work` keeps returning a state like `idle` or `all-claimed` across repeated calls in the same session, with no slice ever assigned, even though `proposal_board`/`compact_status` shows work in `ready/`."
cause: "`idle` is a legitimate terminal state, not an error: every claimable slice is already locked by another agent (`all-claimed`), or the proposal queue genuinely has nothing actionable for the current agent's file scope right now. Calling `auto_work` again immediately, in a tight loop, will not change the answer — it is a polling anti-pattern the loop-detector is specifically designed to catch (see `mcp-vertex-failure-modes` skill, \"never poll\" rule)."
fix: "Do not retry `auto_work` in a loop. Either: (a) wait for a `lock-released` push notification (the `notification` plugin) before calling it again, (b) pick a different, genuinely unclaimed proposal if one exists outside the current scope, or (c) if the session has no more useful work, stop and report a `SIN PROPUESTAS LIBRES` close marker instead of polling. A hard anti-idle brake in `auto_work` is tracked as a known gap (master audit, line ~228) — until it lands, the discipline is on the caller."
tags: [proposals, multi-agent, auto_work]
closedBy: "master audit a00013 — open asterisk, no proposal yet"
---

`idle` and `all-claimed` are both intentional, well-defined responses from
`auto_work` — they tell you "nothing to do right now", not "something is
broken". Treat them the same way you'd treat an empty queue: stop pulling,
wait for a push, or escalate to a human.
