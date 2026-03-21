import { z } from "zod";
import type { Json } from "@/types/database";

export const SALESFORCE_LOOKUP_ACTIONS = [
  "lookup_records",
  "list_leads_recent",
  "list_leads_by_status",
  "lookup_accounts",
  "lookup_opportunities",
  "lookup_cases",
  "summarize_pipeline",
] as const;

export const SALESFORCE_WRITE_ACTIONS = [
  "create_task",
  "create_lead",
  "update_lead",
  "create_contact",
  "create_case",
  "update_case",
  "update_opportunity",
  "update_contact",
  "update_account",
  "create_opportunity",
  "create_account",
  "create_opportunity_contact_role",
] as const;

export const SALESFORCE_CRM_ACTIONS = [
  ...SALESFORCE_LOOKUP_ACTIONS,
  ...SALESFORCE_WRITE_ACTIONS,
] as const;

export type SalesforceLookupAction = (typeof SALESFORCE_LOOKUP_ACTIONS)[number];
export type SalesforceWriteAction = (typeof SALESFORCE_WRITE_ACTIONS)[number];
export type SalesforceCrmAction = (typeof SALESFORCE_CRM_ACTIONS)[number];

export type SalesforceAgentToolConfig = {
  provider: "salesforce";
  allowed_actions: SalesforceCrmAction[];
};

const salesforceCrmActionSchema = z.enum(SALESFORCE_CRM_ACTIONS);
const salesforceLookupActionSchema = z.enum(SALESFORCE_LOOKUP_ACTIONS);
const salesforceRequiredIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9]{15,18}$/, "El ID de Salesforce no es valido");
const salesforceOptionalIdSchema = salesforceRequiredIdSchema.optional();
const salesforceDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar formato YYYY-MM-DD");
const salesforceLeadListLimitSchema = z.number().int().min(1).max(25).optional();

export const salesforceAgentToolConfigSchema = z.object({
  provider: z.literal("salesforce"),
  allowed_actions: z
    .array(salesforceCrmActionSchema)
    .min(1, "Debes habilitar al menos una accion")
    .max(SALESFORCE_CRM_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

const lookupSchema = z.object({
  query: z.string().trim().min(2, "La busqueda es demasiado corta").max(120, "La busqueda es demasiado larga"),
  limit: z.number().int().min(1).max(5).optional(),
});

const listLeadsRecentSchema = z.object({
  action: z.literal("list_leads_recent"),
  limit: salesforceLeadListLimitSchema,
  createdAfter: salesforceDateSchema.optional(),
});

const listLeadsByStatusSchema = z.object({
  action: z.literal("list_leads_by_status"),
  status: z.string().trim().min(1, "El status es requerido").max(120, "El status es demasiado largo"),
  limit: salesforceLeadListLimitSchema,
});

const updateLeadSchema = z.object({
  action: z.literal("update_lead"),
  leadId: salesforceRequiredIdSchema,
  status: z.string().trim().min(1).max(120).optional(),
  rating: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(4000).optional(),
});

const createContactSchema = z.object({
  action: z.literal("create_contact"),
  lastName: z.string().trim().min(1, "El apellido es requerido").max(80, "El apellido es demasiado largo"),
  firstName: z.string().trim().max(40, "El nombre es demasiado largo").optional(),
  email: z.string().trim().email("El email no es valido").max(320, "El email es demasiado largo").optional(),
  phone: z.string().trim().max(40, "El telefono es demasiado largo").optional(),
  title: z.string().trim().max(128, "El cargo es demasiado largo").optional(),
  accountId: salesforceOptionalIdSchema,
  accountName: z.string().trim().min(1).max(255).optional(),
});

const updateCaseSchema = z.object({
  action: z.literal("update_case"),
  caseId: salesforceRequiredIdSchema,
  subject: z.string().trim().min(3).max(255).optional(),
  description: z.string().trim().max(4000).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  priority: z.string().trim().min(1).max(80).optional(),
  ownerId: salesforceOptionalIdSchema,
});

const updateOpportunitySchema = z.object({
  action: z.literal("update_opportunity"),
  opportunityId: salesforceRequiredIdSchema,
  stageName: z.string().trim().min(1).max(120).optional(),
  amount: z.number().finite().nonnegative().max(999999999).optional(),
  closeDate: salesforceDateSchema.optional(),
  nextStep: z.string().trim().max(255).optional(),
  description: z.string().trim().max(4000).optional(),
});

const updateContactSchema = z.object({
  action: z.literal("update_contact"),
  contactId: salesforceRequiredIdSchema,
  firstName: z.string().trim().max(40).optional(),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
  title: z.string().trim().max(128).optional(),
  accountId: salesforceOptionalIdSchema,
});

const updateAccountSchema = z.object({
  action: z.literal("update_account"),
  accountId: salesforceRequiredIdSchema,
  name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(80).optional(),
  description: z.string().trim().max(4000).optional(),
});

const createOpportunitySchema = z.object({
  action: z.literal("create_opportunity"),
  name: z.string().trim().min(1, "El nombre es requerido").max(120, "El nombre es demasiado largo"),
  stageName: z.string().trim().min(1, "La etapa es requerida").max(120, "La etapa es demasiado larga"),
  closeDate: salesforceDateSchema,
  accountId: salesforceOptionalIdSchema,
  amount: z.number().finite().nonnegative().max(999999999).optional(),
  description: z.string().trim().max(4000).optional(),
  type: z.string().trim().max(80).optional(),
});

const createAccountSchema = z.object({
  action: z.literal("create_account"),
  name: z.string().trim().min(1, "El nombre es requerido").max(255, "El nombre es demasiado largo"),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(80).optional(),
  description: z.string().trim().max(4000).optional(),
  billingCity: z.string().trim().max(40).optional(),
  billingState: z.string().trim().max(80).optional(),
  billingCountry: z.string().trim().max(80).optional(),
});

const createOpportunityContactRoleSchema = z.object({
  action: z.literal("create_opportunity_contact_role"),
  opportunityId: salesforceRequiredIdSchema,
  contactId: salesforceRequiredIdSchema,
  role: z.string().trim().max(80).optional(),
});

export const executeSalesforceCrmToolSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lookup_records"), ...lookupSchema.shape }),
  listLeadsRecentSchema,
  listLeadsByStatusSchema,
  z.object({ action: z.literal("lookup_accounts"), ...lookupSchema.shape }),
  z.object({ action: z.literal("lookup_opportunities"), ...lookupSchema.shape }),
  z.object({ action: z.literal("lookup_cases"), ...lookupSchema.shape }),
  z.object({ action: z.literal("summarize_pipeline") }),
  z.object({
    action: z.literal("create_task"),
    subject: z.string().trim().min(3, "El asunto es demasiado corto").max(120, "El asunto es demasiado largo"),
    description: z.string().trim().max(2000, "La descripcion es demasiado larga").optional(),
    whoId: salesforceOptionalIdSchema,
    whatId: salesforceOptionalIdSchema,
    status: z.string().trim().min(1).max(40).optional(),
    priority: z.string().trim().min(1).max(40).optional(),
    dueDate: salesforceDateSchema.optional(),
  }),
  z.object({
    action: z.literal("create_lead"),
    firstName: z.string().trim().max(40, "El nombre es demasiado largo").optional(),
    lastName: z.string().trim().min(1, "El apellido es requerido").max(80, "El apellido es demasiado largo"),
    company: z.string().trim().min(1, "La empresa es requerida").max(255, "La empresa es demasiado larga"),
    email: z.string().trim().email("El email no es valido").max(320, "El email es demasiado largo").optional(),
    phone: z.string().trim().max(40, "El telefono es demasiado largo").optional(),
    description: z.string().trim().max(2000, "La descripcion es demasiado larga").optional(),
  }),
  updateLeadSchema,
  createContactSchema,
  z.object({
    action: z.literal("create_case"),
    subject: z.string().trim().min(3, "El asunto es demasiado corto").max(255, "El asunto es demasiado largo"),
    description: z.string().trim().max(4000, "La descripcion es demasiado larga").optional(),
    status: z.string().trim().min(1).max(80).optional(),
    priority: z.string().trim().min(1).max(80).optional(),
    origin: z.string().trim().min(1).max(80).optional(),
    contactId: salesforceOptionalIdSchema,
    accountId: salesforceOptionalIdSchema,
  }),
  updateCaseSchema,
  updateOpportunitySchema,
  updateContactSchema,
  updateAccountSchema,
  createOpportunitySchema,
  createAccountSchema,
  createOpportunityContactRoleSchema,
]).superRefine((value, ctx) => {
  if (
    value.action === "update_lead" &&
    value.status === undefined &&
    value.rating === undefined &&
    value.description === undefined
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos un campo a actualizar" });
  }

  if (
    value.action === "update_case" &&
    value.subject === undefined &&
    value.description === undefined &&
    value.status === undefined &&
    value.priority === undefined &&
    value.ownerId === undefined
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos un campo a actualizar" });
  }

  if (
    value.action === "update_opportunity" &&
    value.stageName === undefined &&
    value.amount === undefined &&
    value.closeDate === undefined &&
    value.nextStep === undefined &&
    value.description === undefined
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos un campo a actualizar" });
  }

  if (
    value.action === "update_contact" &&
    value.firstName === undefined &&
    value.lastName === undefined &&
    value.email === undefined &&
    value.phone === undefined &&
    value.title === undefined &&
    value.accountId === undefined
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos un campo a actualizar" });
  }

  if (
    value.action === "update_account" &&
    value.name === undefined &&
    value.phone === undefined &&
    value.website === undefined &&
    value.industry === undefined &&
    value.description === undefined
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos un campo a actualizar" });
  }
});

export type ExecuteSalesforceCrmToolInput = z.infer<typeof executeSalesforceCrmToolSchema>;

export function getDefaultSalesforceAgentToolConfig(): SalesforceAgentToolConfig {
  return {
    provider: "salesforce",
    allowed_actions: [...SALESFORCE_CRM_ACTIONS],
  };
}

export function parseSalesforceAgentToolConfig(value: Json | null | undefined): SalesforceAgentToolConfig | null {
  const parsed = salesforceAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isSalesforceActionAllowed(config: SalesforceAgentToolConfig, action: SalesforceCrmAction): boolean {
  return config.allowed_actions.includes(action);
}

export function isSalesforceWriteAction(action: SalesforceCrmAction): action is SalesforceWriteAction {
  return SALESFORCE_WRITE_ACTIONS.includes(action as SalesforceWriteAction);
}

export function isSalesforceLookupAction(action: SalesforceCrmAction): action is SalesforceLookupAction {
  return salesforceLookupActionSchema.safeParse(action).success;
}

export function getSalesforceActionLabel(action: SalesforceCrmAction): string {
  const labels: Record<SalesforceCrmAction, string> = {
    lookup_records: "Buscar lead/contact",
    list_leads_recent: "Listar leads recientes",
    list_leads_by_status: "Listar leads por status",
    lookup_accounts: "Buscar account",
    lookup_opportunities: "Buscar opportunities",
    lookup_cases: "Buscar cases",
    summarize_pipeline: "Resumir pipeline",
    create_task: "Crear task",
    create_lead: "Crear lead",
    update_lead: "Actualizar lead",
    create_contact: "Crear contacto",
    create_case: "Crear case",
    update_case: "Actualizar case",
    update_opportunity: "Actualizar opportunity",
    update_contact: "Actualizar contacto",
    update_account: "Actualizar account",
    create_opportunity: "Crear opportunity",
    create_account: "Crear account",
    create_opportunity_contact_role: "Vincular contacto a oportunidad",
  };

  return labels[action];
}

export function getSalesforceActionDescription(action: SalesforceCrmAction): string {
  const descriptions: Record<SalesforceCrmAction, string> = {
    lookup_records: "Busca leads y contactos por texto libre.",
    list_leads_recent: "Lista leads recientes y admite filtrar desde una fecha YYYY-MM-DD.",
    list_leads_by_status: "Lista leads por status exacto con salida compacta.",
    lookup_accounts: "Busca cuentas del CRM por nombre o texto libre.",
    lookup_opportunities: "Busca oportunidades comerciales y su etapa.",
    lookup_cases: "Busca casos de soporte o handoff abiertos.",
    summarize_pipeline: "Resume oportunidades abiertas por etapa con conteos y monto total.",
    create_task: "Crea tasks operativas en Salesforce.",
    create_lead: "Crea leads nuevos dentro del CRM.",
    update_lead: "Actualiza Status, Rating o Description de un lead existente.",
    create_contact: "Crea un contacto y puede asociarlo a una cuenta existente.",
    create_case: "Crea casos de soporte o escalacion.",
    update_case: "Actualiza estado, prioridad u owner de un case.",
    update_opportunity: "Actualiza etapa, monto o proximo paso de una oportunidad.",
    update_contact: "Actualiza datos de un contacto existente en Salesforce.",
    update_account: "Actualiza datos de una cuenta existente en Salesforce.",
    create_opportunity: "Crea una nueva oportunidad comercial en Salesforce.",
    create_account: "Crea una nueva cuenta en Salesforce.",
    create_opportunity_contact_role: "Vincula un contacto existente a una oportunidad con un rol especifico.",
  };

  return descriptions[action];
}
