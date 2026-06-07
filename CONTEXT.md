# Agent Queue

This document defines the language for Agent Queue, a lightweight local coordination mechanism for handoffs between coding agents working in the same workspace.

## Language

**Agent Queue**:
A local coordination application that manages work handoffs per canonical current working directory without depending on a specific agent runtime. It owns the CLI and storage, while runtime-specific adapters integrate it with Codex, the Pi Coding Agent, or Claude Code.
_Avoid_: pi extension, messenger, chat app

**Pi Queue Bridge**:
A **Pi Coding Agent Extension** that connects **Agent Queue** assignments to Pi Coding Agent Slash Commands or Workflows, such as starting a review Workflow Run and publishing its result back to Agent Queue.
_Avoid_: Agent Queue, bridge script, pi messenger

**Baton**:
A work handoff document created by an **Agent Instance**, or by **Agent Queue** from a completed **Baton Assignment**, to describe what happened and what the next receiver should do. A Baton contains a body and optional **Artifact** references, but it does not by itself define which Agent Instances receive it.
_Avoid_: message, queue item, task, assignment

**Agent Application**:
Codex, the Pi Coding Agent, or Claude Code; the concrete coding-agent application hosting an **Agent Instance**. Agent Queue may record the launch command for visibility, but routing does not depend on the Agent Application.
_Avoid_: Agent, runtime

**Agent Role**:
The short name an **Agent Instance** joins or listens as, such as `codex`, `pi`, or `claude`. Multiple Agent Instances may share one Agent Role, and the role does not have to match the Agent Application command that hosts it.
_Avoid_: Agent name, user name

**Agent Instance**:
One live participant in a **Room**. When several participants use the same **Agent Role**, Agent Queue assigns internal instance names such as `pi-1` and `pi-2`.
_Avoid_: Agent, worker, session

**Agent Environment**:
The environment variables Agent Queue passes when it launches an **Agent Application** as a **Waiter**, including the token that identifies the **Agent Instance** for later Done Reports. The token is authoritative: the Agent Application or adapter can use it without knowing which **Agent Role** it is serving. Waiter registration must launch the Agent Application with `agentq listen --as <role> -- <agent command>`, such as `agentq listen --as pi -- pi`; Agent Queue registers the Waiter and starts the application immediately. There is no separate `--exec` form, and running `agentq listen --as <role>` from inside an already-started Agent Application is invalid because the parent process would not receive the Agent Environment.
_Avoid_: Shell setup, exported env, exec mode

**Room**:
A coordination scope derived from the canonical current working directory. Agent Queue does not require users or agents to choose a room id because one workspace has at most one active handoff flow.
_Avoid_: Team, channel, project

**Origin**:
The single starting **Agent Instance** for a **Room**. The Origin is registered with `agentq join --as <role>`, may join before or after its Agent Application starts, and is the sender of the initial **Handoff**. The join command may run from inside an already-started Agent Application. A Room rejects a second Origin join, so the Origin does not need an Agent Environment token.
_Avoid_: Join, starter, root agent

**Waiter**:
An **Agent Instance** that has registered readiness to receive a future **Baton**. A Waiter is normally one-shot: once selected by a **Handoff**, it becomes part of a **Baton Assignment** instead of continuing to wait.
_Avoid_: Listener, subscriber, ready agent

**Direct Waiters**:
**Waiters** in a **Room** that are next in line to receive a Baton after the current incomplete **Baton Assignment**, if any. Direct Waiters may include multiple Agent Roles at the same waiting position, and same-role Direct Waiters merge into one role group; splitting same-role work requires using a different Agent Role. An Agent Role may wait in only one position at a time within a Room.
_Avoid_: Cohort, listener group, fan-out group

**Deferred Waiter**:
A **Waiter** that is not in the direct waiting position, but waits after one existing named **Agent Role** finishes its current waiting or assigned work. `--after <role>` accepts exactly one Agent Role and is valid only when that role already has **Direct Waiters**, **Deferred Waiters**, or an incomplete **Baton Assignment**; registering before the referenced role exists is an error, not a future reservation. If more Agent Instances join the referenced same-role Waiters before their Baton Assignment is created, the Deferred Waiter waits for them too; excluding a same-role Waiter requires that instance to listen under a different Agent Role. Multiple different Agent Roles may wait after the same role and receive sibling Follow-up Baton Assignments; if the same Agent Role is already waiting elsewhere in the Room, another listen for that role fails instead of creating a second waiting position.
_Avoid_: Dependent listener, after hook, downstream waiter

**Handoff**:
The act of creating the single initial **Baton** from the **Origin** and assigning it to all current **Direct Waiters** in the **Room**. A Handoff snapshots Direct Waiters at that moment, excludes **Deferred Waiters**, and fails when no Direct Waiters exist. Only the Origin creates the Handoff, and it can do so at most once per Room; Agent Instances assigned by Baton Assignments submit Done Reports instead. When Direct Waiters contain multiple Agent Roles, the same Baton is assigned to each role group separately.
_Avoid_: Send, publish, enqueue

**Baton Assignment**:
The assignment of one **Baton** to one or more **Agent Instances** selected from **Direct Waiters**. A Baton Assignment completes only after every assigned Agent Instance submits a **Done Report**.
_Avoid_: Cohort, job, delivery

**Done Report**:
A completion report from an **Agent Instance** included in a **Baton Assignment**. It may include a body and **Artifact** references. Only Agent Instances assigned by a Baton Assignment can submit Done Reports; an initial worker that is not assigned yet creates a Handoff instead of reporting done.
_Avoid_: Reply, response, ack

**Artifact**:
A file referenced by a **Baton** or **Done Report** when the content is too large or too structured to keep in the body.
_Avoid_: Attachment, payload file

**Combined Artifact**:
An **Artifact** produced by **Agent Queue** from all Done Reports in a completed **Baton Assignment**, usually to pass multiple parallel results to a later **Waiter** as one input. A Combined Artifact preserves each Done Report separately instead of summarizing or merging their content.
_Avoid_: Summary, merged message, aggregate

**Follow-up Baton**:
A **Baton** produced by **Agent Queue** after a **Baton Assignment** completes, using the completed assignment's source Baton and a **Combined Artifact** built from its Done Reports. Follow-up Batons are assigned only to Deferred Waiters that are already waiting behind the completed Agent Role; if no Deferred Waiters are waiting at completion time, that branch ends instead of storing an unassigned Follow-up Baton.
_Avoid_: Next message, aggregate handoff, automatic reply

**Adapter Delivery**:
The runtime-specific way an adapter notices that its **Agent Instance** has a **Baton Assignment**. Pi may use a bridge extension, Claude Code may use monitor/hooks, and Codex may use lifecycle hooks; Agent Queue only provides token-based lookup and storage.
_Avoid_: Push notification, polling loop, hook

**Bridge Action**:
Runtime-specific behavior triggered when an **Agent Instance** receives a **Baton** through a **Baton Assignment**. The Agent Application adapter decides the Bridge Action using the Agent Environment token and local adapter configuration, not by inferring behavior from the Agent Role name. Agent Queue does not pass Baton content through environment variables; adapters pull the current Baton Assignment from Agent Queue storage using the token. The **Pi Queue Bridge** can map a Baton to a Pi Coding Agent Slash Command or Workflow, while Codex and Claude Code adapters may express the same Baton as developer context or a continuation prompt.
_Avoid_: Task type, command handler, listener

**Leave**:
Normal shutdown cleanup performed by Agent Queue after an **Agent Application** launched through `agentq listen --as <role> -- <agent command>` exits. Leave removes the **Agent Instance** from waiting state if it never received a Baton; if it exits after receiving a Baton but before a Done Report, the **Baton Assignment** remains incomplete until the **Room** is dismissed.
_Avoid_: Logout, disconnect, stale cleanup

**Dismiss**:
An explicit command that tears down the current **Room** and clears its waiting and assignment state without deleting **Artifacts**. Any participant may dismiss the Room; this is the recovery path for abandoned or incomplete work in the initial design.
_Avoid_: Reset, delete, cleanup

## Example dialogue

Dev: Five Pi Coding Agent processes called `listen --as pi`, and then Codex calls `handoff`. Are those Pi Coding Agent processes a Cohort?
Domain expert: No. They are `pi` Direct Waiters until the Handoff; after the Handoff, they are Agent Instances in one Baton Assignment.

Dev: Can Claude call `listen --as claude --after pi` before any Pi Coding Agent process is listening?
Domain expert: No. `--after pi` needs existing `pi` Direct Waiters or an incomplete Baton Assignment produced from them; Agent Queue does not reserve against future Direct Waiters.

Dev: Does a Baton know it is going to pi or Claude?
Domain expert: No. The Baton is the handoff document. The Handoff creates a Baton Assignment that decides which Agent Instances receive it.
