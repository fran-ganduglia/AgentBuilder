"use client";

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import type {
  ChatConfirmationProvider,
  ChatFormDefinition,
  ChatFormFieldDefinition,
  ChatFormValues,
} from "@/lib/chat/inline-forms";

type InlineChatFormCardProps = {
  definition: ChatFormDefinition;
  initialValues?: ChatFormValues;
  fieldErrors?: Record<string, string>;
  submitError?: string | null;
  disabled?: boolean;
  isSavingDraft?: boolean;
  onChange?: (values: ChatFormValues) => void;
  onSubmit: (values: ChatFormValues) => void | Promise<void>;
  onDismiss?: () => void;
  surfaceLabel?: string;
};

type InlineChatConfirmationCardProps = {
  provider: ChatConfirmationProvider;
  summary?: string;
  disabled?: boolean;
  onConfirm: () => void;
  onDismiss?: () => void;
  surfaceLabel?: string;
};

function getInputClassName(): string {
  return "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
}

function renderField(input: {
  field: ChatFormFieldDefinition;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}): ReactNode {
  const field = input.field;
  const commonProps = {
    id: field.key,
    name: field.key,
    required: field.required,
    placeholder: field.placeholder,
    className: getInputClassName(),
    value: input.value,
    onChange: input.onChange,
  };

  if (field.type === "textarea") {
    return <textarea {...commonProps} rows={field.rows ?? 4} />;
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

function getProviderLabel(provider: ChatConfirmationProvider): string {
  return provider === "hubspot" ? "HubSpot" : "Salesforce";
}

export function InlineChatFormCard({
  definition,
  initialValues = {},
  fieldErrors = {},
  submitError = null,
  disabled = false,
  isSavingDraft = false,
  onChange,
  onSubmit,
  onDismiss,
  surfaceLabel = "Formulario inline",
}: InlineChatFormCardProps) {
  const [values, setValues] = useState<ChatFormValues>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [definition.id, initialValues]);

  function updateFieldValue(key: string, value: string): void {
    setValues((current) => {
      const next = { ...current };

      if (value.trim().length === 0) {
        delete next[key];
      } else {
        next[key] = value;
      }

      onChange?.(next);
      return next;
    });
  }

  return (
    <div className="mt-4 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm ring-1 ring-emerald-100/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
            {surfaceLabel}
          </p>
          <h4 className="mt-1 text-sm font-semibold text-slate-900">
            {definition.title}
          </h4>
          <p className="mt-1 text-sm text-slate-600">{definition.description}</p>
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
                htmlFor={field.key}
                className={`grid gap-1.5 ${isLargeField ? "sm:col-span-2" : ""}`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                {renderField({
                  field,
                  value: values[field.key] ?? "",
                  onChange: (event) => updateFieldValue(field.key, event.target.value),
                })}
                {fieldErrors[field.key] ? (
                  <span className="text-xs font-medium text-rose-600">
                    {fieldErrors[field.key]}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {submitError
              ? submitError
              : isSavingDraft
                ? "Guardando borrador..."
                : "Los datos se validan en servidor antes de pasar a confirmacion."}
          </p>
          <button
            type="submit"
            disabled={disabled}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {definition.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function InlineChatConfirmationCard({
  provider,
  summary,
  disabled = false,
  onConfirm,
  onDismiss,
  surfaceLabel = "Confirmacion inline",
}: InlineChatConfirmationCardProps) {
  return (
    <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm ring-1 ring-amber-100/70">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">
          {surfaceLabel}
        </p>
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
      <h4 className="mt-1 text-sm font-semibold text-slate-900">
        Ejecutar escritura en {getProviderLabel(provider)}
      </h4>
      <p className="mt-1 text-sm text-slate-600">
        El backend ya dejo la accion pendiente. Este boton solo envia `confirmo`
        para reutilizar el flujo seguro existente.
      </p>
      {summary ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-white/80 px-3 py-2 text-sm text-slate-700">
          {summary}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ejecutar
        </button>
      </div>
    </div>
  );
}
