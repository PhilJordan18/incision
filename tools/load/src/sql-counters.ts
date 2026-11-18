import type pg from "pg";

type Counters = {
  readonly total: number;
  readonly guestSessionLocks: number;
  readonly guestActivityWrites: number;
};

/** Read only aggregates from the current ephemeral database. Never emit SQL text or parameters. */
export async function readSqlCounters(pool: pg.Pool): Promise<Counters> {
  const { rows } = await pool.query<{ total: string; locks: string; writes: string }>(`
    select coalesce(sum(calls), 0) as total,
      coalesce(sum(calls) filter (where query like 'select %from "guest_sessions"%for update%'), 0) as locks,
      coalesce(sum(calls) filter (where query like 'update "guest_sessions"%greatest(%'), 0) as writes
    from pg_stat_statements
    where dbid = (select oid from pg_database where datname = current_database())
      and query not like '%pg_stat_statements%'
  `);
  const row = rows[0];
  if (!row) throw new Error("Missing database counters");
  return { total: Number(row.total), guestSessionLocks: Number(row.locks), guestActivityWrites: Number(row.writes) };
}

export function sqlDelta(before: Counters, after: Counters): Counters {
  const delta = {
    total: after.total - before.total,
    guestSessionLocks: after.guestSessionLocks - before.guestSessionLocks,
    guestActivityWrites: after.guestActivityWrites - before.guestActivityWrites,
  };
  if (Object.values(delta).some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Database counters reset or were unavailable");
  }
  return delta;
}
