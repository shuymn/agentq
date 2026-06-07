export type ErrorCode =
  | "artifact-not-found"
  | "assignment-completed"
  | "assignment-not-found"
  | "baton-not-found"
  | "done-exists"
  | "done-report-not-found"
  | "filesystem-error"
  | "handoff-exists"
  | "invalid-role"
  | "invalid-token"
  | "invalid-wait-position"
  | "invalid-waiter-data"
  | "missing-assignment"
  | "missing-done-report"
  | "missing-origin"
  | "no-direct-waiters"
  | "not-assigned"
  | "origin-exists"
  | "role-position-conflict"
  | "unknown-after-role";

export class AgentQError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AgentQError";
    this.code = code;
  }
}

export const isAgentQError = (error: unknown): error is AgentQError => error instanceof AgentQError;
