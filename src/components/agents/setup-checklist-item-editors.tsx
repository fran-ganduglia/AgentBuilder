import {
  getCriteriaTaskData,
  getScheduleTaskData,
  type AgentSetupState,
} from "@/lib/agents/agent-setup";
import { WEEKDAY_LABELS, WEEKDAYS } from "@/lib/agents/agent-setup-task-data";

type ScheduleEditorProps = {
  itemId: string;
  timezoneFallback: string;
  setupState: AgentSetupState;
  canEdit: boolean;
  onTaskDataChange: (itemId: string, value: unknown) => void;
};

export function ScheduleEditor({ itemId, timezoneFallback, setupState, canEdit, onTaskDataChange }: ScheduleEditorProps) {
  const schedule = getScheduleTaskData(setupState, itemId, timezoneFallback);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700">Timezone</label>
        <input
          type="text"
          value={schedule.timezone}
          disabled={!canEdit}
          onChange={(event) => onTaskDataChange(itemId, { ...schedule, timezone: event.target.value, deferred: false })}
          className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-slate-50 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>
      <div className="grid gap-3">
        {WEEKDAYS.map((day) => {
          const currentDay = schedule.days.find((entry) => entry.day === day) ?? schedule.days[0];

          return (
            <div key={day} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-center">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={currentDay.enabled}
                  disabled={!canEdit}
                  onChange={(event) => onTaskDataChange(itemId, {
                    ...schedule,
                    deferred: false,
                    days: schedule.days.map((entry) => entry.day === day ? { ...entry, enabled: event.target.checked } : entry),
                  })}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                {WEEKDAY_LABELS[day]}
              </label>
              <input
                type="time"
                value={currentDay.start}
                disabled={!canEdit || !currentDay.enabled}
                onChange={(event) => onTaskDataChange(itemId, {
                  ...schedule,
                  deferred: false,
                  days: schedule.days.map((entry) => entry.day === day ? { ...entry, start: event.target.value } : entry),
                })}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <input
                type="time"
                value={currentDay.end}
                disabled={!canEdit || !currentDay.enabled}
                onChange={(event) => onTaskDataChange(itemId, {
                  ...schedule,
                  deferred: false,
                  days: schedule.days.map((entry) => entry.day === day ? { ...entry, end: event.target.value } : entry),
                })}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type CriteriaEditorProps = {
  itemId: string;
  options: string[];
  placeholder?: string;
  setupState: AgentSetupState;
  canEdit: boolean;
  onTaskDataChange: (itemId: string, value: unknown) => void;
};

export function CriteriaEditor({ itemId, options, placeholder, setupState, canEdit, onTaskDataChange }: CriteriaEditorProps) {
  const criteria = getCriteriaTaskData(setupState, itemId);

  return (
    <div className="space-y-4">
      {options.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const checked = criteria.selectedOptions.includes(option);
            return (
              <label key={option} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canEdit}
                  onChange={(event) => onTaskDataChange(itemId, {
                    ...criteria,
                    deferred: false,
                    selectedOptions: event.target.checked
                      ? [...criteria.selectedOptions, option]
                      : criteria.selectedOptions.filter((entry) => entry !== option),
                  })}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-semibold text-slate-700">Regla personalizada</label>
        <textarea
          rows={3}
          value={criteria.customValue}
          disabled={!canEdit}
          onChange={(event) => onTaskDataChange(itemId, {
            ...criteria,
            deferred: false,
            customValue: event.target.value,
          })}
          className="mt-2 block w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors hover:bg-slate-50 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
          placeholder={placeholder ?? "Describe una regla propia para este item."}
        />
      </div>
    </div>
  );
}
