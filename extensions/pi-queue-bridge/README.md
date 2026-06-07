# Pi Queue Bridge (Reference Extension)

This directory is the reference boundary for Pi-specific Agent Queue integration. Coordination Core must not import Pi workflow names, `/review` behavior, or Pi event types.

## Purpose

The Pi Queue Bridge connects Agent Queue assignments to Pi Coding Agent Slash Commands or Workflows. It implements the adapter seams documented in `docs/adapter-contract.md`:

| Seam | Reference behavior |
| --- | --- |
| Enrich | Optional session-start context when `AGENTQ_TOKEN` is present. |
| Observe | Poll `agentq current --summary` to detect assigned work. |
| Gate | Extension-specific shutdown policy while assignments remain active. |
| Execute | Map an assigned Baton to a Pi workflow and submit `agentq done`. |
| Transform | Use the core default Follow-up Composer unless a global extension package overrides it. |

## Bridge Action mapping

The reference mapping lives in extension configuration rather than core:

```json
{
  "bridgeAction": {
    "command": "/review",
    "args": ["--no-fix"]
  }
}
```

Adapters should read the assigned Baton with `agentq current --full` when they need complete artifact metadata, then publish results back with:

```bash
agentq done --body "<workflow summary>" --artifact <path>
```

## Implementation status

This repository ships the contract and reference configuration only. A full Pi extension package can copy this boundary and implement Observe/Execute against the stable JSON fixtures in `tests/adapter-contract.test.ts`.

## Negative space

Review workflow choice, fix strategy, and Pi-specific event handling belong here—not in `src/store.ts`, `src/cli.ts`, or other Coordination Core modules.
