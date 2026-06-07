# Extension Scope

Agent Queue uses a single global extension scope. It does not load workspace-local, personal, or org-scoped extension registries.

## Goal

Keep Coordination Core and adapter contracts stable without introducing scope precedence rules. Runtime-specific behavior still belongs outside core, but it is provided by global adapters, hooks, or standalone extension packages rather than repository-local `.agentq/` loading.

## Supported scope

- Global adapters that customize Bridge Actions, Follow-up composers, or hook wrappers
- Global extension configuration owned by the adapter or extension package
- Explicit adapter contracts documented in `docs/adapter-contract.md`

## Intentionally not supported

- Workspace-local extension discovery under `.agentq/`
- Personal versus workspace configuration precedence
- Org-level extension distribution or policy loading
- Shared extension marketplaces or remote registries

## Current recommendation

Do not implement registry loading or multi-scope composition. Reference adapters such as `extensions/pi-queue-bridge/` should document their global extension boundary and keep runtime-specific behavior out of Coordination Core.

## Deferred separately

Crash recovery and leases beyond current `dismiss` behavior remain separate product decisions; they are not part of extension scope loading.
