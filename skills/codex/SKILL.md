---
name: agentq-codex
description: Use Codex as an Agent Queue Origin or token-based Waiter.
---

# Agent Queue for Codex

Use `agentq join --as codex` when this Codex session is the Room Origin.

After implementation work is ready for the next agents, run:

```bash
agentq handoff --body "<handoff summary>" --artifact <path>
```

When Codex starts with `AGENTQ_TOKEN`, it is a Waiter or assigned Agent Instance. Run:

```bash
agentq current --summary
```

Use `--full` only when you need complete Baton bodies or artifact metadata. See `docs/adapter-contract.md`.

If `current` returns an assigned Baton, complete the requested work and submit:

```bash
agentq done --body "<completion summary>" --artifact <path>
```

Do not infer behavior from the Agent Role name. The `AGENTQ_TOKEN` value is the authority for `current` and `done`.
