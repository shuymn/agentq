# Adapter Contract

This document defines the JSON contract between Agent Queue and runtime adapters. Adapters integrate through five named extension seams:

| Seam | Purpose |
| --- | --- |
| **Enrich** | Inject Agent Queue context when an agent session starts. |
| **Observe** | Detect whether the current Agent Instance is waiting or assigned. |
| **Gate** | Block or allow agent shutdown while assigned work remains. |
| **Execute** | Run runtime-specific Bridge Actions and submit `agentq done`. |
| **Transform** | Compose Follow-up Batons from completed assignments (core default only). |

Agent Queue does not pass Baton content through environment variables. Adapters use the Agent Environment token to call `agentq current` and `agentq done`.

## Agent Environment

When Agent Queue launches an Agent Application through `agentq listen --as <role> -- <command>`, it sets:

| Variable | Meaning |
| --- | --- |
| `AGENTQ_TOKEN` | Authoritative token for `current` and `done`. |
| `AGENTQ_INSTANCE_ID` | Internal Agent Instance id such as `pi-1`. |
| `AGENTQ_ROOM_ID` | Room id for the canonical workspace. |
| `AGENTQ_ROLE` | Agent Role used to register the Waiter. |

Adapters must treat `AGENTQ_TOKEN` as the authority. Do not infer Bridge Actions from the Agent Role name.

Optional:

| Variable | Meaning |
| --- | --- |
| `AGENTQ_BIN` | Path to the `agentq` executable used by hooks. Defaults to `agentq`. |

## `agentq current`

`current` and `status` default to summary output. Use `--full` when the adapter needs complete Baton bodies, artifact metadata, or Done Report details.

### Waiting (`--summary`)

```json
{
  "state": "waiting",
  "instance": {
    "instanceId": "pi-1",
    "role": "pi",
    "afterRole": null
  }
}
```

### Assigned (`--summary`)

```json
{
  "state": "assigned",
  "instance": {
    "instanceId": "claude-1",
    "role": "claude"
  },
  "assignment": {
    "id": "…",
    "role": "claude",
    "baton": {
      "id": "…",
      "bodyPreview": "Follow-up Baton after pi completed…",
      "artifactPaths": ["/path/to/combined.json"]
    },
    "hasDoneReport": false
  }
}
```

### Full output

`agentq current --full` returns the complete store shape, including full Baton bodies, artifact records, and any existing Done Report for the current Agent Instance.

## `agentq status`

Use `--summary` for lightweight room overviews. Use `--full` for complete branch history and nested report bodies.

Summary output includes room id, origin role, handoff state, waiting role counts, active assignment ids/roles, baton previews, and active artifact paths. It omits completed branch history and large nested report bodies.

## `agentq done`

Inputs:

```bash
agentq done --body "<completion summary>" [--artifact <path>]
```

Requirements:

- `AGENTQ_TOKEN` must identify an Agent Instance in an active Baton Assignment.
- The Agent Instance must not already have submitted a Done Report.

Result fields:

| Field | Meaning |
| --- | --- |
| `doneReport` | The submitted Done Report. |
| `completedAssignment` | Present when the last assigned instance completes the assignment. |
| `followUpBaton` | Present when Agent Queue creates a Follow-up Baton for waiting Deferred Waiters. |
| `followUpAssignments` | Assignments created from that Follow-up Baton. |

## Adapter Mapping

### Codex

| Seam | Implementation |
| --- | --- |
| Enrich | `hooks/codex/session-start.ts` adds context when `AGENTQ_TOKEN` is present. |
| Observe | Hooks call `agentq current --summary`. |
| Gate | `hooks/codex/stop.ts` blocks shutdown while `state === "assigned"`. |
| Execute | Agent reads the assigned Baton from `--full` when needed and runs `agentq done`. |
| Transform | Core default Follow-up Composer only. |

### Claude Code

| Seam | Implementation |
| --- | --- |
| Enrich | Monitor/hook prompt when assignment is detected. |
| Observe | `hooks/claude-code/monitor.ts` calls `agentq current --summary`. |
| Gate | Adapter-specific; Agent Queue does not ship a Claude stop hook. |
| Execute | Agent completes follow-up work and runs `agentq done`. |
| Transform | Core default Follow-up Composer only. |

### Pi Queue Bridge

| Seam | Implementation |
| --- | --- |
| Enrich | Pi extension may inject queue context at session start. |
| Observe | Extension polls `agentq current --summary`. |
| Gate | Extension-specific shutdown policy. |
| Execute | Extension maps the assigned Baton to a Pi Slash Command or Workflow, then submits `agentq done`. |
| Transform | Core default Follow-up Composer only; custom prose belongs in an extension composer. |

See `extensions/pi-queue-bridge/` for the reference extension boundary. Coordination Core code must not import Pi workflow names or `/review` behavior.

## Contract Tests

Stable adapter-facing shapes are covered in `tests/adapter-contract.test.ts`. Adapter authors can depend on those normalized fixtures; volatile fields such as timestamps and tokens are stripped in tests.
