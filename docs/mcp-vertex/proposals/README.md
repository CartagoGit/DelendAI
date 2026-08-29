# Proposals

This folder is the proposals store managed by the mcp-vertex
`proposals` plugin. Each proposal is one markdown file with
frontmatter (`id`, `kind`, `status`, `type`, `track`) and lives in
the folder matching its status:

- `ready/` — executable now
- `in-progress/` — someone is on it
- `review/` — done, awaiting review
- `done/` — completed (mirrored into per-kind subfolders)
- `paused/`, `blocked/`, `retired/` — parked states

Create proposals with the `create_proposal` tool (it allocates the
id and validates slices), move them with `proposal_transition`, and
ask `get_proposal_workflow` for the full convention. The registry
index is regenerable at any time via `sync_proposals`.
