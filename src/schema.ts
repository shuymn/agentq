import type { Database } from "bun:sqlite";

export const initializeSchema = (db: Database) => {
  db.run("pragma foreign_keys = on");
  db.run(`
    create table if not exists rooms (
      id text primary key,
      canonical_cwd text not null unique,
      handoff_created_at text,
      created_at text not null
    );
    create table if not exists origins (
      room_id text primary key references rooms(id) on delete cascade,
      instance_id text not null,
      role text not null,
      created_at text not null
    );
    create table if not exists waiters (
      instance_id text primary key,
      room_id text not null references rooms(id) on delete cascade,
      role text not null,
      token text not null unique,
      after_role text,
      status text not null,
      assignment_id text,
      launch_command_json text not null,
      created_at text not null
    );
    create table if not exists batons (
      id text primary key,
      room_id text not null references rooms(id) on delete cascade,
      source_assignment_id text,
      body text not null,
      created_at text not null
    );
    create table if not exists assignments (
      id text primary key,
      room_id text not null references rooms(id) on delete cascade,
      baton_id text not null references batons(id) on delete cascade,
      role text not null,
      status text not null,
      created_at text not null,
      completed_at text
    );
    create table if not exists done_reports (
      id text primary key,
      assignment_id text not null references assignments(id) on delete cascade,
      agent_instance_id text not null,
      body text not null,
      created_at text not null,
      unique (assignment_id, agent_instance_id)
    );
    create table if not exists artifacts (
      id text primary key,
      room_id text not null references rooms(id) on delete cascade,
      kind text not null,
      source_path text,
      stored_path text not null,
      metadata_json text,
      created_at text not null
    );
    create table if not exists baton_artifacts (
      baton_id text not null references batons(id) on delete cascade,
      artifact_id text not null references artifacts(id) on delete cascade,
      primary key (baton_id, artifact_id)
    );
    create table if not exists done_report_artifacts (
      report_id text not null references done_reports(id) on delete cascade,
      artifact_id text not null references artifacts(id) on delete cascade,
      primary key (report_id, artifact_id)
    );
    create index if not exists waiters_room_role on waiters(room_id, role);
    create index if not exists assignments_room_status on assignments(room_id, status);
  `);
};
