export const AGENT_DELETION_RETENTION_DAYS = 7;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const AGENT_DELETION_RETENTION_MS = AGENT_DELETION_RETENTION_DAYS * DAY_IN_MS;

type DateLike = string | Date | null | undefined;

function parseDate(value: DateLike): Date | null {
  if (!value) {
    return null;
  }

  const nextDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

export function getAgentDeletionDeadline(value: DateLike): Date | null {
  const baseDate = parseDate(value);
  if (!baseDate) {
    return null;
  }

  return new Date(baseDate.getTime() + AGENT_DELETION_RETENTION_MS);
}

export function getAgentDeletionDeadlineIso(value: DateLike): string | null {
  return getAgentDeletionDeadline(value)?.toISOString() ?? null;
}

export function isAgentDeletionDeadlineReached(
  value: DateLike,
  referenceDate: Date = new Date()
): boolean {
  const deadline = getAgentDeletionDeadline(value);
  if (!deadline) {
    return false;
  }

  return deadline.getTime() <= referenceDate.getTime();
}
