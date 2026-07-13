# Explore Proposals

**Proposals** are the units of work in mcp-vertex. They represent features,
fixes, refactors, and chores that agents can claim, implement, and close.

## The Proposals Board

The sidebar **Proposals** view shows the live board:
- **Ready** — proposals waiting to be claimed
- **In Progress** — actively being worked on
- **Done** — completed and merged

## How agents use proposals

1. An agent calls `auto_work` to find the next actionable proposal
2. It claims a slice via `agent_lock`
3. It implements the changes, runs validation, and closes the slice
4. The proposals plugin coordinates so multiple agents don't collide

Click on any proposal to see its detail view with slices, acceptance
criteria, and status history.
