import { z } from "zod";

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miercoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sabado",
  sunday: "Domingo",
};

export type ScheduleDay = {
  day: Weekday;
  enabled: boolean;
  start: string;
  end: string;
};

export type ScheduleTaskData = {
  timezone: string;
  days: ScheduleDay[];
  deferred?: boolean;
};

export type CriteriaTaskData = {
  selectedOptions: string[];
  customValue: string;
  deferred?: boolean;
};

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Hora invalida");

const scheduleDaySchema = z.object({
  day: z.enum(WEEKDAYS),
  enabled: z.boolean(),
  start: timeSchema,
  end: timeSchema,
});

const scheduleTaskDataSchema = z.object({
  timezone: z.string().trim().min(1, "Timezone requerida").max(100, "Timezone invalida"),
  days: z.array(scheduleDaySchema).length(WEEKDAYS.length),
  deferred: z.boolean().optional(),
});

const criteriaTaskDataSchema = z.object({
  selectedOptions: z.array(z.string().trim().min(1)).max(20),
  customValue: z.string().max(2000),
  deferred: z.boolean().optional(),
});

const deferredTaskDataSchema = z.object({
  deferred: z.boolean().optional(),
});

export function createDefaultScheduleTaskData(timezone = "UTC"): ScheduleTaskData {
  return {
    timezone,
    days: WEEKDAYS.map((day) => ({
      day,
      enabled: false,
      start: "09:00",
      end: "18:00",
    })),
    deferred: false,
  };
}

export function normalizeScheduleTaskData(
  value: unknown,
  fallbackTimezone = "UTC"
): ScheduleTaskData {
  if (!value || typeof value !== "object") {
    return createDefaultScheduleTaskData(fallbackTimezone);
  }

  const candidate = value as Partial<ScheduleTaskData>;
  const normalized = {
    timezone:
      typeof candidate.timezone === "string" && candidate.timezone.trim()
        ? candidate.timezone.trim()
        : fallbackTimezone,
    deferred: Boolean(candidate.deferred),
    days: WEEKDAYS.map((day) => {
      const existingDay = Array.isArray(candidate.days)
        ? candidate.days.find((item) => item?.day === day)
        : null;

      return {
        day,
        enabled: Boolean(existingDay?.enabled),
        start:
          typeof existingDay?.start === "string" && timeSchema.safeParse(existingDay.start).success
            ? existingDay.start
            : "09:00",
        end:
          typeof existingDay?.end === "string" && timeSchema.safeParse(existingDay.end).success
            ? existingDay.end
            : "18:00",
      };
    }),
  };

  const parsed = scheduleTaskDataSchema.safeParse(normalized);
  return parsed.success ? parsed.data : createDefaultScheduleTaskData(fallbackTimezone);
}

export function hasValidScheduleTaskData(data: ScheduleTaskData): boolean {
  return data.days.some((day) => day.enabled && isValidTimeRange(day.start, day.end));
}

export function createDefaultCriteriaTaskData(): CriteriaTaskData {
  return {
    selectedOptions: [],
    customValue: "",
    deferred: false,
  };
}

export function normalizeCriteriaTaskData(value: unknown): CriteriaTaskData {
  if (!value || typeof value !== "object") {
    return createDefaultCriteriaTaskData();
  }

  const candidate = value as Partial<CriteriaTaskData>;
  const normalized = {
    selectedOptions: Array.isArray(candidate.selectedOptions)
      ? candidate.selectedOptions
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    customValue: typeof candidate.customValue === "string" ? candidate.customValue : "",
    deferred: Boolean(candidate.deferred),
  };

  const parsed = criteriaTaskDataSchema.safeParse(normalized);
  return parsed.success ? parsed.data : createDefaultCriteriaTaskData();
}

export function hasValidCriteriaTaskData(data: CriteriaTaskData): boolean {
  return data.selectedOptions.length > 0 || data.customValue.trim().length > 0;
}

export function normalizeDeferredTaskData(value: unknown): { deferred: boolean } {
  if (!value || typeof value !== "object") {
    return { deferred: false };
  }

  const parsed = deferredTaskDataSchema.safeParse(value);
  if (!parsed.success) {
    return { deferred: false };
  }

  return { deferred: Boolean(parsed.data.deferred) };
}

function isValidTimeRange(start: string, end: string): boolean {
  if (!timeSchema.safeParse(start).success || !timeSchema.safeParse(end).success) {
    return false;
  }

  return start < end;
}
