import { describe, expect, test } from "bun:test";
import {
  assertCanCreateHandoff,
  assertCanRegisterOrigin,
  assertCanRegisterWaiter,
  computeFollowUpRoles,
  groupWaitingByRole,
  parseRole,
  type RoomRuleState,
} from "../src/domain";

const emptyState = (): RoomRuleState => ({
  origin: null,
  handoffCreated: false,
  waiters: [],
  assignments: [],
});

describe("parseRole", () => {
  test("accepts valid role names", () => {
    expect(parseRole("a")).toBe("a");
    expect(parseRole("codex")).toBe("codex");
    expect(parseRole("my-role")).toBe("my-role");
    expect(parseRole("my_role")).toBe("my_role");
    expect(parseRole("Role123")).toBe("Role123");
    expect(parseRole("a".repeat(64))).toBe("a".repeat(64));
  });

  test("trims whitespace", () => {
    expect(parseRole("  codex  ")).toBe("codex");
  });

  test("rejects empty string", () => {
    expect(() => parseRole("")).toThrow("must match");
    expect(() => parseRole("   ")).toThrow("must match");
  });

  test("rejects role longer than 64 characters", () => {
    expect(() => parseRole("a".repeat(65))).toThrow("must match");
  });

  test("rejects role with special characters", () => {
    expect(() => parseRole("my role")).toThrow("must match");
    expect(() => parseRole("my@role")).toThrow("must match");
    expect(() => parseRole("my.role")).toThrow("must match");
  });

  test("uses custom field name in error message", () => {
    expect(() => parseRole("", "after role")).toThrow("after role must match");
  });
});

describe("domain rules", () => {
  test("a room accepts one origin and rejects a second origin", () => {
    expect(() => assertCanRegisterOrigin(emptyState())).not.toThrow();
    expect(() =>
      assertCanRegisterOrigin({
        ...emptyState(),
        origin: { role: "codex" },
      }),
    ).toThrow("already has an Origin");
  });

  test("direct same-role waiters merge into one waiting position", () => {
    const state: RoomRuleState = {
      ...emptyState(),
      waiters: [{ role: "pi", afterRole: null, status: "waiting" }],
    };

    expect(() => assertCanRegisterWaiter(state, "pi", null)).not.toThrow();
  });

  test("a role cannot wait in two positions", () => {
    const state: RoomRuleState = {
      ...emptyState(),
      waiters: [{ role: "pi", afterRole: null, status: "waiting" }],
    };

    expect(() => assertCanRegisterWaiter(state, "pi", "claude")).toThrow(
      "already waiting or assigned in another position",
    );
  });

  test("deferred waiters require the referenced role to already exist", () => {
    expect(() => assertCanRegisterWaiter(emptyState(), "claude", "pi")).toThrow(
      "must already exist",
    );

    expect(() =>
      assertCanRegisterWaiter(
        {
          ...emptyState(),
          waiters: [{ role: "pi", afterRole: null, status: "waiting" }],
        },
        "claude",
        "pi",
      ),
    ).not.toThrow();

    expect(() =>
      assertCanRegisterWaiter(
        {
          ...emptyState(),
          assignments: [{ role: "pi", status: "active" }],
        },
        "claude",
        "pi",
      ),
    ).not.toThrow();
  });

  test("handoff requires direct waiters and can happen at most once", () => {
    expect(() =>
      assertCanCreateHandoff({
        ...emptyState(),
        origin: { role: "codex" },
      }),
    ).toThrow("no Direct Waiters");

    expect(() =>
      assertCanCreateHandoff({
        handoffCreated: false,
        origin: { role: "codex" },
        waiters: [{ role: "pi", afterRole: null, status: "waiting" }],
        assignments: [],
      }),
    ).not.toThrow();

    expect(() =>
      assertCanCreateHandoff({
        handoffCreated: true,
        origin: { role: "codex" },
        waiters: [{ role: "pi", afterRole: null, status: "waiting" }],
        assignments: [],
      }),
    ).toThrow("already has a Handoff");
  });

  test("handoff requires an origin", () => {
    expect(() =>
      assertCanCreateHandoff({
        ...emptyState(),
        waiters: [{ role: "pi", afterRole: null, status: "waiting" }],
      }),
    ).toThrow("no Origin");
  });

  test("a role cannot wait after itself", () => {
    expect(() => assertCanRegisterWaiter(emptyState(), "pi", "pi")).toThrow(
      "cannot wait after itself",
    );
  });
});

describe("groupWaitingByRole", () => {
  test("groups waiting waiters by role, filtering by afterRole", () => {
    const pi1 = { role: "pi", afterRole: null, status: "waiting" as const };
    const pi2 = { role: "pi", afterRole: null, status: "waiting" as const };
    const lint = { role: "lint", afterRole: null, status: "waiting" as const };
    const claude = { role: "claude", afterRole: "pi", status: "waiting" as const };
    const piAssigned = { role: "pi", afterRole: null, status: "assigned" as const };
    const waiters = [pi1, pi2, lint, claude, piAssigned];

    const direct = groupWaitingByRole(waiters, null);
    expect(direct).toEqual([
      { role: "lint", waiters: [lint] },
      { role: "pi", waiters: [pi1, pi2] },
    ]);

    const deferred = groupWaitingByRole(waiters, "pi");
    expect(deferred).toEqual([{ role: "claude", waiters: [claude] }]);
  });

  test("returns empty array when no waiters match", () => {
    expect(groupWaitingByRole([], null)).toEqual([]);
    expect(
      groupWaitingByRole([{ role: "pi", afterRole: null, status: "waiting" }], "nonexistent"),
    ).toEqual([]);
  });
});

describe("computeFollowUpRoles", () => {
  test("returns deferred waiters grouped by role for the completed role", () => {
    const waiters = [
      { role: "claude", afterRole: "pi", status: "waiting" as const },
      { role: "lint", afterRole: "pi", status: "waiting" as const },
      { role: "other", afterRole: "codex", status: "waiting" as const },
    ];

    const result = computeFollowUpRoles(waiters, "pi");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.role)).toEqual(["claude", "lint"]);
  });

  test("returns empty array when no waiters are deferred for the completed role", () => {
    const waiters = [{ role: "claude", afterRole: "codex", status: "waiting" as const }];
    expect(computeFollowUpRoles(waiters, "pi")).toEqual([]);
  });
});
