import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATABASE_FILENAME } from "../src/constants";
import { AgentQError } from "../src/errors";
import { AgentQueueStore } from "../src/store";

let store: AgentQueueStore;
let dataDir: string;
let workspace: string;

const setup = () => {
  dataDir = mkdtempSync(join(tmpdir(), "agentq-store-"));
  workspace = mkdtempSync(join(tmpdir(), "agentq-workspace-"));
  store = new AgentQueueStore({ dataDir });
};

const teardown = () => {
  store?.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
};

beforeEach(setup);
afterEach(teardown);

describe("AgentQueueStore", () => {
  test("join registers one origin per room", () => {
    const origin = store.registerOrigin({ cwd: workspace, role: "codex" });

    expect(origin.role).toBe("codex");
    expect(() => store.registerOrigin({ cwd: workspace, role: "another" })).toThrow(
      "already has an Origin",
    );
  });

  test("handoff creates one assignment per direct role group and excludes deferred waiters", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi1 = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    const pi2 = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.registerWaiter({
      cwd: workspace,
      role: "lint",
      afterRole: null,
      launchCommand: ["lint"],
    });
    const claude = store.registerWaiter({
      cwd: workspace,
      role: "claude",
      afterRole: "pi",
      launchCommand: ["claude"],
    });

    const handoff = store.createHandoff({ cwd: workspace, body: "please review" });

    expect(handoff.assignments).toHaveLength(2);
    const piAssignment = handoff.assignments.find((assignment) => assignment.role === "pi");
    expect(piAssignment?.agentInstanceIds).toEqual([pi1.instanceId, pi2.instanceId]);
    expect(handoff.assignments.some((assignment) => assignment.role === "claude")).toBe(false);
    expect(store.getCurrentByToken(claude.token).state).toBe("waiting");
  });

  test("done waits for every assigned instance, then creates a follow-up baton for deferred waiters", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi1 = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    const pi2 = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    const claude = store.registerWaiter({
      cwd: workspace,
      role: "claude",
      afterRole: "pi",
      launchCommand: ["claude"],
    });
    store.createHandoff({ cwd: workspace, body: "please review" });

    const firstDone = store.submitDoneReport({
      token: pi1.token,
      body: "review result one",
    });
    expect(firstDone.completedAssignment).toBeNull();
    expect(store.getCurrentByToken(claude.token).state).toBe("waiting");

    const artifactPath = join(dataDir, "review-two.md");
    writeFileSync(artifactPath, "review result two artifact");
    const secondDone = store.submitDoneReport({
      token: pi2.token,
      body: "review result two",
      artifactPath,
    });

    expect(secondDone.completedAssignment?.role).toBe("pi");
    expect(secondDone.followUpAssignments).toHaveLength(1);

    const claudeCurrent = store.getCurrentByToken(claude.token);
    expect(claudeCurrent.state).toBe("assigned");
    if (claudeCurrent.state !== "assigned") {
      throw new Error("expected claude to be assigned");
    }

    expect(claudeCurrent.assignment.role).toBe("claude");
    expect(claudeCurrent.assignment.baton.artifacts).toHaveLength(1);
    const combinedArtifact = claudeCurrent.assignment.baton.artifacts[0];
    if (!combinedArtifact) {
      throw new Error("missing combined artifact");
    }
    const combined = JSON.parse(readFileSync(combinedArtifact.storedPath, "utf8"));
    expect(combined.doneReports.map((report: { body: string }) => report.body)).toEqual([
      "review result one",
      "review result two",
    ]);
  });

  test("completion without deferred waiters ends the branch without storing an unassigned follow-up", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.createHandoff({ cwd: workspace, body: "please review" });

    const done = store.submitDoneReport({ token: pi.token, body: "done" });

    expect(done.completedAssignment?.role).toBe("pi");
    expect(done.followUpAssignments).toEqual([]);
    expect(store.getStatus({ cwd: workspace }).activeAssignments).toEqual([]);
  });

  test("dismiss clears active state but leaves artifact files intact", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    const sourceArtifact = join(dataDir, "handoff.md");
    writeFileSync(sourceArtifact, "implementation notes");
    const handoff = store.createHandoff({
      cwd: workspace,
      body: "please review",
      artifactPath: sourceArtifact,
    });
    const storedArtifact = handoff.baton.artifacts[0];
    if (!storedArtifact) {
      throw new Error("missing stored artifact");
    }

    store.dismissRoom({ cwd: workspace });

    const status = store.getStatus({ cwd: workspace });
    expect(status.origin).toBeNull();
    expect(status.directWaiters).toEqual([]);
    expect(status.activeAssignments).toEqual([]);
    expect(existsSync(storedArtifact.storedPath)).toBe(true);
  });

  test("createHandoff throws artifact-not-found for missing artifact path", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });

    try {
      store.createHandoff({
        cwd: workspace,
        body: "please review",
        artifactPath: join(workspace, "missing.md"),
      });
      throw new Error("expected createHandoff to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentQError);
      expect((error as AgentQError).code).toBe("artifact-not-found");
    }
  });

  test("submitDoneReport throws artifact-not-found for missing artifact path", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.createHandoff({ cwd: workspace, body: "please review" });

    try {
      store.submitDoneReport({
        token: pi.token,
        body: "done",
        artifactPath: join(workspace, "missing.md"),
      });
      throw new Error("expected submitDoneReport to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentQError);
      expect((error as AgentQError).code).toBe("artifact-not-found");
    }
  });

  test("getCurrentByToken throws for invalid token", () => {
    expect(() => store.getCurrentByToken("nonexistent")).toThrow("not registered");
  });

  test("submitDoneReport throws for duplicate done", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi1 = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.createHandoff({ cwd: workspace, body: "please review" });

    store.submitDoneReport({ token: pi1.token, body: "first done" });
    expect(() => store.submitDoneReport({ token: pi1.token, body: "second done" })).toThrow(
      "already exists",
    );
  });

  test("leaveWaiter removes a waiting waiter", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });

    const result = store.leaveWaiter(pi.instanceId);
    expect(result).toEqual({ removed: true });

    expect(() => store.getCurrentByToken(pi.token)).toThrow("not registered");
  });

  test("leaveWaiter returns false for assigned waiter", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.createHandoff({ cwd: workspace, body: "please review" });

    const result = store.leaveWaiter(pi.instanceId);
    expect(result).toEqual({ removed: false });
  });

  test("getStatus throws invalid-waiter-data for corrupt launch_command_json", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });

    const db = new Database(join(dataDir, DATABASE_FILENAME));
    try {
      db.run("update waiters set launch_command_json = ? where instance_id = ?", [
        "not-json",
        pi.instanceId,
      ]);
    } finally {
      db.close();
    }

    expect(() => store.getStatus({ cwd: workspace })).toThrow(AgentQError);
    try {
      store.getStatus({ cwd: workspace });
    } catch (error) {
      expect((error as AgentQError).code).toBe("invalid-waiter-data");
    }
  });

  test("status returns empty state for room with no activity", () => {
    const status = store.getStatus({ cwd: workspace });
    expect(status.origin).toBeNull();
    expect(status.directWaiters).toEqual([]);
    expect(status.deferredWaiters).toEqual([]);
    expect(status.activeAssignments).toEqual([]);
    expect(status.completedBranches).toEqual([]);
    expect(status.artifacts).toEqual([]);
    expect(status.handoffCreated).toBe(false);
  });

  test("submitDoneReport throws when waiter is still waiting (not-assigned)", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    const pi = store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });

    expect(() => store.submitDoneReport({ token: pi.token, body: "done" })).toThrow(
      "still waiting",
    );
  });

  test("dismiss and rejoin lifecycle allows new origin registration", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.createHandoff({ cwd: workspace, body: "first round" });

    store.dismissRoom({ cwd: workspace });

    const statusAfterDismiss = store.getStatus({ cwd: workspace });
    expect(statusAfterDismiss.origin).toBeNull();
    expect(statusAfterDismiss.activeAssignments).toEqual([]);

    const newOrigin = store.registerOrigin({ cwd: workspace, role: "codex" });
    expect(newOrigin.role).toBe("codex");

    const newStatus = store.getStatus({ cwd: workspace });
    expect(newStatus.origin?.role).toBe("codex");
  });

  test("getStatus shows deferred waiters", () => {
    store.registerOrigin({ cwd: workspace, role: "codex" });
    store.registerWaiter({
      cwd: workspace,
      role: "pi",
      afterRole: null,
      launchCommand: ["pi"],
    });
    store.registerWaiter({
      cwd: workspace,
      role: "claude",
      afterRole: "pi",
      launchCommand: ["claude"],
    });

    const status = store.getStatus({ cwd: workspace });
    expect(status.directWaiters).toHaveLength(1);
    expect(status.directWaiters.map((w) => w.role)).toEqual(["pi"]);
    expect(status.deferredWaiters).toHaveLength(1);
    expect(status.deferredWaiters.map((w) => ({ role: w.role, afterRole: w.afterRole }))).toEqual([
      { role: "claude", afterRole: "pi" },
    ]);
  });
});
