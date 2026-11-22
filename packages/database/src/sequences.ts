import type { PrismaClient, Prisma } from "../generated/client";

type Executor = PrismaClient | Prisma.TransactionClient;

/**
 * Atomically increments the global UHID counter and returns the formatted
 * number, e.g. "RD-000123". Call this INSIDE the same transaction that
 * creates the Patient row, so a failed patient creation rolls the counter
 * back too — a number is never visibly assigned unless a patient actually
 * got it. UHIDs are global (patients aren't entity-owned — see
 * docs/ARCHITECTURE.md Section 3.1), unlike temp-registration numbers.
 *
 * The single `UPDATE ... RETURNING` is what makes this safe under
 * concurrency: Postgres locks the row for the statement's duration, so two
 * concurrent callers are serialized and each gets a distinct value — there
 * is no separate read-then-write race window.
 */
export async function nextUhid(tx: Executor): Promise<string> {
  const rows = await tx.$queryRaw<{ prefix: string; seq: number }[]>`
    UPDATE uhid_counter
    SET "nextSeq" = "nextSeq" + 1
    WHERE id = 1
    RETURNING prefix, "nextSeq" - 1 AS seq
  `;
  if (rows.length === 0) {
    throw new Error("uhid_counter has no row with id=1 — did the seed/migration run?");
  }
  const { prefix, seq } = rows[0];
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

/** Same pattern as nextUhid, but per-entity (entity_settings.tempRegNextSeq). */
export async function nextTempRegistrationId(tx: Executor, entityId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ tempRegPrefix: string; seq: number }[]>`
    UPDATE entity_settings
    SET "tempRegNextSeq" = "tempRegNextSeq" + 1
    WHERE "entityId" = ${entityId}
    RETURNING "tempRegPrefix", "tempRegNextSeq" - 1 AS seq
  `;
  if (rows.length === 0) {
    throw new Error(`No entity_settings row for entity ${entityId}`);
  }
  const { tempRegPrefix, seq } = rows[0];
  return `${tempRegPrefix}-${String(seq).padStart(6, "0")}`;
}
