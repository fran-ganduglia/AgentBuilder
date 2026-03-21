"use client";

import { useCallback, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type {
  DynamicFormDefinition,
  DynamicFormFieldUi,
  DynamicFormFieldDefinition,
  FileAttachmentValue,
} from "@/lib/chat/interactive-markers";
import { formatFileSize } from "@/lib/utils/format";

const MAX_FILE_SIZE_DEFAULT = 5 * 1024 * 1024; // 5MB
const MAX_FILES_DEFAULT = 3;

type DynamicChatFormCardProps = {
  definition: DynamicFormDefinition;
  initialValues?: Record<string, string>;
  fieldUi?: Record<string, DynamicFormFieldUi>;
  onSubmit: (
    values: Record<string, string>,
    fileAttachments?: Record<string, FileAttachmentValue[]>
  ) => void;
  onDismiss?: () => void;
  disabled?: boolean;
};

function getInputClassName(): string {
  return "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Error leyendo ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function FileField(props: {
  field: DynamicFormFieldDefinition;
  files: FileAttachmentValue[];
  onFilesChange: (files: FileAttachmentValue[]) => void;
  disabled: boolean;
}): ReactNode {
  const { field, files, onFilesChange, disabled } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const maxSize = field.maxFileSize ?? MAX_FILE_SIZE_DEFAULT;
  const maxFiles = field.maxFiles ?? MAX_FILES_DEFAULT;

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setError(null);

      const remaining = maxFiles - files.length;
      if (remaining <= 0) {
        setError(`Maximo ${maxFiles} archivos permitidos.`);
        return;
      }

      const toProcess = Array.from(fileList).slice(0, remaining);
      const oversized = toProcess.find((f) => f.size > maxSize);
      if (oversized) {
        setError(
          `"${oversized.name}" excede el limite de ${formatFileSize(maxSize)}.`
        );
        return;
      }

      setLoading(true);
      try {
        const newFiles: FileAttachmentValue[] = [];
        for (const file of toProcess) {
          const base64 = await readFileAsBase64(file);
          newFiles.push({
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            base64,
          });
        }
        onFilesChange([...files, ...newFiles]);
      } catch {
        setError("Error al procesar archivos.");
      } finally {
        setLoading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [files, maxFiles, maxSize, onFilesChange]
  );

  function removeFile(index: number): void {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="grid gap-2">
      <div
        className={`relative flex min-h-[80px] items-center justify-center rounded-2xl border-2 border-dashed px-4 py-3 transition ${
          loading
            ? "border-emerald-300 bg-emerald-50/50"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id={`dyn-${field.key}`}
          type="file"
          multiple={maxFiles > 1}
          accept={field.accept}
          disabled={disabled || loading}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="pointer-events-none text-center">
          {loading ? (
            <p className="text-sm text-emerald-600">Procesando...</p>
          ) : (
            <>
              <svg
                className="mx-auto mb-1 h-6 w-6 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 16v-8m0 0l-3 3m3-3l3 3M4.5 19.5h15"
                />
              </svg>
              <p className="text-xs text-slate-500">
                Arrastra archivos o haz click para seleccionar
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                Max {formatFileSize(maxSize)} por archivo, hasta {maxFiles}
              </p>
            </>
          )}
        </div>
      </div>

      {files.length > 0 ? (
        <ul className="grid gap-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <svg
                className="h-4 w-4 shrink-0 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                {file.name}
              </span>
              <span className="shrink-0 text-[10px] text-slate-400">
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                disabled={disabled}
                className="shrink-0 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : null}
    </div>
  );
}

function renderField(input: {
  field: DynamicFormFieldDefinition;
  ui: DynamicFormFieldUi | undefined;
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
    readOnly: input.ui?.readOnly,
    placeholder: field.placeholder,
  };

  if (field.type === "textarea") {
    return <textarea {...commonProps} rows={4} />;
  }

  if (field.type === "select") {
    return (
      <select {...commonProps}>
        <option value="">Seleccionar</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "url") {
    return (
      <input
        {...commonProps}
        type="url"
        placeholder="https://..."
      />
    );
  }

  // file type is handled separately in DynamicChatFormCard
  return <input {...commonProps} type={field.type} />;
}

export function DynamicChatFormCard({
  definition,
  initialValues = {},
  fieldUi = {},
  onSubmit,
  onDismiss,
  disabled = false,
}: DynamicChatFormCardProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [fileAttachments, setFileAttachments] = useState<
    Record<string, FileAttachmentValue[]>
  >({});

  const hasFileFields = definition.fields.some((f) => f.type === "file");

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

  function updateFileAttachments(
    key: string,
    files: FileAttachmentValue[]
  ): void {
    setFileAttachments((current) => ({
      ...current,
      [key]: files,
    }));
  }

  function handleSubmit(): void {
    if (hasFileFields) {
      const attachments = Object.keys(fileAttachments).length > 0
        ? fileAttachments
        : undefined;
      onSubmit(values, attachments);
    } else {
      onSubmit(values);
    }
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
          handleSubmit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {definition.fields.map((field) => {
            const ui = fieldUi[field.key];
            if (ui?.hidden) {
              return null;
            }

            const isLargeField =
              field.type === "textarea" ||
              field.type === "datetime-local" ||
              field.type === "file";

            if (field.type === "file") {
              return (
                <div
                  key={field.key}
                  className={`grid gap-1.5 ${isLargeField ? "sm:col-span-2" : ""}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  <FileField
                    field={field}
                    files={fileAttachments[field.key] ?? []}
                    onFilesChange={(files) =>
                      updateFileAttachments(field.key, files)
                    }
                    disabled={disabled}
                  />
                </div>
              );
            }

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
                  ui,
                  value: values[field.key] ?? "",
                  onChange: (event) =>
                    updateFieldValue(field.key, event.target.value),
                })}
                {field.helperText ? (
                  <span className="text-xs text-slate-500">{field.helperText}</span>
                ) : null}
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
