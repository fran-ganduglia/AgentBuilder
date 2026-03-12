"use client";

import { useState } from "react";
import type {
  AgentSetupChecklistItemStatus,
  AgentSetupState,
  PromptBuilderTextField,
} from "@/lib/agents/agent-setup";
import { SetupChecklistItemEditor } from "@/components/agents/setup-checklist-item-editor";

type SetupChecklistEditorProps = {
  setupState: AgentSetupState;
  canEdit: boolean;
  fallbackTimezone?: string;
  documentsHref?: string;
  onNavigateToDocuments?: () => void;
  onTaskDataChange: (itemId: string, value: unknown) => void;
  onManualStatusChange: (itemId: string, status: AgentSetupChecklistItemStatus) => void;
  onBuilderDraftChange?: (field: PromptBuilderTextField, value: string) => void;
};

type ChecklistCategoryId = "channel" | "criteria" | "integrations" | "documents" | "reviews";

const CATEGORY_ORDER: ChecklistCategoryId[] = [
  "channel",
  "criteria",
  "integrations",
  "documents",
  "reviews",
];
const EXPANDED_CATEGORY_IDS: ChecklistCategoryId[] = ["channel", "criteria", "reviews"];

const CATEGORY_META: Record<ChecklistCategoryId, { title: string; description: string }> = {
  channel: {
    title: "Canal y horarios",
    description: "Define cuando y en que contexto opera este agente.",
  },
  criteria: {
    title: "Criterios y derivacion",
    description: "Marca reglas de handoff y limites para no responder fuera de proceso.",
  },
  integrations: {
    title: "Integraciones",
    description: "Confirma las conexiones externas que este agente necesita antes de activarse.",
  },
  documents: {
    title: "Documentacion requerida",
    description: "Verifica si ya existe material listo para alimentar la base documental.",
  },
  reviews: {
    title: "Revisiones manuales",
    description: "Confirma textos, chequeos finales y ajustes que dependen del equipo.",
  },
};

function resolveCategory(item: AgentSetupState["checklist"][number]): ChecklistCategoryId {
  if (item.input_kind === "schedule") return "channel";
  if (item.input_kind === "handoff_triggers") return "criteria";
  if (item.input_kind === "provider_integration") return "integrations";
  if (item.input_kind === "documents_presence") return "documents";
  return "reviews";
}

function buildDefaultCategoryState(setupState: AgentSetupState): Record<ChecklistCategoryId, boolean> {
  const defaults: Record<ChecklistCategoryId, boolean> = {
    channel: false,
    criteria: false,
    integrations: false,
    documents: false,
    reviews: false,
  };

  for (const item of setupState.checklist) {
    if (item.status !== "completed") {
      defaults[resolveCategory(item)] = true;
    }
  }

  return defaults;
}

function buildDefaultItemState(setupState: AgentSetupState): Record<string, boolean> {
  return Object.fromEntries(setupState.checklist.map((item) => [item.id, item.status !== "completed"]));
}

export function SetupChecklistEditor({
  setupState,
  canEdit,
  fallbackTimezone = "UTC",
  documentsHref,
  onNavigateToDocuments,
  onTaskDataChange,
  onManualStatusChange,
  onBuilderDraftChange,
}: SetupChecklistEditorProps) {
  const [openCategories, setOpenCategories] = useState<Record<ChecklistCategoryId, boolean>>(() =>
    buildDefaultCategoryState(setupState)
  );
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => buildDefaultItemState(setupState));

  const categories = CATEGORY_ORDER.map((categoryId) => ({
    id: categoryId,
    ...CATEGORY_META[categoryId],
    items: setupState.checklist.filter((item) => resolveCategory(item) === categoryId),
  })).filter((category) => category.items.length > 0);

  return (
    <div className="space-y-4">
      {categories.map((category) => {
        const completed = category.items.filter((item) => item.status === "completed").length;
        const total = category.items.length;
        const isOpen = openCategories[category.id];
        const forceExpandedItems = EXPANDED_CATEGORY_IDS.includes(category.id);

        return (
          <section key={category.id} className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setOpenCategories((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
              className="flex w-full items-start justify-between gap-4 bg-slate-50/90 px-5 py-5 text-left sm:px-6"
            >
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Categoria</p>
                <h3 className="mt-2 text-lg font-bold tracking-tight text-slate-950">{category.title}</h3>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">{category.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Avance</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{completed}/{total}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white p-2 text-slate-500">
                  <svg className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </button>

            {isOpen ? (
              <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-6">
                {category.items.map((item) => (
                  <SetupChecklistItemEditor
                    key={item.id}
                    item={item}
                    isOpen={forceExpandedItems ? true : openItems[item.id] ?? false}
                    canEdit={canEdit}
                    setupState={setupState}
                    fallbackTimezone={fallbackTimezone}
                    documentsHref={documentsHref}
                    onNavigateToDocuments={onNavigateToDocuments}
                    onToggle={() => setOpenItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                    onTaskDataChange={onTaskDataChange}
                    onManualStatusChange={onManualStatusChange}
                    onBuilderDraftChange={onBuilderDraftChange}
                    forceExpanded={forceExpandedItems}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
