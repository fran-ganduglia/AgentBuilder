// Minimal cron expression matcher — no external dependencies.
// Supports standard 5-field cron: minute hour dom month dow
// Fields support: * (any), single values, comma lists, ranges (a-b), step N
// Does NOT support: @yearly @monthly @weekly @daily @hourly L W
//
// Returns true if:
// 1. The cron matches the current minute in the given timezone.
// 2. The automation has never run, OR its last run was more than 50 seconds ago
//    (prevents double-firing within the same minute window).
export function matchesCronSchedule(
  cron: string,
  now: Date,
  timezone: string,
  lastRunAt: Date | null
): boolean {
  // Debounce: if ran within the last 50 seconds, skip
  if (lastRunAt) {
    const diffMs = now.getTime() - lastRunAt.getTime();
    if (diffMs < 50_000) {
      return false;
    }
  }

  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  const [minuteField, hourField, domField, monthField, dowField] = fields as [
    string, string, string, string, string
  ];

  // Get current time components in the target timezone
  let localDate: Date;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const get = (type: string): number => {
      const part = parts.find((p) => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };

    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour") % 24; // Intl may return 24 for midnight
    const minute = get("minute");
    const dayOfWeek = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).getDay();

    localDate = new Date(year, month - 1, day, hour, minute);
    return (
      matchesField(minuteField, localDate.getMinutes(), 0, 59) &&
      matchesField(hourField, localDate.getHours(), 0, 23) &&
      matchesField(domField, localDate.getDate(), 1, 31) &&
      matchesField(monthField, localDate.getMonth() + 1, 1, 12) &&
      matchesField(dowField, dayOfWeek, 0, 6)
    );
  } catch {
    return false;
  }
}

function matchesField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;

  // Handle step */N or a-b/N
  if (field.includes("/")) {
    const [rangeStr, stepStr] = field.split("/");
    const step = parseInt(stepStr ?? "1", 10);
    if (Number.isNaN(step) || step <= 0) return false;

    const [rangeMin, rangeMax] = rangeStr === "*"
      ? [min, max]
      : parseRange(rangeStr, min, max);

    if (value < rangeMin || value > rangeMax) return false;
    return (value - rangeMin) % step === 0;
  }

  // Handle comma-separated list
  if (field.includes(",")) {
    return field.split(",").some((part) => matchesField(part.trim(), value, min, max));
  }

  // Handle range a-b
  if (field.includes("-")) {
    const [lo, hi] = parseRange(field, min, max);
    return value >= lo && value <= hi;
  }

  // Single value
  const num = parseInt(field, 10);
  return !Number.isNaN(num) && num === value;
}

function parseRange(range: string, min: number, max: number): [number, number] {
  const [loStr, hiStr] = range.split("-");
  const lo = loStr ? parseInt(loStr, 10) : min;
  const hi = hiStr ? parseInt(hiStr, 10) : max;
  return [Number.isNaN(lo) ? min : lo, Number.isNaN(hi) ? max : hi];
}
