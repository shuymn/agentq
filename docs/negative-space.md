# Negative Space

Agent Queue intentionally keeps the Coordination Core small. The following capabilities belong outside core and should be implemented through global adapters, hooks, or standalone extension packages.

| Capability | Why it stays outside core | Intended extension path |
| --- | --- | --- |
| Review workflows | Review strategy depends on the agent runtime and team process. | Pi Queue Bridge maps Batons to `/review`; Codex/Claude adapters inject review prompts locally. |
| Fix strategy | Whether to auto-fix, report-only, or escalate is a runtime decision. | Adapter Execute seam and extension configuration such as `/review --no-fix`. |
| Dashboard UI | Presence and queue visualization are product/UI concerns. | Separate UI or IDE extension that reads `agentq status --summary`. |
| Role-specific behavior | Routing must stay token-based, not role-name based. | Adapter configuration and Bridge Actions in Codex hooks, Claude monitor, or Pi extension code. |
| Follow-up prose customization | Default Follow-up Batons use generic core wording. | Custom `FollowUpComposer` implementations in global adapters or extension packages. |
| Runtime polling loops | Delivery timing differs by Agent Application. | Adapter Observe seam (`agentq current --summary`). |
| Workspace, personal, and org extension scopes | Agent Queue has one global extension scope and intentionally avoids precedence rules between local, personal, and org configuration. | Not supported; see `docs/workspace-extensions.md`. |

## What belongs in core

- Room resolution from canonical cwd
- Origin and Waiter registration
- Agent Environment token generation and lookup
- Handoff creation
- Baton Assignment lifecycle
- Done Report persistence
- Artifact metadata and file storage
- Domain invariants from `CONTEXT.md`
- Default Follow-up Composer for Transform behavior

## Related docs

- Domain language: `CONTEXT.md`
- Adapter JSON contract: `docs/adapter-contract.md`
- Extension scope: `docs/workspace-extensions.md`
