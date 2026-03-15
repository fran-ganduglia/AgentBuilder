"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import type {
  DynamicFormDefinition,
  DynamicFormFieldDefinition,
} from "@/lib/chat/interactive-markers";

type DynamicChatFormCardProps = {
  definition: DynamicFormDefinition;
  onSubmit: (values: Record<string, string>) => void;
  onDismiss?: () => void;
  disabled?: boolean;
};

function getInputClassName(): string {
  return "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
}

function renderField(input: {
  field: DynamicFormFieldDefinition;
  value: string;
  onChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => void;
}): ReactNode {
  const field = input.field;
  const commonProps = {
    id: `dyn-${field.key}`,
    name: field.key,
    required: field.required,
    className: getInputClassName(),
    value: input.value,
    onChange: input.onChange,
  };

  if (field.type === "textarea") {
    return <textarea {...commonProps} rows={4} />;
  }

  if (field.type === "select") {
    return (
      <select {...commonProps} defaultValue="">
        <option value="">Seleccionar</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return <input {...commonProps} type={field.type} />;
}

export function DynamicChatFormCard({
  definition,
  onSubmit,
  onDismiss,
  disabled = false,
}: DynamicChatFormCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  function updateFieldValue(key: string, value: string): void {
    setValues((current) => {
      const next = { ...current };
      if (value.trim().length === 0) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  return (
    <div className="mt-4 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
            Formulario
          </p>
          <h4 className="mt-1 text-sm font-semibold text-slate-900">
            {definition.title}
          </h4>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Ocultar
          </button>
        ) : null}
      </div>

      <form
        className="mt-4 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(values);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {definition.fields.map((field) => {
            const isLargeField =
              field.type === "textarea" || field.type === "datetime-local";

            return (
              <label
                key={field.key}
                htmlFor={`dyn-${field.key}`}
                className={`grid gap-1.5 ${isLargeField ? "sm:col-span-2" : ""}`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                {renderField({
                  field,
                  value: values[field.key] ?? "",
                  onChange: (event) =>
                    updateFieldValue(field.key, event.target.value),
                })}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Los datos se envian al agente para procesarlos.
          </p>
          <button
            type="submit"
            disabled={disabled}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
