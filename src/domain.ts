import { ROLE_PATTERN } from "./constants";
import { AgentQError } from "./errors";

export type WaiterStatus = "waiting" | "assigned";
export type AssignmentStatus = "active" | "completed";

export interface RoomRuleState {
  origin: {
    role: string;
  } | null;
  handoffCreated: boolean;
  waiters: Array<{
    role: string;
    afterRole: string | null;
    status: WaiterStatus;
  }>;
  assignments: Array<{
    role: string;
    status: AssignmentStatus;
  }>;
}

export const parseRole = (value: string, fieldName = "role") => {
  const role = value.trim();
  if (!ROLE_PATTERN.test(role)) {
    throw new AgentQError(
      "invalid-role",
      `${fieldName} must match ${ROLE_PATTERN.toString()} and be 1-64 characters`,
    );
  }
  return role;
};

export const assertCanRegisterOrigin = (state: RoomRuleState) => {
  if (state.origin) {
    throw new AgentQError(
      "origin-exists",
      `Room already has an Origin registered as ${state.origin.role}`,
    );
  }
};

export const assertCanRegisterWaiter = (
  state: RoomRuleState,
  role: string,
  afterRole: string | null,
) => {
  if (afterRole === role) {
    throw new AgentQError("invalid-wait-position", "A role cannot wait after itself");
  }

  const existingWaitingPosition = state.waiters.find(
    (waiter) => waiter.status === "waiting" && waiter.role === role,
  );
  const activeAssignment = state.assignments.find(
    (assignment) => assignment.status === "active" && assignment.role === role,
  );
  if (activeAssignment) {
    throw new AgentQError(
      "role-position-conflict",
      `Agent Role ${role} is already waiting or assigned in another position`,
    );
  }
  if (existingWaitingPosition && existingWaitingPosition.afterRole !== afterRole) {
    throw new AgentQError(
      "role-position-conflict",
      `Agent Role ${role} is already waiting or assigned in another position`,
    );
  }

  if (afterRole !== null && !roleExistsForAfter(state, afterRole)) {
    throw new AgentQError(
      "unknown-after-role",
      `Deferred Waiter target role ${afterRole} must already exist`,
    );
  }
};

export const assertCanCreateHandoff = (state: RoomRuleState) => {
  if (!state.origin) {
    throw new AgentQError("missing-origin", "Room has no Origin");
  }
  if (state.handoffCreated) {
    throw new AgentQError("handoff-exists", "Room already has a Handoff");
  }
  if (!state.waiters.some((waiter) => waiter.status === "waiting" && waiter.afterRole === null)) {
    throw new AgentQError("no-direct-waiters", "Room has no Direct Waiters");
  }
};

export const groupWaitingByRole = <
  TWaiter extends {
    role: string;
    afterRole: string | null;
    status: WaiterStatus;
  },
>(
  waiters: TWaiter[],
  afterRole: string | null,
) => {
  const groups = new Map<string, TWaiter[]>();
  for (const waiter of waiters) {
    if (waiter.status !== "waiting" || waiter.afterRole !== afterRole) {
      continue;
    }
    const current = groups.get(waiter.role) ?? [];
    current.push(waiter);
    groups.set(waiter.role, current);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, groupedWaiters]) => ({
      role,
      waiters: groupedWaiters,
    }));
};

const roleExistsForAfter = (state: RoomRuleState, role: string) =>
  state.waiters.some((waiter) => waiter.status === "waiting" && waiter.role === role) ||
  state.assignments.some(
    (assignment) => assignment.status === "active" && assignment.role === role,
  );

/**
 * Pure function: given all waiters in a room and the role that just completed,
 * returns the grouped deferred waiters that should receive follow-up assignments.
 * Returns an empty array if no follow-up is needed.
 */
export const computeFollowUpRoles = <
  TWaiter extends {
    role: string;
    afterRole: string | null;
    status: WaiterStatus;
  },
>(
  waiters: TWaiter[],
  completedRole: string,
): Array<{ role: string; waiters: TWaiter[] }> => groupWaitingByRole(waiters, completedRole);
