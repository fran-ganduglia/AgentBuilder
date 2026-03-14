import { z } from "zod";
import type { Json } from "@/types/database";

export const HUBSPOT_LOOKUP_ACTIONS = [
  "lookup_records",
  "lookup_deals",
] as const;

export const HUBSPOT_WRITE_ACTIONS = [
  "create_contact",
  "update_contact",
  "create_company",
  "update_company",
  "create_deal",
  "update_deal",
  "create_task",
  "create_meeting",
] as const;

export const HUBSPOT_CRM_ACTIONS = [
  ...HUBSPOT_LOOKUP_ACTIONS,
  ...HUBSPOT_WRITE_ACTIONS,
] as const;

export type HubSpotLookupAction = (typeof HUBSPOT_LOOKUP_ACTIONS)[number];
export type HubSpotWriteAction = (typeof HUBSPOT_WRITE_ACTIONS)[number];
export type HubSpotCrmAction = (typeof HUBSPOT_CRM_ACTIONS)[number];

export type HubSpotAgentToolConfig = {
  provider: "hubspot";
  allowed_actions: HubSpotCrmAction[];
};

const hubSpotCrmActionSchema = z.enum(HUBSPOT_CRM_ACTIONS);
const hubSpotRequiredIdSchema = z.string().trim().min(1).max(64);
const hubSpotOptionalIdSchema = hubSpotRequiredIdSchema.optional();
const hubSpotDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const hubSpotIsoDateTimeSchema = z.string().trim().datetime();
const hubSpotIdArraySchema = z.array(hubSpotRequiredIdSchema).max(20).transform((items) => [...new Set(items)]);

export const hubSpotAgentToolConfigSchema = z.object({
  provider: z.literal("hubspot"),
  allowed_actions: z
    .array(hubSpotCrmActionSchema)
    .min(1, "Debes habilitar al menos una accion")
    .max(HUBSPOT_CRM_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

const lookupSchema = z.object({
  query: z.string().trim().min(2, "La busqueda es demasiado corta").max(120, "La busqueda es demasiado larga"),
  limit: z.number().int().min(1).max(5).optional(),
});

const contactPropertiesSchema = z.object({
  email: z.string().trim().email().max(320).optional(),
  firstname: z.string().trim().max(120).optional(),
  lastname: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(80).optional(),
  jobtitle: z.string().trim().max(120).optional(),
  hubspot_owner_id: hubSpotOptionalIdSchema,
}).strict();

const companyPropertiesSchema = z.object({
  name: z.string().trim().max(255).optional(),
  domain: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(80).optional(),
  industry: z.string().trim().max(120).optional(),
  website: z.string().trim().max(255).optional(),
  hubspot_owner_id: hubSpotOptionalIdSchema,
}).strict();

const dealPropertiesSchema = z.object({
  dealname: z.string().trim().max(255).optional(),
  pipeline: hubSpotOptionalIdSchema,
  dealstage: hubSpotOptionalIdSchema,
  amount: z.union([z.number().finite().nonnegative().max(999999999), z.string().trim().regex(/^\d+(\.\d+)?$/)]).optional(),
  closedate: z.union([hubSpotDateSchema, hubSpotIsoDateTimeSchema]).optional(),
  hubspot_owner_id: hubSpotOptionalIdSchema,
}).strict();

const taskPropertiesSchema = z.object({
  hs_timestamp: hubSpotIsoDateTimeSchema,
  hs_task_subject: z.string().trim().min(1).max(255),
  hs_task_body: z.string().trim().max(5000).optional(),
  hubspot_owner_id: hubSpotOptionalIdSchema,
  hs_task_status: z.string().trim().max(80).optional(),
  hs_task_priority: z.string().trim().max(80).optional(),
  hs_task_type: z.string().trim().max(80).optional(),
  hs_task_reminders: z.string().trim().max(255).optional(),
}).strict();

const meetingPropertiesSchema = z.object({
  hs_timestamp: hubSpotIsoDateTimeSchema,
  hs_meeting_title: z.string().trim().min(1).max(255),
  hs_meeting_body: z.string().trim().max(5000).optional(),
  hubspot_owner_id: hubSpotOptionalIdSchema,
  hs_internal_meeting_notes: z.string().trim().max(5000).optional(),
  hs_meeting_external_url: z.string().trim().url().max(500).optional(),
  hs_meeting_location: z.string().trim().max(255).optional(),
  hs_meeting_start_time: hubSpotIsoDateTimeSchema.optional(),
  hs_meeting_end_time: hubSpotIsoDateTimeSchema.optional(),
  hs_meeting_outcome: z.string().trim().max(80).optional(),
  hs_activity_type: z.string().trim().max(80).optional(),
  hs_attachment_ids: z.string().trim().max(255).optional(),
}).strict();

export const executeHubSpotCrmToolSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lookup_records"), ...lookupSchema.shape }),
  z.object({ action: z.literal("lookup_deals"), ...lookupSchema.shape }),
  z.object({
    action: z.literal("create_contact"),
    properties: contactPropertiesSchema,
    dealIds: hubSpotIdArraySchema.optional(),
    allowDuplicateByEmail: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("update_contact"),
    contactId: hubSpotRequiredIdSchema,
    properties: contactPropertiesSchema,
    dealIds: hubSpotIdArraySchema.optional(),
  }),
  z.object({
    action: z.literal("create_company"),
    properties: companyPropertiesSchema,
    dealIds: hubSpotIdArraySchema.optional(),
  }),
  z.object({
    action: z.literal("update_company"),
    companyId: hubSpotRequiredIdSchema,
    properties: companyPropertiesSchema,
    dealIds: hubSpotIdArraySchema.optional(),
  }),
  z.object({
    action: z.literal("create_deal"),
    properties: dealPropertiesSchema,
    contactIds: hubSpotIdArraySchema.optional(),
    companyIds: hubSpotIdArraySchema.optional(),
    primaryCompanyId: hubSpotOptionalIdSchema,
  }),
  z.object({
    action: z.literal("update_deal"),
    dealId: hubSpotRequiredIdSchema,
    properties: dealPropertiesSchema,
    contactIds: hubSpotIdArraySchema.optional(),
    companyIds: hubSpotIdArraySchema.optional(),
    primaryCompanyId: hubSpotOptionalIdSchema,
  }),
  z.object({
    action: z.literal("create_task"),
    properties: taskPropertiesSchema,
    contactIds: hubSpotIdArraySchema.optional(),
    companyIds: hubSpotIdArraySchema.optional(),
    dealIds: hubSpotIdArraySchema.optional(),
  }),
  z.object({
    action: z.literal("create_meeting"),
    properties: meetingPropertiesSchema,
    contactIds: hubSpotIdArraySchema.optional(),
    companyIds: hubSpotIdArraySchema.optional(),
    dealIds: hubSpotIdArraySchema.optional(),
  }),
]).superRefine((value, ctx) => {
  if (
    (value.action === "update_contact" || value.action === "update_company" || value.action === "update_deal") &&
    Object.keys(value.properties).length === 0 &&
    !(("dealIds" in value) && value.dealIds && value.dealIds.length > 0) &&
    !(("contactIds" in value) && value.contactIds && value.contactIds.length > 0) &&
    !(("companyIds" in value) && value.companyIds && value.companyIds.length > 0) &&
    !(("primaryCompanyId" in value) && value.primaryCompanyId)
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos un cambio para actualizar" });
  }

  if (
    (value.action === "create_contact" || value.action === "create_company" || value.action === "create_deal") &&
    Object.keys(value.properties).length === 0
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos una propiedad para crear" });
  }
});

export type ExecuteHubSpotCrmToolInput = z.infer<typeof executeHubSpotCrmToolSchema>;

export function getDefaultHubSpotAgentToolConfig(): HubSpotAgentToolConfig {
  return {
    provider: "hubspot",
    allowed_actions: [...HUBSPOT_CRM_ACTIONS],
  };
}

export function parseHubSpotAgentToolConfig(value: Json | null | undefined): HubSpotAgentToolConfig | null {
  const parsed = hubSpotAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isHubSpotActionAllowed(config: HubSpotAgentToolConfig, action: HubSpotCrmAction): boolean {
  return config.allowed_actions.includes(action);
}

export function isHubSpotWriteAction(action: HubSpotCrmAction): action is HubSpotWriteAction {
  return HUBSPOT_WRITE_ACTIONS.includes(action as HubSpotWriteAction);
}

export function getHubSpotActionLabel(action: HubSpotCrmAction): string {
  const labels: Record<HubSpotCrmAction, string> = {
    lookup_records: "Buscar contactos o empresas",
    lookup_deals: "Buscar deals",
    create_contact: "Crear contacto",
    update_contact: "Actualizar contacto",
    create_company: "Crear empresa",
    update_company: "Actualizar empresa",
    create_deal: "Crear deal",
    update_deal: "Actualizar deal",
    create_task: "Crear task",
    create_meeting: "Crear meeting",
  };

  return labels[action];
}

export function getHubSpotActionDescription(action: HubSpotCrmAction): string {
  const descriptions: Record<HubSpotCrmAction, string> = {
    lookup_records: "Busca contactos y empresas con asociaciones compactas para seguir navegando el CRM.",
    lookup_deals: "Busca negocios abiertos o historicos con pipeline, etapa y asociaciones.",
    create_contact: "Crea un contacto usando solo propiedades permitidas para v1.",
    update_contact: "Actualiza propiedades permitidas del contacto y puede asociarlo a deals.",
    create_company: "Crea una empresa usando solo propiedades permitidas para v1.",
    update_company: "Actualiza propiedades permitidas de la empresa y puede asociarla a deals.",
    create_deal: "Crea un deal validando pipeline y stage contra el portal conectado.",
    update_deal: "Actualiza un deal existente y sincroniza asociaciones permitidas.",
    create_task: "Crea una actividad task asociable a contactos, empresas o deals.",
    create_meeting: "Crea una actividad meeting asociable a contactos, empresas o deals.",
  };

  return descriptions[action];
}

