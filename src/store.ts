import { Database, type SQLQueryBindings } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ArtifactStore, type StoredArtifactInput } from "./artifacts";
import { DATABASE_FILENAME } from "./constants";
import {
  type AssignmentStatus,
  assertCanCreateHandoff,
  assertCanRegisterOrigin,
  assertCanRegisterWaiter,
  computeFollowUpRoles,
  groupWaitingByRole,
  parseRole,
  type RoomRuleState,
  type WaiterStatus,
} from "./domain";
import { AgentQError } from "./errors";
import { defaultFollowUpComposer } from "./follow-up-composer";
import { type RoomReference, resolveRoom } from "./room";
import { initializeSchema } from "./schema";

interface StoreOptions {
  dataDir: string;
}

export interface OriginRecord {
  roomId: string;
  instanceId: string;
  role: string;
  createdAt: string;
}

export interface WaiterRecord {
  roomId: string;
  instanceId: string;
  role: string;
  token: string;
  afterRole: string | null;
  status: WaiterStatus;
  assignmentId: string | null;
  launchCommand: string[];
  createdAt: string;
}

export interface ArtifactRecord {
  id: string;
  roomId: string;
  kind: string;
  sourcePath: string | null;
  storedPath: string;
  metadataJson: string | null;
  createdAt: string;
}

export interface BatonRecord {
  id: string;
  roomId: string;
  sourceAssignmentId: string | null;
  body: string;
  createdAt: string;
  artifacts: ArtifactRecord[];
}

export interface AssignmentRecord {
  id: string;
  roomId: string;
  batonId: string;
  role: string;
  status: AssignmentStatus;
  agentInstanceIds: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface DoneReportRecord {
  id: string;
  assignmentId: string;
  agentInstanceId: string;
  body: string;
  createdAt: string;
  artifacts: ArtifactRecord[];
}

export type CurrentResult =
  | {
      state: "waiting";
      instance: WaiterRecord;
    }
  | {
      state: "assigned";
      instance: WaiterRecord;
      assignment: AssignmentRecord & {
        baton: BatonRecord;
        doneReport: DoneReportRecord | null;
      };
    };

export interface StatusResult {
  room: RoomReference;
  handoffCreated: boolean;
  origin: OriginRecord | null;
  directWaiters: Array<{ role: string; instances: string[] }>;
  deferredWaiters: Array<{ role: string; afterRole: string; instances: string[] }>;
  activeAssignments: Array<
    AssignmentRecord & {
      baton: BatonRecord;
      doneReports: DoneReportRecord[];
    }
  >;
  completedBranches: Array<
    AssignmentRecord & {
      baton: BatonRecord;
      doneReports: DoneReportRecord[];
    }
  >;
  artifacts: ArtifactRecord[];
}

interface RoomRow {
  id: string;
  canonical_cwd: string;
  handoff_created_at: string | null;
  created_at: string;
}

interface OriginRow {
  room_id: string;
  instance_id: string;
  role: string;
  created_at: string;
}

interface WaiterRow {
  room_id: string;
  instance_id: string;
  role: string;
  token: string;
  after_role: string | null;
  status: WaiterStatus;
  assignment_id: string | null;
  launch_command_json: string;
  created_at: string;
}

interface AssignmentRow {
  id: string;
  room_id: string;
  baton_id: string;
  role: string;
  status: AssignmentStatus;
  created_at: string;
  completed_at: string | null;
}

interface BatonRow {
  id: string;
  room_id: string;
  source_assignment_id: string | null;
  body: string;
  created_at: string;
}

interface DoneReportRow {
  id: string;
  assignment_id: string;
  agent_instance_id: string;
  body: string;
  created_at: string;
}

interface ArtifactRow {
  id: string;
  room_id: string;
  kind: string;
  source_path: string | null;
  stored_path: string;
  metadata_json: string | null;
  created_at: string;
}

export class AgentQueueStore {
  private readonly db: Database;
  private readonly artifactStore: ArtifactStore;

  constructor(options: StoreOptions) {
    mkdirSync(options.dataDir, { recursive: true });
    this.db = new Database(join(options.dataDir, DATABASE_FILENAME));
    this.artifactStore = new ArtifactStore(options.dataDir);
    initializeSchema(this.db);
  }

  close() {
    this.db.close();
  }

  removeRoomArtifacts(roomId: string) {
    this.artifactStore.removeRoomArtifacts(roomId);
  }

  registerOrigin(input: { cwd?: string; role: string }): OriginRecord {
    const role = parseRole(input.role);
    const room = this.ensureRoom(input.cwd);
    return this.transaction(() => {
      assertCanRegisterOrigin(this.getRuleState(room.id));
      const createdAt = nowIso();
      const origin: OriginRecord = {
        roomId: room.id,
        instanceId: `${role}-origin`,
        role,
        createdAt,
      };
      this.execute(
        "insert into origins (room_id, instance_id, role, created_at) values (?, ?, ?, ?)",
        origin.roomId,
        origin.instanceId,
        origin.role,
        origin.createdAt,
      );
      return origin;
    });
  }

  registerWaiter(input: {
    cwd?: string;
    role: string;
    afterRole: string | null;
    launchCommand: string[];
  }): WaiterRecord {
    const role = parseRole(input.role);
    const afterRole = input.afterRole === null ? null : parseRole(input.afterRole, "after role");
    const room = this.ensureRoom(input.cwd);
    return this.transaction(() => {
      assertCanRegisterWaiter(this.getRuleState(room.id), role, afterRole);
      const instanceId = this.nextInstanceId(room.id, role);
      const createdAt = nowIso();
      const waiter: WaiterRecord = {
        roomId: room.id,
        instanceId,
        role,
        token: randomUUID(),
        afterRole,
        status: "waiting",
        assignmentId: null,
        launchCommand: input.launchCommand,
        createdAt,
      };
      this.execute(
        `insert into waiters
					(room_id, instance_id, role, token, after_role, status, assignment_id, launch_command_json, created_at)
					values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        waiter.roomId,
        waiter.instanceId,
        waiter.role,
        waiter.token,
        waiter.afterRole,
        waiter.status,
        waiter.assignmentId,
        JSON.stringify(waiter.launchCommand),
        waiter.createdAt,
      );
      return waiter;
    });
  }

  leaveWaiter(instanceId: string) {
    return this.transaction(() => {
      const waiter = this.getWaiterByInstanceId(instanceId);
      if (waiter?.status !== "waiting") {
        return { removed: false };
      }
      this.execute("delete from waiters where instance_id = ? and status = 'waiting'", instanceId);
      return { removed: true };
    });
  }

  createHandoff(input: { cwd?: string; body: string; artifactPath?: string }) {
    const room = this.ensureRoom(input.cwd);
    return this.transaction(() => {
      assertCanCreateHandoff(this.getRuleState(room.id));
      const artifact = input.artifactPath
        ? this.persistArtifact(
            room.id,
            this.artifactStore.copyUserArtifact(room.id, input.artifactPath),
          )
        : null;
      const baton = this.createBaton({
        roomId: room.id,
        body: input.body,
        sourceAssignmentId: null,
        artifactIds: artifact ? [artifact.id] : [],
      });
      const directGroups = groupWaitingByRole(this.listWaiters(room.id), null);
      const assignments = directGroups.map((group) =>
        this.createAssignment({
          roomId: room.id,
          batonId: baton.id,
          role: group.role,
          instanceIds: group.waiters.map((waiter) => waiter.instanceId),
        }),
      );
      this.execute("update rooms set handoff_created_at = ? where id = ?", nowIso(), room.id);
      return {
        baton,
        assignments,
      };
    });
  }

  getCurrentByToken(token: string): CurrentResult {
    const instance = this.getWaiterByToken(token);
    if (!instance) {
      throw new AgentQError("invalid-token", "Agent Environment token is not registered");
    }
    if (instance.status === "waiting") {
      return { state: "waiting", instance };
    }
    if (!instance.assignmentId) {
      throw new AgentQError("missing-assignment", "Assigned Agent Instance has no assignment");
    }
    const assignment = this.getAssignment(instance.assignmentId);
    const doneReport = this.getDoneReportForInstance(assignment.id, instance.instanceId);
    return {
      state: "assigned",
      instance,
      assignment: {
        ...assignment,
        baton: this.getBaton(assignment.batonId),
        doneReport,
      },
    };
  }

  submitDoneReport(input: { token: string; body: string; artifactPath?: string }) {
    const current = this.getCurrentByToken(input.token);
    if (current.state !== "assigned") {
      throw new AgentQError(
        "not-assigned",
        "Agent Instance is still waiting and has no Baton Assignment",
      );
    }
    return this.transaction(() => {
      const assignment = this.getAssignment(current.assignment.id);
      if (assignment.status !== "active") {
        throw new AgentQError("assignment-completed", "Baton Assignment is already completed");
      }
      if (this.getDoneReportForInstance(assignment.id, current.instance.instanceId)) {
        throw new AgentQError("done-exists", "Done Report already exists for this Agent Instance");
      }
      const reportId = this.insertDoneReport(
        assignment.id,
        current.instance.instanceId,
        input.body,
        assignment.roomId,
        input.artifactPath,
      );

      const reports = this.listDoneReports(assignment.id);
      if (reports.length < assignment.agentInstanceIds.length) {
        return {
          doneReport: this.getDoneReport(reportId),
          completedAssignment: null,
          followUpBaton: null,
          followUpAssignments: [] as AssignmentRecord[],
        };
      }

      const { completedAssignment, followUp } = this.completeAssignment(assignment.id);
      return {
        doneReport: this.getDoneReport(reportId),
        completedAssignment,
        followUpBaton: followUp.baton,
        followUpAssignments: followUp.assignments,
      };
    });
  }

  getStatus(input: { cwd?: string }): StatusResult {
    const room = this.ensureRoom(input.cwd);
    const roomRow = this.getRoomRow(room.id);
    const waiters = this.listWaiters(room.id);
    const directWaiters = groupWaitingByRole(waiters, null).map((group) => ({
      role: group.role,
      instances: group.waiters.map((waiter) => waiter.instanceId),
    }));
    const deferredWaiters = [...new Set(waiters.map((waiter) => waiter.afterRole).filter(isString))]
      .sort()
      .flatMap((afterRole) =>
        groupWaitingByRole(waiters, afterRole).map((group) => ({
          role: group.role,
          afterRole,
          instances: group.waiters.map((waiter) => waiter.instanceId),
        })),
      );
    const assignments = this.listAssignments(room.id).map((assignment) => ({
      ...assignment,
      baton: this.getBaton(assignment.batonId),
      doneReports: this.listDoneReports(assignment.id),
    }));
    return {
      room,
      handoffCreated: Boolean(roomRow?.handoff_created_at),
      origin: this.getOrigin(room.id),
      directWaiters,
      deferredWaiters,
      activeAssignments: assignments.filter((assignment) => assignment.status === "active"),
      completedBranches: assignments.filter((assignment) => assignment.status === "completed"),
      artifacts: this.listArtifacts(room.id),
    };
  }

  dismissRoom(input: { cwd?: string }) {
    const room = this.ensureRoom(input.cwd);
    return this.transaction(() => {
      const snapshot = this.getStatus({ cwd: room.canonicalCwd });
      // Delete room row; ON DELETE CASCADE cleans up all child tables automatically.
      this.execute("delete from rooms where id = ?", room.id);
      return snapshot;
    });
  }

  private ensureRoom(cwd = process.cwd()): RoomReference {
    const room = resolveRoom(cwd);
    this.execute(
      "insert or ignore into rooms (id, canonical_cwd, handoff_created_at, created_at) values (?, ?, null, ?)",
      room.id,
      room.canonicalCwd,
      nowIso(),
    );
    return room;
  }

  private getRuleState(roomId: string): RoomRuleState {
    const room = this.getRoomRow(roomId);
    return {
      origin: this.getOrigin(roomId),
      handoffCreated: Boolean(room?.handoff_created_at),
      waiters: this.listWaiters(roomId).map((waiter) => ({
        role: waiter.role,
        afterRole: waiter.afterRole,
        status: waiter.status,
      })),
      assignments: this.listAssignments(roomId).map((assignment) => ({
        role: assignment.role,
        status: assignment.status,
      })),
    };
  }

  private createBaton(input: {
    roomId: string;
    body: string;
    sourceAssignmentId: string | null;
    artifactIds: string[];
  }): BatonRecord {
    const id = randomUUID();
    this.execute(
      "insert into batons (id, room_id, source_assignment_id, body, created_at) values (?, ?, ?, ?, ?)",
      id,
      input.roomId,
      input.sourceAssignmentId,
      input.body,
      nowIso(),
    );
    for (const artifactId of input.artifactIds) {
      this.linkBatonArtifact(id, artifactId);
    }
    return this.getBaton(id);
  }

  private createAssignment(input: {
    roomId: string;
    batonId: string;
    role: string;
    instanceIds: string[];
  }): AssignmentRecord {
    const id = randomUUID();
    this.execute(
      "insert into assignments (id, room_id, baton_id, role, status, created_at, completed_at) values (?, ?, ?, ?, 'active', ?, null)",
      id,
      input.roomId,
      input.batonId,
      input.role,
      nowIso(),
    );
    for (const instanceId of input.instanceIds) {
      this.execute(
        "update waiters set status = 'assigned', assignment_id = ? where instance_id = ?",
        id,
        instanceId,
      );
    }
    return this.getAssignment(id);
  }

  private createFollowUpsForCompletedAssignment(completedAssignment: AssignmentRecord): {
    baton: BatonRecord | null;
    assignments: AssignmentRecord[];
  } {
    const followUpGroups = computeFollowUpRoles(
      this.listWaiters(completedAssignment.roomId),
      completedAssignment.role,
    );
    if (followUpGroups.length === 0) {
      return { baton: null, assignments: [] };
    }
    const doneReports = completedAssignment.agentInstanceIds.map((instanceId) => {
      const report = this.getDoneReportForInstance(completedAssignment.id, instanceId);
      if (!report) {
        throw new AgentQError(
          "missing-done-report",
          `Done Report for Agent Instance ${instanceId} was not found`,
        );
      }
      return report;
    });
    const draft = defaultFollowUpComposer.compose({
      completedAssignment,
      doneReports,
    });
    const combinedArtifact = this.persistArtifact(
      completedAssignment.roomId,
      this.artifactStore.writeCombinedArtifact(
        completedAssignment.roomId,
        completedAssignment.id,
        draft.combinedArtifactPayload,
      ),
    );
    const baton = this.createBaton({
      roomId: completedAssignment.roomId,
      sourceAssignmentId: completedAssignment.id,
      body: draft.body,
      artifactIds: [combinedArtifact.id],
    });
    const assignments = followUpGroups.map((group) =>
      this.createAssignment({
        roomId: completedAssignment.roomId,
        batonId: baton.id,
        role: group.role,
        instanceIds: group.waiters.map((waiter) => waiter.instanceId),
      }),
    );
    return { baton, assignments };
  }

  private persistArtifact(roomId: string, artifact: StoredArtifactInput): ArtifactRecord {
    this.execute(
      `insert into artifacts
				(id, room_id, kind, source_path, stored_path, metadata_json, created_at)
				values (?, ?, ?, ?, ?, ?, ?)`,
      artifact.id,
      roomId,
      artifact.kind,
      artifact.sourcePath,
      artifact.storedPath,
      artifact.metadataJson,
      nowIso(),
    );
    return this.getArtifact(artifact.id);
  }

  private insertDoneReport(
    assignmentId: string,
    instanceId: string,
    body: string,
    roomId: string,
    artifactPath?: string,
  ): string {
    const artifact = artifactPath
      ? this.persistArtifact(roomId, this.artifactStore.copyUserArtifact(roomId, artifactPath))
      : null;
    const reportId = randomUUID();
    this.execute(
      `insert into done_reports (id, assignment_id, agent_instance_id, body, created_at)
				values (?, ?, ?, ?, ?)`,
      reportId,
      assignmentId,
      instanceId,
      body,
      nowIso(),
    );
    if (artifact) {
      this.linkDoneReportArtifact(reportId, artifact.id);
    }
    return reportId;
  }

  private completeAssignment(assignmentId: string): {
    completedAssignment: AssignmentRecord;
    followUp: { baton: BatonRecord | null; assignments: AssignmentRecord[] };
  } {
    this.execute(
      "update assignments set status = 'completed', completed_at = ? where id = ?",
      nowIso(),
      assignmentId,
    );
    const completedAssignment = this.getAssignment(assignmentId);
    const followUp = this.createFollowUpsForCompletedAssignment(completedAssignment);
    return { completedAssignment, followUp };
  }

  private linkBatonArtifact(batonId: string, artifactId: string) {
    this.execute(
      "insert into baton_artifacts (baton_id, artifact_id) values (?, ?)",
      batonId,
      artifactId,
    );
  }

  private linkDoneReportArtifact(reportId: string, artifactId: string) {
    this.execute(
      "insert into done_report_artifacts (report_id, artifact_id) values (?, ?)",
      reportId,
      artifactId,
    );
  }

  private getRoomRow(roomId: string): RoomRow | null {
    return this.getOne<RoomRow>("select * from rooms where id = ?", roomId);
  }

  private getOrigin(roomId: string): OriginRecord | null {
    const row = this.getOne<OriginRow>("select * from origins where room_id = ?", roomId);
    return row ? mapOrigin(row) : null;
  }

  private listWaiters(roomId: string): WaiterRecord[] {
    return this.getMany<WaiterRow>(
      "select * from waiters where room_id = ? order by created_at, instance_id",
      roomId,
    ).map(mapWaiter);
  }

  private getWaiterByToken(token: string): WaiterRecord | null {
    const row = this.getOne<WaiterRow>("select * from waiters where token = ?", token);
    return row ? mapWaiter(row) : null;
  }

  private getWaiterByInstanceId(instanceId: string): WaiterRecord | null {
    const row = this.getOne<WaiterRow>("select * from waiters where instance_id = ?", instanceId);
    return row ? mapWaiter(row) : null;
  }

  private listAssignments(roomId: string): AssignmentRecord[] {
    const rows = this.getMany<AssignmentRow>(
      "select * from assignments where room_id = ? order by created_at, id",
      roomId,
    );
    return rows.map((row) => mapAssignment(row, this.getAssignmentInstanceIds(row.id)));
  }

  private getAssignment(id: string): AssignmentRecord {
    const row = this.getOne<AssignmentRow>("select * from assignments where id = ?", id);
    if (!row) {
      throw new AgentQError("assignment-not-found", `Baton Assignment ${id} was not found`);
    }
    return mapAssignment(row, this.getAssignmentInstanceIds(id));
  }

  private getAssignmentInstanceIds(assignmentId: string): string[] {
    return this.getMany<{ instance_id: string }>(
      "select instance_id from waiters where assignment_id = ? order by created_at, instance_id",
      assignmentId,
    ).map((waiter) => waiter.instance_id);
  }

  private getBaton(id: string): BatonRecord {
    const row = this.getOne<BatonRow>("select * from batons where id = ?", id);
    if (!row) {
      throw new AgentQError("baton-not-found", `Baton ${id} was not found`);
    }
    return {
      id: row.id,
      roomId: row.room_id,
      sourceAssignmentId: row.source_assignment_id,
      body: row.body,
      createdAt: row.created_at,
      artifacts: this.listBatonArtifacts(row.id),
    };
  }

  private listDoneReports(assignmentId: string): DoneReportRecord[] {
    const rows = this.getMany<DoneReportRow>(
      "select * from done_reports where assignment_id = ? order by created_at, id",
      assignmentId,
    );
    return rows.map((row) => mapDoneReport(row, this.listDoneReportArtifacts(row.id)));
  }

  private getDoneReport(id: string): DoneReportRecord {
    const row = this.getOne<DoneReportRow>("select * from done_reports where id = ?", id);
    if (!row) {
      throw new AgentQError("done-report-not-found", `Done Report ${id} was not found`);
    }
    return mapDoneReport(row, this.listDoneReportArtifacts(row.id));
  }

  private getDoneReportForInstance(
    assignmentId: string,
    agentInstanceId: string,
  ): DoneReportRecord | null {
    const row = this.getOne<DoneReportRow>(
      "select * from done_reports where assignment_id = ? and agent_instance_id = ?",
      assignmentId,
      agentInstanceId,
    );
    return row ? mapDoneReport(row, this.listDoneReportArtifacts(row.id)) : null;
  }

  private getArtifact(id: string): ArtifactRecord {
    const row = this.getOne<ArtifactRow>("select * from artifacts where id = ?", id);
    if (!row) {
      throw new AgentQError("artifact-not-found", `Artifact ${id} was not found`);
    }
    return mapArtifact(row);
  }

  private listArtifacts(roomId: string): ArtifactRecord[] {
    return this.getMany<ArtifactRow>(
      "select * from artifacts where room_id = ? order by created_at, id",
      roomId,
    ).map(mapArtifact);
  }

  private listBatonArtifacts(batonId: string) {
    return this.getMany<ArtifactRow>(
      `select artifacts.*
						from artifacts
						inner join baton_artifacts on baton_artifacts.artifact_id = artifacts.id
						where baton_artifacts.baton_id = ?
						order by artifacts.created_at, artifacts.id`,
      batonId,
    ).map(mapArtifact);
  }

  private listDoneReportArtifacts(reportId: string) {
    return this.getMany<ArtifactRow>(
      `select artifacts.*
						from artifacts
						inner join done_report_artifacts on done_report_artifacts.artifact_id = artifacts.id
						where done_report_artifacts.report_id = ?
						order by artifacts.created_at, artifacts.id`,
      reportId,
    ).map(mapArtifact);
  }

  private nextInstanceId(roomId: string, role: string) {
    const instanceIds = this.getMany<{ instance_id: string }>(
      "select instance_id from waiters where room_id = ? and role = ?",
      roomId,
      role,
    ).map((row) => row.instance_id);
    const prefix = `${role}-`;
    const maxNumber = instanceIds.reduce((max, instanceId) => {
      if (!instanceId.startsWith(prefix)) {
        return max;
      }
      const suffix = Number(instanceId.slice(prefix.length));
      return Number.isInteger(suffix) ? Math.max(max, suffix) : max;
    }, 0);
    return `${role}-${maxNumber + 1}`;
  }

  private transaction<T>(callback: () => T): T {
    return this.db.transaction(callback)();
  }

  private execute(sql: string, ...params: SQLQueryBindings[]) {
    if (params.length === 0) {
      return this.db.run(sql);
    }
    return this.db.run(sql, params);
  }

  private getOne<TRow>(sql: string, ...params: SQLQueryBindings[]): TRow | null {
    return this.db.query<TRow, SQLQueryBindings[]>(sql).get(...params);
  }

  private getMany<TRow>(sql: string, ...params: SQLQueryBindings[]): TRow[] {
    return this.db.query<TRow, SQLQueryBindings[]>(sql).all(...params);
  }
}

const nowIso = () => new Date().toISOString();

const isString = (value: string | null): value is string => typeof value === "string";

const mapOrigin = (row: OriginRow): OriginRecord => ({
  roomId: row.room_id,
  instanceId: row.instance_id,
  role: row.role,
  createdAt: row.created_at,
});

const mapWaiter = (row: WaiterRow): WaiterRecord => {
  let launchCommand: string[];
  try {
    launchCommand = JSON.parse(row.launch_command_json) as string[];
  } catch {
    throw new AgentQError(
      "invalid-waiter-data",
      `Waiter ${row.instance_id} has corrupt launch_command_json`,
    );
  }
  return {
    roomId: row.room_id,
    instanceId: row.instance_id,
    role: row.role,
    token: row.token,
    afterRole: row.after_role,
    status: row.status,
    assignmentId: row.assignment_id,
    launchCommand,
    createdAt: row.created_at,
  };
};

const mapAssignment = (row: AssignmentRow, agentInstanceIds: string[]): AssignmentRecord => ({
  id: row.id,
  roomId: row.room_id,
  batonId: row.baton_id,
  role: row.role,
  status: row.status,
  agentInstanceIds,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

const mapDoneReport = (row: DoneReportRow, artifacts: ArtifactRecord[]): DoneReportRecord => ({
  id: row.id,
  assignmentId: row.assignment_id,
  agentInstanceId: row.agent_instance_id,
  body: row.body,
  createdAt: row.created_at,
  artifacts,
});

const mapArtifact = (row: ArtifactRow): ArtifactRecord => ({
  id: row.id,
  roomId: row.room_id,
  kind: row.kind,
  sourcePath: row.source_path,
  storedPath: row.stored_path,
  metadataJson: row.metadata_json,
  createdAt: row.created_at,
});
