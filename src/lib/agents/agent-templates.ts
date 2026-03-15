import type { AgentModelValue } from "@/lib/agents/agent-config";
import {
  AGENT_AREA_LABELS,
  CHANNEL_LABELS,
  createSetupState,
  getCriteriaTaskData,
  getScheduleTaskData,
  type AgentSetupChecklistItem,
  type AgentSetupState,
  type AgentTemplateId,
  type ChannelIntent,
  type PromptBuilderDraft,
  type PromptBuilderTextField,
  type ProviderIntegrationProvider,
} from "@/lib/agents/agent-setup";
import {
  WEEKDAY_LABELS,
  createDefaultCriteriaTaskData,
  createDefaultScheduleTaskData,
} from "@/lib/agents/agent-setup-task-data";
import { compileLayeredSystemPrompt } from "@/lib/agents/prompt-compiler";
import type { WizardEcosystemId } from "@/lib/agents/wizard-ecosystems";

export type AgentTemplate = {
  id: AgentTemplateId;
  name: string;
  description: string;
  ecosystem: WizardEcosystemId | null;
  channel: ChannelIntent;
  objectiveLabel: string;
  recommendedModel: AgentModelValue;
  recommendedTemperature: number;
  builderDefaults: PromptBuilderDraft;
  setupChecklist: Array<Omit<AgentSetupChecklistItem, "status">>;
};

const criteriaItem = (input: {
  id: string;
  label: string;
  description: string;
  required_for_activation: boolean;
  options: string[];
  placeholder: string;
}): Omit<AgentSetupChecklistItem, "status"> => ({
  ...input,
  verification_mode: "structured",
  input_kind: "handoff_triggers",
});

const scheduleItem = (input: {
  id: string;
  label: string;
  description: string;
  required_for_activation: boolean;
}): Omit<AgentSetupChecklistItem, "status"> => ({
  ...input,
  verification_mode: "structured",
  input_kind: "schedule",
});

const documentsItem = (input: {
  id: string;
  label: string;
  description: string;
  required_for_activation: boolean;
}): Omit<AgentSetupChecklistItem, "status"> => ({
  ...input,
  verification_mode: "structured",
  input_kind: "documents_presence",
});

const providerIntegrationItem = (input: {
  id: string;
  label: string;
  description: string;
  required_for_activation: boolean;
  integration_provider: ProviderIntegrationProvider;
}): Omit<AgentSetupChecklistItem, "status"> => ({
  ...input,
  verification_mode: "structured",
  input_kind: "provider_integration",
});

const manualReviewItem = (input: {
  id: string;
  label: string;
  description: string;
  required_for_activation: boolean;
  builder_field: PromptBuilderTextField;
  placeholder?: string;
}): Omit<AgentSetupChecklistItem, "status"> => ({
  ...input,
  verification_mode: "manual",
  input_kind: "builder_field_review",
});

const manualConfirmItem = (input: {
  id: string;
  label: string;
  description: string;
  required_for_activation: boolean;
}): Omit<AgentSetupChecklistItem, "status"> => ({
  ...input,
  verification_mode: "manual",
  input_kind: "manual_confirm",
});

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "whatsapp_unified",
    name: "Agente inteligente de WhatsApp",
    description: "Centraliza soporte, ventas, turnos y seguimiento en un solo agente por numero, con cambio de intencion segun cada mensaje real.",
    ecosystem: "whatsapp",
    channel: "whatsapp",
    objectiveLabel: "Unificar atencion por WhatsApp",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.45,
    builderDefaults: {
      objective: "Resolver mensajes entrantes de WhatsApp detectando la intencion activa y respondiendo solo con el playbook correspondiente.",
      role: "Agente inteligente de WhatsApp",
      audience: "Clientes y leads que escriben al numero conectado por WhatsApp",
      allowedTasks: "Identificar la intencion activa, responder con el playbook adecuado, pedir aclaracion inmediata con menu cuando el mensaje sea ambiguo y derivar a una persona cuando corresponda.",
      tone: "friendly",
      restrictions: "No mezclar playbooks entre si, no inventar disponibilidad, precios ni gestiones operativas, y no prometer acciones fuera de contexto o sin confirmacion real.",
      humanHandoff: "Derivar a una persona si el caso excede el playbook activo, requiere una excepcion, implica riesgo, o necesita confirmacion humana.",
      openingMessage: "Hola, soy el agente inteligente de WhatsApp. Contame que necesitas y te guio por el camino correcto.",
      channel: "whatsapp",
    },
    setupChecklist: [
      manualReviewItem({
        id: "review-whatsapp-personality",
        label: "Ajustar personalidad base",
        description: "Revisa el rol, tono y mensaje inicial del agente antes de activarlo en el numero real.",
        required_for_activation: true,
        builder_field: "role",
      }),
      manualReviewItem({
        id: "define-whatsapp-operating-context",
        label: "Definir contexto operativo",
        description: "Confirma objetivo, audiencia y tareas permitidas para que el router responda con el alcance correcto.",
        required_for_activation: true,
        builder_field: "allowedTasks",
      }),
      manualReviewItem({
        id: "define-whatsapp-limits",
        label: "Definir limites y reglas",
        description: "Asegura que las restricciones expliciten que el agente no puede prometer acciones ni mezclar playbooks.",
        required_for_activation: true,
        builder_field: "restrictions",
      }),
      criteriaItem({
        id: "define-whatsapp-unified-handoff",
        label: "Definir reglas de handoff",
        description: "Marca los escenarios donde el agente debe frenar y pasar la conversacion a una persona.",
        required_for_activation: true,
        options: [
          "Caso sensible o cliente molesto",
          "Negociacion o condicion especial",
          "Excepcion operativa o fuera de politica",
          "Necesidad de confirmar una gestion real",
        ],
        placeholder: "Agrega una regla propia de derivacion humana.",
      }),
    ],
  },
  {
    id: "whatsapp_support",
    name: "Soporte por WhatsApp",
    description: "Atiende consultas frecuentes, contiene el tono de marca y deriva casos sensibles a una persona.",
    ecosystem: "whatsapp",
    channel: "whatsapp",
    objectiveLabel: "Resolver soporte conversacional",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.45,
    builderDefaults: {
      objective: "Resolver dudas de clientes por WhatsApp de forma clara, veloz y ordenada.",
      role: "Asistente de soporte al cliente",
      audience: "Clientes actuales y potenciales que escriben por WhatsApp",
      allowedTasks: "Responder dudas frecuentes, explicar procesos, orientar pasos siguientes y registrar cuando hace falta derivar.",
      tone: "friendly",
      restrictions: "No inventar politicas, no confirmar gestiones que no se hayan realizado y no pedir datos sensibles innecesarios.",
      humanHandoff: "Derivar a una persona si hay reclamos complejos, urgencias, pedidos fuera de politica o frustracion del cliente.",
      openingMessage: "Hola, soy el asistente de soporte. Contame que necesitas y te ayudo paso a paso.",
      channel: "whatsapp",
    },
    setupChecklist: [
      scheduleItem({
        id: "define-support-hours",
        label: "Definir horarios de atencion",
        description: "Configura los dias y rangos en que este agente deberia responder.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-handoff-rules",
        label: "Definir criterios de derivacion",
        description: "Marca cuando debe escalar a una persona antes de responder mal o fuera de proceso.",
        required_for_activation: true,
        options: [
          "Cliente molesto o con reclamo sensible",
          "Solicitud urgente o de riesgo",
          "Pedido fuera de politica",
          "Necesidad de confirmar una gestion real",
        ],
        placeholder: "Agrega una regla propia de derivacion si hace falta.",
      }),
      manualReviewItem({
        id: "review-whatsapp-greeting",
        label: "Revisar mensaje inicial",
        description: "Confirma que la apertura se sienta natural para WhatsApp.",
        required_for_activation: false,
        builder_field: "openingMessage",
      }),
    ],
  },
  {
    id: "whatsapp_sales",
    name: "Ventas por WhatsApp",
    description: "Captura oportunidad, califica interes y deriva al equipo comercial con contexto.",
    ecosystem: "whatsapp",
    channel: "whatsapp",
    objectiveLabel: "Impulsar conversion comercial",
    recommendedModel: "gpt-4o",
    recommendedTemperature: 0.65,
    builderDefaults: {
      objective: "Guiar conversaciones comerciales por WhatsApp y detectar oportunidades reales.",
      role: "Asistente comercial",
      audience: "Leads y clientes que consultan precios, demos o disponibilidad por WhatsApp",
      allowedTasks: "Responder propuestas de valor, detectar necesidad, hacer preguntas de calificacion y cerrar el siguiente paso comercial.",
      tone: "direct",
      restrictions: "No prometer descuentos no autorizados, no cerrar condiciones que no existan y no ocultar limites del producto.",
      humanHandoff: "Derivar si el lead pide una propuesta formal, negociacion, demo en vivo o condiciones especiales.",
      openingMessage: "Hola, soy el asistente comercial. Si me contas que estas buscando, te recomiendo el mejor siguiente paso.",
      channel: "whatsapp",
    },
    setupChecklist: [
      criteriaItem({
        id: "define-qualification-criteria",
        label: "Definir criterios de calificacion",
        description: "Elige que senales o preguntas minimas determinan si el lead vale seguimiento.",
        required_for_activation: true,
        options: [
          "Presupuesto definido",
          "Necesidad clara o dolor concreto",
          "Urgencia de compra",
          "Tamano de equipo o volumen",
        ],
        placeholder: "Agrega una regla adicional de calificacion.",
      }),
      criteriaItem({
        id: "define-sales-handoff",
        label: "Definir cuando pasa a ventas humanas",
        description: "Configura el punto exacto en que el agente debe ceder la conversacion.",
        required_for_activation: true,
        options: [
          "Pide demo o reunion",
          "Solicita propuesta formal",
          "Negocia condiciones especiales",
          "Consulta integraciones complejas",
        ],
        placeholder: "Agrega un criterio de handoff comercial.",
      }),
      manualConfirmItem({
        id: "prepare-offer-summary",
        label: "Preparar resumen de oferta",
        description: "Revisa manualmente que el resumen comercial ya este listo para usar.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "whatsapp_appointment_booking",
    name: "Reserva de turnos por WhatsApp",
    description: "Ayuda a reservar, confirmar y reprogramar turnos sin inventar disponibilidad ni saltarse reglas operativas.",
    ecosystem: "whatsapp",
    channel: "whatsapp",
    objectiveLabel: "Reservar y reprogramar turnos",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.4,
    builderDefaults: {
      objective: "Coordinar reservas, confirmaciones y reprogramaciones por WhatsApp de forma clara y ordenada.",
      role: "Asistente de turnos y reservas",
      audience: "Clientes que quieren reservar, confirmar o reprogramar turnos por WhatsApp",
      allowedTasks: "Pedir datos minimos, ordenar la solicitud, resumir preferencias horarias y guiar el siguiente paso sin asumir disponibilidad real.",
      tone: "friendly",
      restrictions: "No confirmar disponibilidad inexistente, no inventar turnos, no mover reservas sin validacion y no omitir conflictos de agenda o politica.",
      humanHandoff: "Derivar a una persona si hay conflictos, excepciones, cambios fuera de politica o falta confirmar disponibilidad real.",
      openingMessage: "Hola, puedo ayudarte a reservar, confirmar o reprogramar tu turno por WhatsApp.",
      channel: "whatsapp",
    },
    setupChecklist: [
      scheduleItem({
        id: "define-appointment-availability-window",
        label: "Definir ventana horaria de reservas",
        description: "Configura los dias y franjas horarias base antes de habilitar reservas o confirmaciones.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-appointment-reschedule-rules",
        label: "Definir reglas de reprogramacion",
        description: "Marca que condiciones debe respetar el agente antes de ofrecer una nueva fecha u horario.",
        required_for_activation: true,
        options: [
          "Pedir fecha y franja horaria preferida",
          "Respetar aviso minimo para cambios",
          "No mover turnos ya vencidos o iniciados",
          "Escalar si el cliente pide una excepcion",
        ],
        placeholder: "Agrega otra regla propia de reprogramacion.",
      }),
      criteriaItem({
        id: "define-appointment-conflict-handoff",
        label: "Definir handoff ante conflictos de agenda",
        description: "Alinea cuando el agente debe dejar de avanzar y pasar el caso a una persona.",
        required_for_activation: true,
        options: [
          "Agenda sin huecos confirmados",
          "Choque con otra reserva",
          "Pedido fuera de horario",
          "Necesidad de aprobacion humana",
        ],
        placeholder: "Agrega otro conflicto que obligue a handoff.",
      }),
    ],
  },
  {
    id: "whatsapp_reminder_follow_up",
    name: "Recordatorios y follow-up por WhatsApp",
    description: "Envuelve recordatorios, reactivacion liviana y seguimiento simple con cadencia controlada y cierres claros.",
    ecosystem: "whatsapp",
    channel: "whatsapp",
    objectiveLabel: "Recordar y dar seguimiento",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.45,
    builderDefaults: {
      objective: "Enviar recordatorios y follow-up simples por WhatsApp sin perder claridad ni exceder politicas de contacto.",
      role: "Asistente de recordatorios y seguimiento",
      audience: "Clientes o leads que necesitan un recordatorio puntual o seguimiento simple por WhatsApp",
      allowedTasks: "Recordar acciones pendientes, reactivar conversaciones livianas, resumir el siguiente paso y cerrar el seguimiento cuando corresponda.",
      tone: "direct",
      restrictions: "No spamear, no insistir fuera de politica, no superar limites de recontacto y no inventar estados o compromisos.",
      humanHandoff: "Derivar a una persona si aparece molestia por contacto recurrente, objeciones complejas o un caso que exceda el seguimiento simple.",
      openingMessage: "Hola, te escribo para ayudarte con el siguiente paso pendiente y dejarlo claro por WhatsApp.",
      channel: "whatsapp",
    },
    setupChecklist: [
      scheduleItem({
        id: "define-whatsapp-follow-up-cadence",
        label: "Definir cadencia de recordatorios",
        description: "Configura dias, horarios y ritmo base en que el agente puede hacer follow-up.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-whatsapp-follow-up-close-rules",
        label: "Definir criterios de cierre",
        description: "Alinea en que situaciones el seguimiento debe cerrarse o pausarse sin insistir de mas.",
        required_for_activation: true,
        options: [
          "Cerrar si confirma la accion realizada",
          "Cerrar tras varios intentos sin respuesta",
          "Pausar si pide no recibir mas mensajes",
          "Escalar si responde con un caso especial",
        ],
        placeholder: "Agrega otro criterio de cierre o pausa.",
      }),
      criteriaItem({
        id: "define-whatsapp-recontact-limits",
        label: "Definir limites de recontacto",
        description: "Selecciona los topes que el agente debe respetar antes de volver a escribir.",
        required_for_activation: true,
        options: [
          "Maximo de intentos por contacto",
          "No insistir fuera de horario",
          "Esperar enfriamiento antes de retomar",
          "Cambiar a humano si hay una respuesta sensible",
        ],
        placeholder: "Agrega otro limite propio de recontacto.",
      }),
    ],
  },
  {
    id: "web_faq",
    name: "FAQ para Web",
    description: "Responde preguntas frecuentes en el sitio y orienta al visitante sin friccion.",
    ecosystem: null,
    channel: "web",
    objectiveLabel: "Autogestion web de dudas frecuentes",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.35,
    builderDefaults: {
      objective: "Responder preguntas frecuentes en la web con respuestas cortas, utiles y orientadas a la accion.",
      role: "Agente de FAQ para web",
      audience: "Visitantes del sitio que quieren entender el producto, servicio o proceso",
      allowedTasks: "Responder FAQ, sugerir la pagina o recurso correcto y derivar a contacto cuando haga falta.",
      tone: "professional",
      restrictions: "No inventar informacion ausente, no usar jerga innecesaria y no responder fuera del alcance publico.",
      humanHandoff: "Derivar si la pregunta requiere un caso particular, datos privados o asistencia de un especialista.",
      openingMessage: "Hola, puedo ayudarte con las preguntas mas frecuentes sobre este servicio.",
      channel: "web",
    },
    setupChecklist: [
      documentsItem({
        id: "load-core-faq",
        label: "Cargar base de FAQ inicial",
        description: "El item se completa cuando haya al menos un documento listo para consulta.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-web-fallback",
        label: "Definir fallback para dudas no cubiertas",
        description: "Deja claro como responde cuando no encuentra una respuesta confiable.",
        required_for_activation: true,
        options: [
          "Reconocer explicitamente que no sabe",
          "Invitar a contacto humano",
          "Redirigir a formulario o pagina de ayuda",
          "Pedir mas contexto antes de cerrar",
        ],
        placeholder: "Agrega una regla propia de fallback.",
      }),
      manualConfirmItem({
        id: "test-three-common-questions",
        label: "Probar tres preguntas comunes",
        description: "Completa este item cuando ya hayas testeado ejemplos reales.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "web_lead_capture",
    name: "Captura de Leads Web",
    description: "Califica interes en sitio, hace preguntas clave y conduce a contacto comercial.",
    ecosystem: null,
    channel: "web",
    objectiveLabel: "Capturar y ordenar leads desde la web",
    recommendedModel: "gpt-4o",
    recommendedTemperature: 0.6,
    builderDefaults: {
      objective: "Convertir visitantes web en oportunidades mejor calificadas.",
      role: "Asistente de captacion de leads",
      audience: "Visitantes del sitio evaluando una compra o una demo",
      allowedTasks: "Detectar necesidad, hacer preguntas de contexto, resumir interes y dirigir al siguiente paso.",
      tone: "friendly",
      restrictions: "No presionar, no prometer resultados imposibles y no capturar mas datos de los necesarios.",
      humanHandoff: "Derivar si el visitante pide hablar con ventas, una propuesta especial o detalles avanzados.",
      openingMessage: "Hola, puedo orientarte y ayudarte a encontrar la mejor opcion segun lo que buscas.",
      channel: "web",
    },
    setupChecklist: [
      criteriaItem({
        id: "define-lead-questions",
        label: "Definir preguntas de calificacion",
        description: "Selecciona que senales debe conseguir el agente antes de proponer un siguiente paso.",
        required_for_activation: true,
        options: [
          "Industria o tipo de empresa",
          "Tamano de equipo",
          "Urgencia del proyecto",
          "Caso de uso principal",
        ],
        placeholder: "Agrega una pregunta o criterio propio.",
      }),
      criteriaItem({
        id: "define-next-step-cta",
        label: "Definir siguiente paso comercial",
        description: "Acorda el destino principal para los leads ya calificados.",
        required_for_activation: true,
        options: [
          "Agendar demo",
          "Completar formulario",
          "Hablar con ventas",
          "Enviar brochure o propuesta base",
        ],
        placeholder: "Agrega otro siguiente paso permitido.",
      }),
      manualReviewItem({
        id: "review-opening-cta",
        label: "Revisar llamada inicial",
        description: "Confirma que el primer mensaje invite a responder sin friccion.",
        required_for_activation: false,
        builder_field: "openingMessage",
      }),
    ],
  },
  {
    id: "web_internal_assistant",
    name: "Asistente Interno Web",
    description: "Centraliza respuestas internas y orienta a equipos operativos en un entorno web.",
    ecosystem: null,
    channel: "web",
    objectiveLabel: "Asistencia interna guiada",
    recommendedModel: "gemini-pro",
    recommendedTemperature: 0.45,
    builderDefaults: {
      objective: "Responder consultas internas frecuentes de forma consistente y segura.",
      role: "Asistente interno para equipos",
      audience: "Personas del equipo que necesitan ayuda operativa o referencias internas",
      allowedTasks: "Explicar procesos internos, recordar lineamientos y resumir documentacion autorizada.",
      tone: "professional",
      restrictions: "No compartir informacion confidencial a quien no corresponda y no improvisar politicas internas.",
      humanHandoff: "Derivar si el pedido involucra acceso sensible, decisiones de liderazgo o excepciones de politica.",
      openingMessage: "Hola, puedo ayudarte con procesos y referencias internas de trabajo.",
      channel: "web",
    },
    setupChecklist: [
      criteriaItem({
        id: "define-internal-scope",
        label: "Definir alcance interno",
        description: "Delimita los procesos y temas que si cubrira esta version del agente.",
        required_for_activation: true,
        options: [
          "Politicas y beneficios",
          "Procesos operativos frecuentes",
          "Referencias de onboarding",
          "Preguntas administrativas basicas",
        ],
        placeholder: "Agrega otro alcance o limite interno.",
      }),
      documentsItem({
        id: "upload-core-documents",
        label: "Subir documentos base",
        description: "El item se completa automaticamente cuando haya documentos internos listos.",
        required_for_activation: true,
      }),
      manualConfirmItem({
        id: "test-sensitive-cases",
        label: "Probar casos sensibles",
        description: "Confirma este paso despues de revisar ejemplos de derivacion delicada.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "api_faq",
    name: "FAQ por API",
    description: "Prepara respuestas estables para consumir desde otro sistema via API.",
    ecosystem: null,
    channel: "api",
    objectiveLabel: "Responder FAQ desde integraciones propias",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.3,
    builderDefaults: {
      objective: "Entregar respuestas de FAQ consistentes para consumo por API.",
      role: "Agente FAQ orientado a integracion",
      audience: "Usuarios finales consumiendo respuestas a traves de otra interfaz",
      allowedTasks: "Responder preguntas frecuentes, mantener formato consistente y priorizar claridad.",
      tone: "formal",
      restrictions: "No devolver informacion fuera de contrato, no inventar campos y no romper el formato esperado.",
      humanHandoff: "Derivar cuando la consulta requiera intervencion humana o no este cubierta por el alcance previsto.",
      openingMessage: "Estoy listo para responder preguntas frecuentes de forma consistente.",
      channel: "api",
    },
    setupChecklist: [
      criteriaItem({
        id: "define-api-consumers",
        label: "Definir quien consumira la API",
        description: "Aclara las superficies o clientes que dependen de esta salida.",
        required_for_activation: true,
        options: [
          "Frontend propio",
          "WhatsApp o bot externo",
          "Portal de clientes",
          "Proceso interno automatizado",
        ],
        placeholder: "Agrega otro consumidor principal.",
      }),
      criteriaItem({
        id: "define-output-shape",
        label: "Definir estilo de respuesta",
        description: "Selecciona el tipo de salida que debe mantener de forma estable.",
        required_for_activation: true,
        options: [
          "Respuesta breve y directa",
          "Respuesta con pasos accionables",
          "Formato consistente para UI",
          "Cierre con sugerencia de siguiente paso",
        ],
        placeholder: "Agrega una regla propia de formato o salida.",
      }),
      manualConfirmItem({
        id: "document-next-steps",
        label: "Documentar siguientes pasos tecnicos",
        description: "Completa este item cuando ya quede claro que falta para conectar la API real.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "salesforce_lead_qualification",
    name: "Calificacion de Leads Salesforce",
    description: "Detecta oportunidad comercial, ordena contexto y deja lista la derivacion hacia ventas o SDR.",
    ecosystem: "salesforce",
    channel: "api",
    objectiveLabel: "Calificar leads con contexto CRM",
    recommendedModel: "gpt-4o",
    recommendedTemperature: 0.55,
    builderDefaults: {
      objective: "Calificar leads con senales claras antes de derivarlos al equipo comercial.",
      role: "Asistente de pre-calificacion comercial",
      audience: "Leads entrantes que llegan desde formularios, campañas o integraciones de CRM",
      allowedTasks: "Hacer preguntas de calificacion, resumir el contexto, detectar prioridad y proponer el siguiente paso comercial.",
      tone: "direct",
      restrictions: "No prometer descuentos, no inventar datos del CRM y no marcar como calificado si faltan senales basicas.",
      humanHandoff: "Derivar cuando el lead pida demo, negociacion, propuesta formal o condiciones especiales.",
      openingMessage: "Hola, voy a ayudarte a validar si este lead ya esta listo para el siguiente paso comercial.",
      channel: "api",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-salesforce-crm",
        label: "Conectar Salesforce y habilitar tool CRM",
        description: "Este requisito se completa cuando la organizacion tiene Salesforce usable y el agente ya guarda la tool CRM habilitada.",
        required_for_activation: true,
        integration_provider: "salesforce",
      }),
      criteriaItem({
        id: "define-salesforce-lead-signals",
        label: "Definir senales de lead calificado",
        description: "Alinea los criterios minimos para considerar que un lead amerita seguimiento comercial.",
        required_for_activation: true,
        options: [
          "Dolor o necesidad explicita",
          "Presupuesto o capacidad de compra",
          "Timing o urgencia",
          "Decision maker identificado",
        ],
        placeholder: "Agrega otra senal de calificacion.",
      }),
      criteriaItem({
        id: "define-salesforce-next-step",
        label: "Definir siguiente paso en CRM",
        description: "Determina como debe cerrar el agente una vez que el lead ya esta calificado.",
        required_for_activation: true,
        options: [
          "Crear handoff a SDR",
          "Solicitar demo",
          "Enviar resumen a ventas",
          "Pedir datos faltantes antes de avanzar",
        ],
        placeholder: "Agrega otro cierre permitido.",
      }),
      manualConfirmItem({
        id: "review-salesforce-field-map",
        label: "Revisar mapeo de campos clave",
        description: "Confirma manualmente que el equipo ya alineo los campos o notas que luego debera completar la integracion real.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "salesforce_case_triage",
    name: "Triage de Casos Salesforce",
    description: "Prioriza casos, clasifica urgencia y define cuando escalar a un equipo humano con buen contexto.",
    ecosystem: "salesforce",
    channel: "api",
    objectiveLabel: "Ordenar soporte antes del CRM",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.35,
    builderDefaults: {
      objective: "Clasificar casos de soporte y dejar una derivacion consistente antes de que entren al flujo humano.",
      role: "Asistente de triage para casos",
      audience: "Clientes o equipos que reportan incidencias y necesitan una primera clasificacion",
      allowedTasks: "Detectar severidad, resumir el problema, pedir datos faltantes y preparar el handoff al equipo correcto.",
      tone: "professional",
      restrictions: "No confirmar resoluciones inexistentes, no minimizar incidentes criticos y no pedir informacion sensible de mas.",
      humanHandoff: "Derivar de inmediato si hay riesgo operativo, impacto alto, datos sensibles o bloqueo total del servicio.",
      openingMessage: "Voy a ordenar este caso para que llegue al equipo correcto con el contexto necesario.",
      channel: "api",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-salesforce-crm",
        label: "Conectar Salesforce y habilitar tool CRM",
        description: "Este requisito se completa cuando la organizacion tiene Salesforce usable y el agente ya guarda la tool CRM habilitada.",
        required_for_activation: true,
        integration_provider: "salesforce",
      }),
      criteriaItem({
        id: "define-case-severity-rules",
        label: "Definir severidad y prioridad",
        description: "Selecciona las reglas que distinguen un caso normal de uno urgente o critico.",
        required_for_activation: true,
        options: [
          "Caida total del servicio",
          "Impacto en multiples usuarios",
          "Bloqueo operativo critico",
          "Riesgo reputacional o financiero",
        ],
        placeholder: "Agrega otra regla de severidad.",
      }),
      criteriaItem({
        id: "define-case-routing",
        label: "Definir criterios de enrutamiento",
        description: "Alinea como decide el agente a que equipo debe pasar cada caso.",
        required_for_activation: true,
        options: [
          "Soporte nivel 1",
          "Especialista funcional",
          "Equipo tecnico",
          "Account manager",
        ],
        placeholder: "Agrega otro destino de enrutamiento.",
      }),
      manualConfirmItem({
        id: "confirm-escalation-sla",
        label: "Confirmar SLA de escalacion",
        description: "Marca este item cuando ya este claro cuanto tiempo puede esperar cada severidad antes del handoff humano.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "salesforce_opportunity_follow_up",
    name: "Follow-up de Oportunidades Salesforce",
    description: "Hace seguimiento de oportunidades abiertas, propone proximos pasos y detecta cuando un negocio necesita intervencion humana.",
    ecosystem: "salesforce",
    channel: "api",
    objectiveLabel: "Mover oportunidades abiertas",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.45,
    builderDefaults: {
      objective: "Mantener oportunidades abiertas en movimiento con proximos pasos claros y alertas tempranas de estancamiento.",
      role: "Asistente de seguimiento comercial",
      audience: "Equipos comerciales que gestionan oportunidades activas dentro de Salesforce",
      allowedTasks: "Resumir contexto, proponer follow-up, detectar senales de estancamiento y recomendar el siguiente paso comercial.",
      tone: "direct",
      restrictions: "No prometer cierres, no asumir cambios de etapa no confirmados y no negociar condiciones fuera de politica.",
      humanHandoff: "Derivar cuando la oportunidad quede frenada, aparezcan objeciones complejas o haga falta una definicion humana sobre el siguiente paso.",
      openingMessage: "Voy a ayudarte a mantener cada oportunidad con un siguiente paso claro dentro del pipeline.",
      channel: "api",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-salesforce-crm",
        label: "Conectar Salesforce y habilitar tool CRM",
        description: "Este requisito se completa cuando la organizacion tiene Salesforce usable y el agente ya guarda la tool CRM habilitada.",
        required_for_activation: true,
        integration_provider: "salesforce",
      }),
      scheduleItem({
        id: "define-salesforce-opportunity-follow-up-cadence",
        label: "Definir cadencia de follow-up",
        description: "Configura el ritmo esperado para revisar y empujar oportunidades abiertas.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-salesforce-stalled-opportunity-signals",
        label: "Definir senales de negocio frenado",
        description: "Marca las condiciones que obligan al agente a alertar o pedir intervencion humana.",
        required_for_activation: true,
        options: [
          "Sin respuesta durante varios intentos",
          "Objecion de precio o prioridad",
          "Cambio de decision maker",
          "Pedido de condiciones especiales",
        ],
        placeholder: "Agrega otra senal de oportunidad estancada.",
      }),
      manualConfirmItem({
        id: "confirm-salesforce-opportunity-owner",
        label: "Confirmar owner o siguiente paso humano",
        description: "Verifica manualmente quien toma el caso cuando la oportunidad requiere seguimiento humano.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "salesforce_post_sale_handoff",
    name: "Handoff Postventa Salesforce",
    description: "Ordena el traspaso comercial hacia onboarding o customer success sin perder contexto ni riesgos clave.",
    ecosystem: "salesforce",
    channel: "api",
    objectiveLabel: "Transferir postventa con contexto",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.35,
    builderDefaults: {
      objective: "Hacer un handoff comercial ordenado hacia postventa, onboarding o customer success con el contexto necesario.",
      role: "Asistente de handoff postventa",
      audience: "Equipos comerciales y de postventa que necesitan transferir acuerdos cerrados dentro de Salesforce",
      allowedTasks: "Resumir el cierre, listar riesgos, dejar claros los proximos pasos y advertir faltantes antes del traspaso.",
      tone: "professional",
      restrictions: "No confirmar tareas postventa ya ejecutadas, no inventar alcance ni SLA y no omitir riesgos del traspaso.",
      humanHandoff: "Derivar cuando falten datos clave, haya riesgos abiertos o el owner receptor deba validar condiciones del traspaso.",
      openingMessage: "Voy a ayudarte a dejar este handoff postventa claro, ordenado y accionable.",
      channel: "api",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-salesforce-crm",
        label: "Conectar Salesforce y habilitar tool CRM",
        description: "Este requisito se completa cuando la organizacion tiene Salesforce usable y el agente ya guarda la tool CRM habilitada.",
        required_for_activation: true,
        integration_provider: "salesforce",
      }),
      criteriaItem({
        id: "define-salesforce-handoff-minimum-data",
        label: "Definir datos minimos del handoff",
        description: "Selecciona la informacion que debe existir antes de transferir el negocio a otro equipo.",
        required_for_activation: true,
        options: [
          "Resumen del acuerdo o alcance",
          "Owner receptor y proximo paso",
          "Riesgos abiertos o dependencias",
          "Fecha objetivo de arranque",
        ],
        placeholder: "Agrega otro dato minimo para el handoff.",
      }),
      criteriaItem({
        id: "define-salesforce-handoff-escalation-rules",
        label: "Definir criterios de escalacion",
        description: "Marca cuando el agente debe frenar el traspaso y pedir una revision humana.",
        required_for_activation: true,
        options: [
          "Falta informacion clave del cliente",
          "Hay riesgo operativo o de alcance",
          "No hay owner receptor confirmado",
          "El cliente espera un SLA no validado",
        ],
        placeholder: "Agrega otro motivo de escalacion del handoff.",
      }),
      manualConfirmItem({
        id: "confirm-salesforce-handoff-owner",
        label: "Confirmar owner receptor",
        description: "Marca este item cuando ya este claro quien recibe formalmente el handoff postventa.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "gmail_inbox_assistant",
    name: "Asistente de Inbox Gmail",
    description: "Prioriza correos, propone respuesta y ordena handoffs operativos para el equipo.",
    ecosystem: "google_workspace",
    channel: "email",
    objectiveLabel: "Ordenar el inbox operativo",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.4,
    builderDefaults: {
      objective: "Ayudar a ordenar el inbox, sugerir respuestas y detectar casos que necesiten mano humana.",
      role: "Asistente de inbox",
      audience: "Equipos que reciben correos repetitivos, operativos o comerciales en Gmail",
      allowedTasks: "Clasificar prioridad, resumir hilos, proponer borradores y sugerir el siguiente paso interno.",
      tone: "professional",
      restrictions: "No enviar respuestas por su cuenta, no inventar compromisos y no manejar datos sensibles fuera de politicas.",
      humanHandoff: "Derivar cuando el correo implique aprobaciones, temas sensibles, negociacion o decisiones humanas.",
      openingMessage: "Estoy listo para ayudarte a ordenar y responder el inbox con mas criterio.",
      channel: "email",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-gmail-integration",
        label: "Conectar Gmail",
        description: "Conecta Google Workspace con los scopes de Gmail y guarda la tool Gmail del agente.",
        required_for_activation: true,
        integration_provider: "gmail",
      }),
      criteriaItem({
        id: "define-gmail-priority-rules",
        label: "Definir reglas de prioridad",
        description: "Selecciona que senales hacen que un correo deba escalarse o atenderse primero.",
        required_for_activation: true,
        options: [
          "Cliente activo o VIP",
          "Pedido urgente o vencimiento cercano",
          "Tema financiero o contractual",
          "Bloqueo operativo",
        ],
        placeholder: "Agrega otra regla de prioridad.",
      }),
      criteriaItem({
        id: "define-gmail-reply-style",
        label: "Definir estilo de respuesta",
        description: "Alinea el tipo de borrador que debe sugerir el agente para este inbox.",
        required_for_activation: true,
        options: [
          "Respuesta breve y accionable",
          "Resumen antes de responder",
          "Borrador con CTA claro",
          "Escalada interna en lugar de responder",
        ],
        placeholder: "Agrega otra regla de respuesta.",
      }),
      manualConfirmItem({
        id: "review-gmail-escalation-path",
        label: "Revisar ruta de escalacion interna",
        description: "Confirma que ya este acordado a quien se deriva un correo sensible o fuera de alcance.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "calendar_booking_assistant",
    name: "Asistente de Agenda Calendar",
    description: "Ayuda a coordinar reuniones, valida disponibilidad y protege reglas basicas de agenda.",
    ecosystem: "google_workspace",
    channel: "email",
    objectiveLabel: "Coordinar agenda con reglas claras",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.35,
    builderDefaults: {
      objective: "Facilitar coordinacion de agenda sin romper reglas basicas de disponibilidad y handoff.",
      role: "Asistente de coordinacion de agenda",
      audience: "Personas que necesitan agendar reuniones, demos o entrevistas con el equipo",
      allowedTasks: "Proponer horarios, resumir condiciones, preparar confirmaciones y pedir intervencion humana si hay conflictos.",
      tone: "friendly",
      restrictions: "No confirmar reuniones inexistentes, no mover eventos criticos sin revision y no inventar disponibilidad.",
      humanHandoff: "Derivar cuando haya excepciones de agenda, participantes sensibles o cambios no estandar.",
      openingMessage: "Puedo ayudarte a ordenar la agenda y preparar el siguiente paso de coordinacion.",
      channel: "email",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-calendar-integration",
        label: "Conectar Google Calendar",
        description: "Conecta Google Workspace con los scopes de Calendar y guarda la tool Google Calendar del agente.",
        required_for_activation: true,
        integration_provider: "google_calendar",
      }),
      scheduleItem({
        id: "define-calendar-availability-window",
        label: "Definir ventana de disponibilidad",
        description: "Configura dias y horarios base en que el agente puede proponer reuniones.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-calendar-booking-rules",
        label: "Definir reglas de agendamiento",
        description: "Selecciona condiciones que el agente debe respetar antes de sugerir un turno.",
        required_for_activation: true,
        options: [
          "Buffer entre reuniones",
          "Duracion maxima permitida",
          "Participantes obligatorios",
          "Confirmacion humana para casos especiales",
        ],
        placeholder: "Agrega otra regla de agenda.",
      }),
      manualConfirmItem({
        id: "confirm-calendar-exceptions",
        label: "Confirmar manejo de excepciones",
        description: "Marca este paso cuando ya este claro como responder ante conflictos, feriados o cambios manuales.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "gmail_follow_up_assistant",
    name: "Follow-up por Gmail",
    description: "Prepara borradores de seguimiento por email despues de reuniones, propuestas o hilos importantes.",
    ecosystem: "google_workspace",
    channel: "email",
    objectiveLabel: "Sostener seguimientos por email",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.35,
    builderDefaults: {
      objective: "Preparar follow-up por email con buen contexto, proximos pasos claros y criterios de escalacion humana.",
      role: "Asistente de follow-up por correo",
      audience: "Equipos que necesitan dar seguimiento por Gmail despues de reuniones, propuestas o conversaciones activas",
      allowedTasks: "Resumir contexto, proponer borradores, sugerir CTA y advertir cuando conviene una respuesta humana.",
      tone: "professional",
      restrictions: "No enviar por su cuenta, no inventar compromisos y no cerrar acciones no confirmadas.",
      humanHandoff: "Derivar cuando el correo requiera aprobacion, negociacion, definiciones sensibles o una respuesta humana personalizada.",
      openingMessage: "Puedo ayudarte a preparar el follow-up correcto para este hilo de correo.",
      channel: "email",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-gmail-follow-up-integration",
        label: "Conectar Gmail",
        description: "Conecta Google Workspace con los scopes de Gmail y guarda la tool Gmail del agente.",
        required_for_activation: true,
        integration_provider: "gmail",
      }),
      scheduleItem({
        id: "define-gmail-follow-up-cadence",
        label: "Definir cadencia de seguimiento",
        description: "Configura cuando y con que ritmo el agente puede sugerir follow-up por email.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-gmail-follow-up-escalation-signals",
        label: "Definir senales de escalacion",
        description: "Marca las condiciones que hacen que el seguimiento deba pasar a una persona.",
        required_for_activation: true,
        options: [
          "Negociacion o condiciones especiales",
          "Falta de respuesta tras varios intentos",
          "Tema sensible o aprobacion requerida",
          "Cambio brusco de alcance o prioridad",
        ],
        placeholder: "Agrega otra senal de escalacion por email.",
      }),
      manualReviewItem({
        id: "review-gmail-follow-up-cta",
        label: "Revisar cierre o CTA",
        description: "Confirma que el cierre del borrador deje un siguiente paso claro y apropiado para email.",
        required_for_activation: false,
        builder_field: "openingMessage",
      }),
    ],
  },
  {
    id: "calendar_reschedule_assistant",
    name: "Reprogramacion de Agenda Calendar",
    description: "Ayuda a reprogramar reuniones y manejar conflictos de agenda con reglas claras.",
    ecosystem: "google_workspace",
    channel: "email",
    objectiveLabel: "Reprogramar sin friccion",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.35,
    builderDefaults: {
      objective: "Reprogramar reuniones con claridad, protegiendo disponibilidad y escalando conflictos cuando haga falta.",
      role: "Asistente de reprogramacion de agenda",
      audience: "Equipos y participantes que necesitan mover reuniones o resolver conflictos de agenda",
      allowedTasks: "Proponer nuevas franjas, resumir restricciones, ordenar el cambio y advertir cuando hace falta una revision humana.",
      tone: "friendly",
      restrictions: "No mover eventos criticos sin validacion, no inventar disponibilidad y no omitir conflictos relevantes.",
      humanHandoff: "Derivar cuando haya participantes sensibles, cambios no estandar o conflictos de agenda que requieran una definicion humana.",
      openingMessage: "Puedo ayudarte a reprogramar esta reunion manteniendo claras las reglas de agenda.",
      channel: "email",
    },
    setupChecklist: [
      providerIntegrationItem({
        id: "connect-calendar-reschedule-integration",
        label: "Conectar Google Calendar",
        description: "Conecta Google Workspace con los scopes de Calendar y guarda la tool Google Calendar del agente.",
        required_for_activation: true,
        integration_provider: "google_calendar",
      }),
      criteriaItem({
        id: "define-calendar-reschedule-rules",
        label: "Definir reglas de reprogramacion",
        description: "Selecciona las condiciones que el agente debe respetar antes de mover una reunion.",
        required_for_activation: true,
        options: [
          "Aviso minimo para cambios",
          "Priorizar nueva franja similar",
          "No mover reuniones criticas sin aprobacion",
          "Confirmar participantes obligatorios",
        ],
        placeholder: "Agrega otra regla de reprogramacion.",
      }),
      criteriaItem({
        id: "define-calendar-conflict-exceptions",
        label: "Definir conflictos y excepciones",
        description: "Alinea que situaciones deben activar una alerta o handoff humano.",
        required_for_activation: true,
        options: [
          "Choque con otra reunion prioritaria",
          "Participante clave sin alternativas",
          "Pedido fuera de politica interna",
          "Cambio reiterado sobre el mismo evento",
        ],
        placeholder: "Agrega otra excepcion de agenda.",
      }),
      manualConfirmItem({
        id: "confirm-calendar-reschedule-special-cases",
        label: "Confirmar manejo de casos especiales",
        description: "Marca este item cuando ya este claro como actuar ante conflictos complejos, feriados o excepciones.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "slack_teams_internal_helpdesk",
    name: "Helpdesk Interno Slack o Teams",
    description: "Responde dudas operativas repetitivas y ordena derivaciones internas para equipos distribuidos.",
    ecosystem: "collaboration",
    channel: "api",
    objectiveLabel: "Resolver soporte interno recurrente",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.4,
    builderDefaults: {
      objective: "Ayudar a equipos internos con respuestas operativas consistentes dentro de espacios colaborativos.",
      role: "Asistente interno de helpdesk",
      audience: "Personas del equipo que hacen preguntas frecuentes en Slack o Teams",
      allowedTasks: "Responder dudas repetitivas, orientar procesos internos y derivar tickets o temas sensibles al equipo correcto.",
      tone: "professional",
      restrictions: "No compartir informacion confidencial, no inventar politicas internas y no asumir aprobaciones.",
      humanHandoff: "Derivar cuando falte contexto, haya un incidente sensible o se necesite una accion humana real.",
      openingMessage: "Estoy para ayudarte con dudas internas y orientarte al siguiente paso correcto.",
      channel: "api",
    },
    setupChecklist: [
      criteriaItem({
        id: "define-collaboration-helpdesk-scope",
        label: "Definir alcance del helpdesk",
        description: "Alinea que temas si cubre el agente y cuales deben ir directo a una persona.",
        required_for_activation: true,
        options: [
          "Politicas y beneficios",
          "IT basico",
          "Procesos administrativos",
          "Soporte operativo interno",
        ],
        placeholder: "Agrega otro tema permitido o bloqueado.",
      }),
      documentsItem({
        id: "upload-collaboration-helpdesk-docs",
        label: "Subir base documental interna",
        description: "Este item se completa cuando ya haya al menos un documento listo para consulta del agente.",
        required_for_activation: true,
      }),
      manualConfirmItem({
        id: "confirm-collaboration-escalation-owner",
        label: "Confirmar owner de escalacion",
        description: "Revisa manualmente quien recibe los casos que el agente no debe resolver dentro del canal colaborativo.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "slack_teams_onboarding_assistant",
    name: "Onboarding Interno Slack o Teams",
    description: "Guia a nuevas personas del equipo con pasos, referencias y handoffs para el arranque operativo.",
    ecosystem: "collaboration",
    channel: "api",
    objectiveLabel: "Acompanar onboarding interno",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.5,
    builderDefaults: {
      objective: "Acompanar onboarding interno con respuestas claras, documentacion util y checkpoints simples.",
      role: "Asistente de onboarding interno",
      audience: "Nuevas personas del equipo que necesitan orientacion durante sus primeras semanas",
      allowedTasks: "Explicar pasos de onboarding, recordar recursos, responder preguntas frecuentes y avisar cuando corresponde escalar.",
      tone: "friendly",
      restrictions: "No reemplazar aprobaciones humanas, no inventar accesos y no confirmar tareas no ejecutadas.",
      humanHandoff: "Derivar cuando falte acceso, haya bloqueos del puesto o una decision dependa de liderazgo o People Ops.",
      openingMessage: "Bienvenido. Puedo ayudarte a recorrer el onboarding y encontrar el siguiente paso correcto.",
      channel: "api",
    },
    setupChecklist: [
      documentsItem({
        id: "upload-onboarding-core-docs",
        label: "Subir referencias de onboarding",
        description: "El item se completa cuando ya haya documentacion interna lista para las preguntas iniciales.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-onboarding-milestones",
        label: "Definir hitos y derivaciones",
        description: "Marca los momentos del onboarding en que el agente debe escalar o pedir confirmacion humana.",
        required_for_activation: true,
        options: [
          "Accesos pendientes",
          "Primeras tareas del rol",
          "Reuniones con manager",
          "Dudas de cultura o politicas",
        ],
        placeholder: "Agrega otro hito o checkpoint.",
      }),
      manualConfirmItem({
        id: "review-onboarding-first-week",
        label: "Revisar primera semana objetivo",
        description: "Marca este paso cuando ya hayas validado que el flujo cubre bien la primera semana de onboarding.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "slack_teams_incident_triage",
    name: "Triage de Incidentes Slack o Teams",
    description: "Ordena incidentes internos o bloqueos operativos en canales colaborativos con foco en severidad y escalacion rapida.",
    ecosystem: "collaboration",
    channel: "api",
    objectiveLabel: "Clasificar incidentes internos",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.3,
    builderDefaults: {
      objective: "Clasificar incidentes internos con rapidez, detectar severidad y dejar claro cuando hace falta escalacion inmediata.",
      role: "Asistente de triage de incidentes",
      audience: "Equipos internos que reportan bloqueos o incidentes operativos en Slack o Teams",
      allowedTasks: "Pedir datos faltantes, resumir impacto, ordenar severidad y preparar el handoff al equipo correcto.",
      tone: "direct",
      restrictions: "No minimizar incidentes, no declarar resuelto algo no validado y no omitir impacto o severidad.",
      humanHandoff: "Derivar de inmediato cuando haya impacto alto, bloqueo operativo o un incidente que requiera accion humana urgente.",
      openingMessage: "Voy a ayudarte a clasificar este incidente para que llegue rapido al equipo correcto.",
      channel: "api",
    },
    setupChecklist: [
      criteriaItem({
        id: "define-collaboration-incident-severity",
        label: "Definir criterios de severidad",
        description: "Selecciona las reglas que diferencian un incidente menor de uno urgente o critico.",
        required_for_activation: true,
        options: [
          "Bloqueo total del trabajo",
          "Impacto en multiples personas",
          "Riesgo operativo o reputacional",
          "Necesidad de respuesta inmediata",
        ],
        placeholder: "Agrega otro criterio de severidad.",
      }),
      criteriaItem({
        id: "define-collaboration-incident-escalation",
        label: "Definir senales de escalacion inmediata",
        description: "Marca los casos que obligan al agente a cortar el triage y escalar sin demora.",
        required_for_activation: true,
        options: [
          "Caida de sistema o herramienta critica",
          "Riesgo de seguridad o datos",
          "Bloqueo de un proceso clave",
          "Incidente fuera del alcance del canal",
        ],
        placeholder: "Agrega otra senal de escalacion inmediata.",
      }),
      manualConfirmItem({
        id: "confirm-collaboration-incident-owner",
        label: "Confirmar owner de incidentes",
        description: "Revisa manualmente quien recibe y coordina los incidentes cuando el agente debe escalar.",
        required_for_activation: false,
      }),
    ],
  },
  {
    id: "slack_teams_team_updates_assistant",
    name: "Updates de Equipo Slack o Teams",
    description: "Ordena pedidos de estado, updates recurrentes y seguimientos operativos dentro de canales internos.",
    ecosystem: "collaboration",
    channel: "api",
    objectiveLabel: "Ordenar updates recurrentes",
    recommendedModel: "gpt-4o-mini",
    recommendedTemperature: 0.4,
    builderDefaults: {
      objective: "Ayudar a ordenar updates de equipo, pedidos de estado y seguimientos operativos dentro de Slack o Teams.",
      role: "Asistente de updates operativos",
      audience: "Equipos internos que usan canales colaborativos para pedir estados, avances o proximos pasos",
      allowedTasks: "Resumir avances, pedir datos minimos, sugerir seguimiento y advertir cuando falta contexto o aprobacion.",
      tone: "professional",
      restrictions: "No publicar estados no verificados, no asumir aprobaciones y no exponer informacion sensible.",
      humanHandoff: "Derivar cuando falte contexto critico, el update requiera una aprobacion formal o el tema sea sensible para compartir en el canal.",
      openingMessage: "Puedo ayudarte a ordenar este update y dejar claro el siguiente paso del equipo.",
      channel: "api",
    },
    setupChecklist: [
      scheduleItem({
        id: "define-collaboration-updates-cadence",
        label: "Definir cadencia de updates",
        description: "Configura cuando conviene pedir, resumir o refrescar estados dentro del canal.",
        required_for_activation: true,
      }),
      criteriaItem({
        id: "define-collaboration-update-minimum-fields",
        label: "Definir campos minimos del update",
        description: "Selecciona la informacion minima que debe aparecer antes de considerar completo un update.",
        required_for_activation: true,
        options: [
          "Estado actual o progreso",
          "Bloqueos o riesgos",
          "Owner responsable",
          "Siguiente paso y fecha",
        ],
        placeholder: "Agrega otro campo minimo del update.",
      }),
      criteriaItem({
        id: "define-collaboration-update-handoff-rules",
        label: "Definir reglas de handoff",
        description: "Marca cuando el agente debe dejar el seguimiento en manos de una persona.",
        required_for_activation: true,
        options: [
          "Falta aprobacion de liderazgo",
          "Hay informacion sensible",
          "El owner no esta claro",
          "El update requiere una decision humana",
        ],
        placeholder: "Agrega otra regla de handoff operativo.",
      }),
    ],
  },
  {
    id: "from_scratch",
    name: "Desde cero",
    description: "Empieza con una base flexible y arma el comportamiento a tu medida.",
    ecosystem: null,
    channel: "web",
    objectiveLabel: "Construccion libre",
    recommendedModel: "gemini-pro",
    recommendedTemperature: 0.7,
    builderDefaults: {
      objective: "Resolver consultas de forma util y consistente dentro del alcance definido por la organizacion.",
      role: "Asistente general",
      audience: "Usuarios que necesitan ayuda concreta dentro del canal elegido",
      allowedTasks: "Responder preguntas, orientar el siguiente paso y mantener el tono de la marca.",
      tone: "professional",
      restrictions: "No inventar informacion, no salir del alcance y no asumir permisos que no tiene.",
      humanHandoff: "Derivar cuando el pedido requiera una persona o una decision fuera del alcance del agente.",
      openingMessage: "Hola, contame que necesitas y veo como ayudarte.",
      channel: "web",
    },
    setupChecklist: [
      criteriaItem({
        id: "define-main-purpose",
        label: "Definir proposito principal",
        description: "Deja explicito para que existe este agente antes de activarlo.",
        required_for_activation: true,
        options: [
          "Responder consultas frecuentes",
          "Guiar un proceso paso a paso",
          "Capturar oportunidades o datos",
          "Derivar casos complejos a una persona",
        ],
        placeholder: "Describe con tus palabras el proposito principal.",
      }),
      criteriaItem({
        id: "define-handoff-boundaries",
        label: "Definir limites y derivacion",
        description: "Configura cuando tiene que frenar, reconocer el limite y pasar a un humano.",
        required_for_activation: true,
        options: [
          "Solicitudes sensibles o con riesgo",
          "Casos fuera de politica",
          "Dudas que requieren accion humana",
          "Escalada por frustracion del usuario",
        ],
        placeholder: "Agrega otra regla de limite o derivacion.",
      }),
      manualConfirmItem({
        id: "review-first-tests",
        label: "Probar conversaciones iniciales",
        description: "Marca este paso cuando ya hayas probado conversaciones reales o simuladas.",
        required_for_activation: false,
      }),
    ],
  },
];

export type PromptSyncMode = "recommended" | "custom";
export type RecommendedPromptEnvironment = {
  salesforceUsable?: boolean;
  gmailConfigured?: boolean;
  gmailRuntimeAvailable?: boolean;
  googleCalendarConfigured?: boolean;
  googleCalendarRuntimeAvailable?: boolean;
};

export type RecommendedPromptVariant = "current" | "legacy";

export type RecommendedPromptCandidate = {
  prompt: string;
  variant: RecommendedPromptVariant;
  salesforceUsable: boolean | null;
  gmailConfigured: boolean | null;
  gmailRuntimeAvailable: boolean | null;
  googleCalendarConfigured: boolean | null;
  googleCalendarRuntimeAvailable: boolean | null;
};

type RecommendedPromptInput = PromptBuilderDraft | AgentSetupState;

export function buildRecommendedSystemPrompt(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment = {}
): string {
  return buildCurrentRecommendedSystemPrompt(input, environment);
}

export function getRecommendedPromptCandidates(
  setupState: AgentSetupState,
  environment: RecommendedPromptEnvironment = {}
): RecommendedPromptCandidate[] {
  const normalizedEnvironment = normalizeRecommendedPromptEnvironment(setupState, environment);
  const environmentVariants = getRecommendedPromptEnvironmentVariants(normalizedEnvironment);

  if (environmentVariants.length === 0) {
    return [
      {
        prompt: buildCurrentRecommendedSystemPrompt(setupState, environment),
        variant: "current",
        salesforceUsable: null,
        gmailConfigured: null,
        gmailRuntimeAvailable: null,
        googleCalendarConfigured: null,
        googleCalendarRuntimeAvailable: null,
      },
    ];
  }

  const candidates: RecommendedPromptCandidate[] = [];

  for (const variantEnvironment of environmentVariants) {
    candidates.push({
      prompt: buildCurrentRecommendedSystemPrompt(
        setupState,
        variantEnvironment
      ),
      variant: "current",
      salesforceUsable: variantEnvironment.salesforceUsable ?? null,
      gmailConfigured: variantEnvironment.gmailConfigured ?? null,
      gmailRuntimeAvailable: variantEnvironment.gmailRuntimeAvailable ?? null,
      googleCalendarConfigured: variantEnvironment.googleCalendarConfigured ?? null,
      googleCalendarRuntimeAvailable:
        variantEnvironment.googleCalendarRuntimeAvailable ?? null,
    });
  }

  for (const variantEnvironment of environmentVariants) {
    candidates.push({
      prompt: buildLegacyRecommendedSystemPrompt(
        setupState,
        variantEnvironment
      ),
      variant: "legacy",
      salesforceUsable: variantEnvironment.salesforceUsable ?? null,
      gmailConfigured: variantEnvironment.gmailConfigured ?? null,
      gmailRuntimeAvailable: variantEnvironment.gmailRuntimeAvailable ?? null,
      googleCalendarConfigured: variantEnvironment.googleCalendarConfigured ?? null,
      googleCalendarRuntimeAvailable:
        variantEnvironment.googleCalendarRuntimeAvailable ?? null,
    });
  }

  return candidates;
}

export function detectPromptSyncMode(
  currentPrompt: string,
  setupState: AgentSetupState,
  environment: RecommendedPromptEnvironment = {}
): PromptSyncMode {
  return getRecommendedPromptCandidates(setupState, environment).some(
    (candidate) => normalizePrompt(currentPrompt) === normalizePrompt(candidate.prompt)
  )
    ? "recommended"
    : "custom";
}

export function syncSystemPromptWithSetup(
  currentPrompt: string,
  previousSetupState: AgentSetupState,
  nextSetupState: AgentSetupState,
  previousEnvironment: RecommendedPromptEnvironment = {},
  nextEnvironment: RecommendedPromptEnvironment = previousEnvironment
): string {
  return detectPromptSyncMode(currentPrompt, previousSetupState, previousEnvironment) === "recommended"
    ? buildRecommendedSystemPrompt(nextSetupState, nextEnvironment)
    : currentPrompt;
}

function buildCurrentRecommendedSystemPrompt(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): string {
  const draft = isSetupState(input) ? input.builder_draft : input;
  const onboardingContext = isSetupState(input) ? buildOnboardingContext(input) : [];
  const normalizedEnvironment = normalizeRecommendedPromptEnvironment(
    input,
    environment
  );
  const capabilityLines = resolveCapabilityLines(input, normalizedEnvironment);

  if (isSetupState(input)) {
    return compileLayeredSystemPrompt({
      setupState: input,
      onboardingContext,
      integrationPolicyLines: capabilityLines,
    });
  }

  return buildPromptFromSections(draft, onboardingContext, capabilityLines);
}

function buildLegacyRecommendedSystemPrompt(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): string {
  const draft = isSetupState(input) ? input.builder_draft : input;
  const onboardingContext = isSetupState(input) ? buildOnboardingContext(input) : [];
  const normalizedEnvironment = normalizeRecommendedPromptEnvironment(
    input,
    environment
  );
  const capabilityLines = resolveLegacyCapabilityLines(input, normalizedEnvironment);

  return buildPromptFromSections(draft, onboardingContext, capabilityLines);
}

function buildPromptFromSections(
  draft: PromptBuilderDraft,
  onboardingContext: string[],
  capabilityLines: string[]
): string {
  const channelLabel = CHANNEL_LABELS[draft.channel];
  const tasks = draft.allowedTasks.trim() || "Responder con claridad y orientar el siguiente paso";
  const restrictions = draft.restrictions.trim() || "No inventar informacion ni salir del alcance definido";
  const handoff = draft.humanHandoff.trim() || "Derivar a una persona cuando el caso exceda su alcance";
  const opening = draft.openingMessage.trim();

  const sections = [
    `Actua como ${draft.role.trim() || "un agente de IA profesional"} para ${draft.audience.trim() || "las personas usuarias de la organizacion"}.`,
    `Tu objetivo principal es ${draft.objective.trim() || "resolver consultas con claridad y consistencia"}. Operas principalmente en el canal ${channelLabel}.`,
    `Tareas permitidas: ${tasks}.`,
    `Tono esperado: ${resolveToneInstruction(draft.tone)}.`,
    `Reglas y limites: ${restrictions}.`,
    `Derivacion a humano: ${handoff}.`,
    capabilityLines.length > 0
      ? `Capacidades operativas y limites:
${capabilityLines.map((line) => `- ${line}`).join("\n")}`
      : null,
    onboardingContext.length > 0
      ? `Contexto operativo del onboarding:
${onboardingContext.map((line) => `- ${line}`).join("\n")}`
      : null,
    opening ? `Mensaje inicial sugerido: "${opening}".` : null,
    "Si la informacion no esta disponible, dilo de forma explicita. No inventes politicas, precios ni confirmaciones operativas.",
    "Responde en espanol claro, con estructura breve, pasos accionables y foco en ayudar sin friccion.",
  ];

  return sections.filter((value): value is string => Boolean(value)).join("\n\n");
}

function normalizeRecommendedPromptEnvironment(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): RecommendedPromptEnvironment {
  if (
    !isSalesforceRecommendedPromptInput(input) &&
    !isGmailRecommendedPromptInput(input) &&
    !isGoogleCalendarRecommendedPromptInput(input)
  ) {
    return {};
  }

  return {
    ...(isSalesforceRecommendedPromptInput(input)
      ? { salesforceUsable: environment.salesforceUsable === true }
      : {}),
    ...(isGmailRecommendedPromptInput(input)
      ? {
          gmailConfigured: environment.gmailConfigured === true,
          gmailRuntimeAvailable:
            environment.gmailConfigured === true &&
            environment.gmailRuntimeAvailable === true,
        }
      : {}),
    ...(isGoogleCalendarRecommendedPromptInput(input)
      ? {
          googleCalendarConfigured: environment.googleCalendarConfigured === true,
          googleCalendarRuntimeAvailable:
            environment.googleCalendarConfigured === true &&
            environment.googleCalendarRuntimeAvailable === true,
        }
      : {}),
  };
}

function getRecommendedPromptEnvironmentVariants(
  environment: RecommendedPromptEnvironment
): RecommendedPromptEnvironment[] {
  const dimensions: RecommendedPromptEnvironment[][] = [];

  if (environment.salesforceUsable !== undefined) {
    dimensions.push(
      environment.salesforceUsable === true
        ? [{ salesforceUsable: true }, { salesforceUsable: false }]
        : [{ salesforceUsable: false }, { salesforceUsable: true }]
    );
  }

  if (
    environment.gmailConfigured !== undefined ||
    environment.gmailRuntimeAvailable !== undefined
  ) {
    const currentState = environment.gmailRuntimeAvailable === true
      ? { gmailConfigured: true, gmailRuntimeAvailable: true }
      : environment.gmailConfigured === true
        ? { gmailConfigured: true, gmailRuntimeAvailable: false }
        : { gmailConfigured: false, gmailRuntimeAvailable: false };

    dimensions.push([
      currentState,
      { gmailConfigured: true, gmailRuntimeAvailable: false },
      { gmailConfigured: true, gmailRuntimeAvailable: true },
      { gmailConfigured: false, gmailRuntimeAvailable: false },
    ]);
  }

  if (
    environment.googleCalendarConfigured !== undefined ||
    environment.googleCalendarRuntimeAvailable !== undefined
  ) {
    const currentState = environment.googleCalendarRuntimeAvailable === true
      ? { googleCalendarConfigured: true, googleCalendarRuntimeAvailable: true }
      : environment.googleCalendarConfigured === true
        ? { googleCalendarConfigured: true, googleCalendarRuntimeAvailable: false }
        : {
            googleCalendarConfigured: false,
            googleCalendarRuntimeAvailable: false,
          };

    dimensions.push([
      currentState,
      { googleCalendarConfigured: true, googleCalendarRuntimeAvailable: false },
      { googleCalendarConfigured: true, googleCalendarRuntimeAvailable: true },
      {
        googleCalendarConfigured: false,
        googleCalendarRuntimeAvailable: false,
      },
    ]);
  }

  if (dimensions.length === 0) {
    return [];
  }

  const combinations = dimensions.reduce<RecommendedPromptEnvironment[]>(
    (accumulator, options) =>
      accumulator.flatMap((base) =>
        options.map((option) => ({ ...base, ...option }))
      ),
    [{}]
  );

  return combinations.filter(
    (candidate, index) =>
      combinations.findIndex((current) => JSON.stringify(current) === JSON.stringify(candidate)) === index
  );
}

function resolveCapabilityLines(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): string[] {
  const lines = [
    ...resolveCrmCapabilityLines(input, environment),
    ...resolveGoogleCapabilityLines(input, environment),
  ];

  return lines;
}

function resolveCrmCapabilityLines(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): string[] {
  if (isSalesforceRecommendedPromptInput(input)) {
    if (environment.salesforceUsable === true) {
      return [
        "Tienes acceso operativo al CRM mediante la integracion backend de Salesforce y las tools habilitadas de este agente.",
        "Si el usuario pregunta por Salesforce o por el CRM, confirma ese acceso operativo sin prometer acciones que todavia no ejecutaste en este turno.",
        "Si falta contexto para leer o escribir algo puntual, describe esa situacion concreta sin negar el acceso general al CRM.",
      ];
    }

    return [];
  }

  return [];
}

function resolveGoogleCapabilityLines(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): string[] {
  const lines: string[] = [];

  if (isGmailRecommendedPromptInput(input) && environment.gmailConfigured === true) {
    if (environment.gmailRuntimeAvailable === true) {
      lines.push(
        "Gmail esta configurado y disponible en chat web para lectura segura basada en metadata y para writes asistidas que pasan por approval inbox.",
        "Puedes buscar hilos y leer resumentes de threads usando headers, snippets y conteo de adjuntos, pero nunca bodies completos ni HTML.",
        "Las acciones reales habilitadas en esta fase son crear borradores, aplicar labels existentes y archivar hilos; `send_reply`, bodies completos y adjuntos siguen fuera de alcance."
      );
    } else {
      lines.push(
        "Gmail esta configurado para este agente, pero la ejecucion real solo esta disponible en chat web.",
        "No simules busquedas, lecturas, borradores, labels ni archivado en Gmail mientras esta superficie no tenga runtime usable.",
        "Si el usuario pide una accion real sobre Gmail fuera del chat web, explica que la ejecucion segura existe en chat web y que `send_reply` sigue deshabilitado en esta fase."
      );
    }
  }

  if (
    isGoogleCalendarRecommendedPromptInput(input) &&
    environment.googleCalendarConfigured === true
  ) {
    if (environment.googleCalendarRuntimeAvailable === true) {
      lines.push(
        "Google Calendar esta conectado y puedes consultar disponibilidad o listar eventos reales en este chat.",
        "Para consultar disponibilidad di algo como: 'estoy libre el viernes', 'tengo hueco manana', 'hay espacio esta semana'.",
        "Para listar eventos di algo como: 'que tengo el martes', 'que hay en mi agenda hoy', 'muestra mis reuniones del lunes'.",
        "Fechas que el sistema puede resolver: hoy, manana, pasado manana, esta semana, proximos N dias (ej. proximos 3 dias), el lunes/martes/miercoles/jueves/viernes/sabado/domingo, o una fecha exacta en formato AAAA-MM-DD.",
        "Nunca inventes disponibilidad ni eventos — si la consulta no puede ejecutarse, explica el motivo con exactitud y sugiere como reformularla."
      );
    } else {
      lines.push(
        "Google Calendar esta configurado pero la ejecucion de consultas reales no esta disponible en esta superficie.",
        "No simules disponibilidad, no inventes eventos y no describas resultados de Calendar como si los hubieras consultado.",
        "Si el usuario pide revisar su agenda, disponibilidad o eventos, explica que esa funcionalidad esta preparada pero aun no activa aqui, y sugerile que use el chat web del agente.",
        "Puedes explicar como funciona la integracion de Google Calendar y que tipos de consultas podra hacer cuando este disponible: ver disponibilidad por dia, listar eventos de la semana, consultar un dia especifico."
      );
    }
  }

  return lines;
}

function resolveLegacyCapabilityLines(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): string[] {
  const lines = [...resolveLegacyCrmCapabilityLines(input, environment)];

  if (isGmailRecommendedPromptInput(input) && environment.gmailConfigured === true) {
    lines.push(
      environment.gmailRuntimeAvailable === true
        ? "Trabaja con Gmail usando metadata segura para lectura y approval inbox para borradores, labels y archivado, sin inventar resultados."
        : "Gmail esta configurado, pero no debes simular acciones fuera del chat web ni prometer `send_reply` en esta fase."
    );
  }

  if (
    isGoogleCalendarRecommendedPromptInput(input) &&
    environment.googleCalendarConfigured === true
  ) {
    lines.push(
      environment.googleCalendarRuntimeAvailable === true
        ? "Trabaja con Google Calendar usando solo acciones confirmadas y sin inventar resultados."
        : "Google Calendar esta configurado, pero solo debes asumir ejecucion real en chat web y nunca en `/run` mientras esa superficie siga sin runtime."
    );
  }

  return lines;
}

function resolveLegacyCrmCapabilityLines(
  input: RecommendedPromptInput,
  environment: RecommendedPromptEnvironment
): string[] {
  if (isSalesforceRecommendedPromptInput(input)) {
    return environment.salesforceUsable === true
      ? ["Trabaja con contexto de CRM cuando este disponible, sin inventar datos ni asumir cambios no confirmados."]
      : [];
  }

  return [];
}

function isSetupState(value: RecommendedPromptInput): value is AgentSetupState {
  return "builder_draft" in value;
}

function isSalesforceRecommendedPromptInput(
  value: RecommendedPromptInput
): value is AgentSetupState {
  return isSetupState(value) && (isSalesforceTemplateId(value.template_id) || value.integrations.includes("salesforce"));
}

function isGmailRecommendedPromptInput(
  value: RecommendedPromptInput
): value is AgentSetupState {
  return (
    isSetupState(value) &&
    (value.template_id === "gmail_inbox_assistant" ||
      value.template_id === "gmail_follow_up_assistant" ||
      value.integrations.includes("gmail"))
  );
}

function isGoogleCalendarRecommendedPromptInput(
  value: RecommendedPromptInput
): value is AgentSetupState {
  return (
    isSetupState(value) &&
    (value.template_id === "calendar_booking_assistant" ||
      value.template_id === "calendar_reschedule_assistant" ||
      value.integrations.includes("google_calendar"))
  );
}

function buildOnboardingContext(setupState: AgentSetupState): string[] {
  const areaLine = setupState.areas.length > 0
    ? `Areas de negocio: ${setupState.areas.map((area) => AGENT_AREA_LABELS[area]).join(", ")}.`
    : null;
  const integrationLine = setupState.integrations.length > 0
    ? `Integraciones previstas: ${setupState.integrations.join(", ")}.`
    : null;
  const scheduleLines = setupState.checklist
    .filter((item) => item.input_kind === "schedule")
    .map((item) => summarizeScheduleItem(setupState, item.id))
    .filter((value): value is string => Boolean(value));
  const criteriaLines = setupState.checklist
    .filter((item) => item.input_kind === "handoff_triggers")
    .map((item) => summarizeCriteriaItem(setupState, item))
    .filter((value): value is string => Boolean(value));

  return [
    `Canal principal: ${CHANNEL_LABELS[setupState.channel]}.`,
    ...[areaLine, integrationLine].filter((value): value is string => Boolean(value)),
    ...scheduleLines,
    ...criteriaLines,
  ];
}

function summarizeScheduleItem(setupState: AgentSetupState, itemId: string): string {
  const schedule = getScheduleTaskData(setupState, itemId, "UTC");
  const enabledDays = schedule.days.filter((day) => day.enabled);

  if (enabledDays.length === 0) {
    return `Disponibilidad: operar solo dentro del horario que confirme el equipo (timezone ${schedule.timezone}).`;
  }

  const daySummary = enabledDays
    .map((day) => `${WEEKDAY_LABELS[day.day]} ${day.start}-${day.end}`)
    .join("; ");

  return `Disponibilidad: ${daySummary} (timezone ${schedule.timezone}).`;
}

function summarizeCriteriaItem(
  setupState: AgentSetupState,
  item: AgentSetupState["checklist"][number]
): string | null {
  const criteria = getCriteriaTaskData(setupState, item.id);
  const values = [...criteria.selectedOptions, criteria.customValue.trim()].filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  return `${item.label}: ${values.join("; ")}.`;
}

function normalizePrompt(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

export function getAgentTemplatesForEcosystem(ecosystemId: WizardEcosystemId): AgentTemplate[] {
  return AGENT_TEMPLATES.filter((template) => template.ecosystem === ecosystemId);
}

export function getAgentTemplateById(templateId: AgentTemplateId): AgentTemplate {
  const template = AGENT_TEMPLATES.find((item) => item.id === templateId);
  return template ?? AGENT_TEMPLATES[AGENT_TEMPLATES.length - 1];
}

export function isSalesforceTemplateId(templateId: AgentTemplateId | null | undefined): boolean {
  return Boolean(templateId && getAgentTemplateById(templateId).ecosystem === "salesforce");
}

export function createSetupStateForTemplate(
  templateId: AgentTemplateId,
  options: { fallbackTimezone?: string } = {}
) {
  const template = getAgentTemplateById(templateId);
  const fallbackTimezone = options.fallbackTimezone ?? "UTC";

  return createSetupState({
    templateId: template.id,
    channel: template.channel,
    builderDraft: { ...template.builderDefaults },
    checklist: template.setupChecklist.map((item) => ({ ...item, status: "pending" })),
    taskData: buildInitialTaskData(template.setupChecklist, fallbackTimezone),
    currentStep: 3,
    fallbackTimezone,
  });
}

function buildInitialTaskData(
  checklist: AgentTemplate["setupChecklist"],
  fallbackTimezone: string
): Record<string, unknown> {
  const entries = checklist.map((item) => {
    if (item.input_kind === "schedule") {
      return [item.id, createDefaultScheduleTaskData(fallbackTimezone)] as const;
    }

    if (item.input_kind === "handoff_triggers") {
      return [item.id, createDefaultCriteriaTaskData()] as const;
    }

    if (item.input_kind === "documents_presence") {
      return [item.id, { deferred: false }] as const;
    }

    return [item.id, undefined] as const;
  });

  return Object.fromEntries(entries.filter((entry) => entry[1] !== undefined));
}

function resolveToneInstruction(tone: PromptBuilderDraft["tone"]): string {
  if (tone === "friendly") return "cercano, calido y facil de entender";
  if (tone === "formal") return "formal, ordenado y respetuoso";
  if (tone === "direct") return "directo, agil y orientado a la accion";
  return "profesional, claro y confiable";
}











