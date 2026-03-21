import { z } from "zod";
import type { Json } from "@/types/database";

export const GMAIL_TOOL_ACTIONS = [
  "search_threads",
  "read_thread",
  "create_draft_reply",
  "create_draft_email",
  "send_reply",
  "send_email",
  "archive_thread",
  "apply_label",
  "mark_as_read",
  "mark_as_unread",
  "star_thread",
  "unstar_thread",
  "remove_label",
  "forward_thread",
] as const;

export const GMAIL_READONLY_TOOL_ACTIONS = [
  "search_threads",
  "read_thread",
] as const;

export const GMAIL_WRITE_TOOL_ACTIONS = [
  "create_draft_reply",
  "create_draft_email",
  "send_reply",
  "send_email",
  "archive_thread",
  "apply_label",
  "mark_as_read",
  "mark_as_unread",
  "star_thread",
  "unstar_thread",
  "remove_label",
  "forward_thread",
] as const;

export const GOOGLE_CALENDAR_TOOL_ACTIONS = [
  "check_availability",
  "list_events",
  "get_event_details",
  "create_event",
  "reschedule_event",
  "cancel_event",
  "update_event_details",
] as const;

export const GOOGLE_SHEETS_TOOL_ACTIONS = [
  "list_sheets",
  "read_range",
  "get_spreadsheet",
  "preview_sheet",
  "read_table",
  "get_headers",
  "find_rows",
  "append_rows",
  "update_range",
  "clear_range",
  "append_records",
  "update_rows_by_match",
  "insert_rows",
  "insert_columns",
  "create_sheet",
  "rename_sheet",
  "duplicate_sheet",
  "format_range",
  "auto_resize_columns",
  "freeze_rows",
  "freeze_columns",
  "set_number_format",
  "sort_range",
  "set_basic_filter",
  "clear_basic_filter",
  "set_data_validation",
  "create_named_range",
  "protect_range",
  "create_spreadsheet",
  "copy_spreadsheet",
  "delete_rows",
  "delete_columns",
  "delete_sheet",
] as const;

export const GOOGLE_DRIVE_TOOL_ACTIONS = [
  "search_files",
  "list_folder",
  "get_file_metadata",
  "get_file_content",
  "create_folder",
  "move_file",
  "rename_file",
  "copy_file",
  "share_file",
  "trash_file",
  "upload_file",
] as const;

export type GmailToolAction = (typeof GMAIL_TOOL_ACTIONS)[number];
export type GmailReadOnlyToolAction = (typeof GMAIL_READONLY_TOOL_ACTIONS)[number];
export type GmailWriteToolAction = (typeof GMAIL_WRITE_TOOL_ACTIONS)[number];
export type GoogleCalendarToolAction =
  (typeof GOOGLE_CALENDAR_TOOL_ACTIONS)[number];
export type GoogleCalendarAction = GoogleCalendarToolAction;
export type GoogleSheetsToolAction = (typeof GOOGLE_SHEETS_TOOL_ACTIONS)[number];
export type GoogleSheetsAction = GoogleSheetsToolAction;
export type GoogleDriveToolAction = (typeof GOOGLE_DRIVE_TOOL_ACTIONS)[number];
export type GoogleDriveAction = GoogleDriveToolAction;

export type GmailAgentToolConfig = {
  provider: "google";
  surface: "gmail";
  allowed_actions: GmailToolAction[];
};

export type GoogleCalendarAgentToolConfig = {
  provider: "google";
  surface: "google_calendar";
  allowed_actions: GoogleCalendarToolAction[];
};

export type GoogleSheetsAgentToolConfig = {
  provider: "google";
  surface: "google_sheets";
  allowed_actions: GoogleSheetsToolAction[];
};

export type GoogleDriveAgentToolConfig = {
  provider: "google";
  surface: "google_drive";
  allowed_actions: GoogleDriveToolAction[];
};

export const GOOGLE_CALENDAR_READ_TOOL_ACTIONS = [
  "check_availability",
  "list_events",
  "get_event_details",
] as const;

export type GoogleCalendarReadToolAction =
  (typeof GOOGLE_CALENDAR_READ_TOOL_ACTIONS)[number];

export const GOOGLE_SHEETS_READ_TOOL_ACTIONS = [
  "list_sheets",
  "read_range",
  "get_spreadsheet",
  "preview_sheet",
  "read_table",
  "get_headers",
  "find_rows",
] as const;

export const GOOGLE_SHEETS_WRITE_TOOL_ACTIONS = [
  "append_rows",
  "update_range",
  "clear_range",
  "append_records",
  "update_rows_by_match",
  "insert_rows",
  "insert_columns",
  "create_sheet",
  "rename_sheet",
  "duplicate_sheet",
  "format_range",
  "auto_resize_columns",
  "freeze_rows",
  "freeze_columns",
  "set_number_format",
  "sort_range",
  "set_basic_filter",
  "clear_basic_filter",
  "set_data_validation",
  "create_named_range",
  "protect_range",
  "create_spreadsheet",
  "copy_spreadsheet",
  "delete_rows",
  "delete_columns",
  "delete_sheet",
] as const;

export const GOOGLE_SHEETS_DESTRUCTIVE_TOOL_ACTIONS = [
  "clear_range",
  "delete_rows",
  "delete_columns",
  "delete_sheet",
] as const;

export const GOOGLE_DRIVE_READ_TOOL_ACTIONS = [
  "search_files",
  "list_folder",
  "get_file_metadata",
  "get_file_content",
] as const;

export const GOOGLE_DRIVE_WRITE_TOOL_ACTIONS = [
  "create_folder",
  "move_file",
  "rename_file",
  "copy_file",
  "share_file",
  "trash_file",
  "upload_file",
] as const;

export const GOOGLE_DRIVE_DESTRUCTIVE_TOOL_ACTIONS = [
  "trash_file",
] as const;

export type GoogleSheetsReadToolAction =
  (typeof GOOGLE_SHEETS_READ_TOOL_ACTIONS)[number];
export type GoogleSheetsWriteToolAction =
  (typeof GOOGLE_SHEETS_WRITE_TOOL_ACTIONS)[number];
export type GoogleDriveReadToolAction =
  (typeof GOOGLE_DRIVE_READ_TOOL_ACTIONS)[number];
export type GoogleDriveWriteToolAction =
  (typeof GOOGLE_DRIVE_WRITE_TOOL_ACTIONS)[number];

export const gmailAgentToolConfigSchema = z.object({
  provider: z.literal("google"),
  surface: z.literal("gmail"),
  allowed_actions: z
    .array(z.enum(GMAIL_TOOL_ACTIONS))
    .min(1, "Debes habilitar al menos una accion")
    .max(GMAIL_TOOL_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

export const googleCalendarAgentToolConfigSchema = z.object({
  provider: z.literal("google"),
  surface: z.literal("google_calendar"),
  allowed_actions: z
    .array(z.enum(GOOGLE_CALENDAR_TOOL_ACTIONS))
    .min(1, "Debes habilitar al menos una accion")
    .max(GOOGLE_CALENDAR_TOOL_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

export const googleSheetsAgentToolConfigSchema = z.object({
  provider: z.literal("google"),
  surface: z.literal("google_sheets"),
  allowed_actions: z
    .array(z.enum(GOOGLE_SHEETS_TOOL_ACTIONS))
    .min(1, "Debes habilitar al menos una accion")
    .max(GOOGLE_SHEETS_TOOL_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

export const googleDriveAgentToolConfigSchema = z.object({
  provider: z.literal("google"),
  surface: z.literal("google_drive"),
  allowed_actions: z
    .array(z.enum(GOOGLE_DRIVE_TOOL_ACTIONS))
    .min(1, "Debes habilitar al menos una accion")
    .max(GOOGLE_DRIVE_TOOL_ACTIONS.length)
    .transform((actions) => [...new Set(actions)]),
});

const googleCalendarBaseWindowSchema = z.object({
  startIso: z.string().datetime("startIso invalido"),
  endIso: z.string().datetime("endIso invalido"),
  timezone: z.string().trim().min(1, "timezone requerida").max(100, "timezone invalida"),
});

export const executeGoogleCalendarCheckAvailabilitySchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("check_availability"),
    slotMinutes: z.number().int().min(15).max(180).optional(),
  });

export const executeGoogleCalendarListEventsSchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("list_events"),
    maxResults: z.number().int().min(1).max(20).optional(),
  });

export const executeGoogleCalendarGetEventDetailsSchema = z.object({
  action: z.literal("get_event_details"),
  eventId: z.string().trim().min(1).max(255),
  timezone: z.string().trim().min(1).max(100),
});

export const executeGoogleCalendarReadToolSchema = z.discriminatedUnion("action", [
  executeGoogleCalendarCheckAvailabilitySchema,
  executeGoogleCalendarListEventsSchema,
  executeGoogleCalendarGetEventDetailsSchema,
]);

export type ExecuteGoogleCalendarReadToolInput = z.infer<
  typeof executeGoogleCalendarReadToolSchema
>;

const googleSheetsTargetSchema = {
  spreadsheetId: z.string().trim().min(10).max(200).optional(),
  spreadsheetUrl: z.string().url().max(2000).optional(),
} satisfies z.ZodRawShape;

const googleSheetsRangeSchema = z.string().trim().min(1).max(200);
const googleSheetsSheetNameSchema = z.string().trim().min(1).max(100);
const googleSheetsValuesSchema = z
  .array(
    z.array(z.string().max(2000)).max(50, "No se permiten mas de 50 columnas")
  )
  .min(1, "Debes enviar al menos una fila")
  .max(100, "No se permiten mas de 100 filas");
const googleSheetsCellValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.null(),
]);
const googleSheetsRecordSchema = z
  .record(z.string().trim().min(1).max(100), googleSheetsCellValueSchema)
  .refine((record) => Object.keys(record).length > 0, {
    message: "Cada registro debe incluir al menos una columna.",
  });
const googleSheetsRecordsSchema = z
  .array(googleSheetsRecordSchema)
  .min(1, "Debes enviar al menos un registro")
  .max(100, "No se permiten mas de 100 registros");
const googleSheetsMatchSchema = z.object({
  column: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(2000),
  operator: z.literal("equals"),
});
const googleSheetsHeaderRowIndexSchema = z.number().int().min(1).max(100).optional();
const googleSheetsTableRangeSchema = z.string().trim().min(1).max(200).optional();
const googleSheetsTargetRefinement = <T extends z.ZodObject<z.ZodRawShape>>(schema: T) =>
  schema.superRefine((value, ctx) => {
    const parsed = value as {
      spreadsheetId?: string | null;
      spreadsheetUrl?: string | null;
    };

    if (!parsed.spreadsheetId?.trim() && !parsed.spreadsheetUrl?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["spreadsheetUrl"],
        message: "Debes indicar un spreadsheetId o una URL valida de Google Sheets.",
      });
    }
  });

const googleSheetsBaseTargetObjectSchema = z.object({
  ...googleSheetsTargetSchema,
});
const googleSheetsTargetWithSheetObjectSchema = googleSheetsBaseTargetObjectSchema.extend({
  sheetName: googleSheetsSheetNameSchema,
});
const googleSheetsTargetWithRangeObjectSchema = googleSheetsTargetWithSheetObjectSchema.extend({
  rangeA1: googleSheetsRangeSchema,
});
const googleSheetsTargetWithTableObjectSchema = googleSheetsTargetWithSheetObjectSchema.extend({
  headerRowIndex: googleSheetsHeaderRowIndexSchema.default(1),
  tableRangeA1: googleSheetsTableRangeSchema,
});
const googleSheetsColorSchema = z.object({
  red: z.number().min(0).max(1),
  green: z.number().min(0).max(1),
  blue: z.number().min(0).max(1),
});
const googleSheetsBorderStyleSchema = z.enum([
  "SOLID",
  "SOLID_MEDIUM",
  "SOLID_THICK",
  "DASHED",
  "DOTTED",
]);
const googleSheetsBorderSchema = z.object({
  color: googleSheetsColorSchema.optional(),
  style: googleSheetsBorderStyleSchema.optional(),
});
const googleSheetsFormatSchema = z.object({
  fill: googleSheetsColorSchema.optional(),
  textColor: googleSheetsColorSchema.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  alignment: z
    .object({
      horizontal: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
      vertical: z.enum(["TOP", "MIDDLE", "BOTTOM"]).optional(),
    })
    .optional(),
  wrap: z.enum(["OVERFLOW_CELL", "LEGACY_WRAP", "CLIP"]).optional(),
  borders: z
    .object({
      top: googleSheetsBorderSchema.optional(),
      bottom: googleSheetsBorderSchema.optional(),
      left: googleSheetsBorderSchema.optional(),
      right: googleSheetsBorderSchema.optional(),
    })
    .optional(),
});
const googleSheetsValidationRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("one_of_list"),
    values: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
    allowInvalid: z.boolean().optional(),
    inputMessage: z.string().trim().max(500).optional(),
  }),
  z.object({
    type: z.literal("checkbox"),
    allowInvalid: z.boolean().optional(),
    inputMessage: z.string().trim().max(500).optional(),
    checkedValue: z.string().trim().max(200).optional(),
    uncheckedValue: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal("number_greater_than"),
    value: z.number(),
    allowInvalid: z.boolean().optional(),
    inputMessage: z.string().trim().max(500).optional(),
  }),
]);
const googleSheetsProtectedTargetObjectSchema =
  googleSheetsTargetWithRangeObjectSchema.extend({
  warningOnly: z.boolean().optional(),
});
const googleSheetsSourceTargetObjectSchema = z.object({
  sourceSpreadsheetId: z.string().trim().min(10).max(200).optional(),
  sourceSpreadsheetUrl: z.string().url().max(2000).optional(),
});
export const executeGoogleSheetsListSheetsSchema = googleSheetsTargetRefinement(
  googleSheetsBaseTargetObjectSchema.extend({
    action: z.literal("list_sheets"),
  })
);

export const executeGoogleSheetsReadRangeSchema = googleSheetsTargetRefinement(
  googleSheetsTargetWithRangeObjectSchema.extend({
    action: z.literal("read_range"),
  })
);

export const executeGoogleSheetsGetSpreadsheetSchema = googleSheetsTargetRefinement(
  googleSheetsBaseTargetObjectSchema.extend({
  action: z.literal("get_spreadsheet"),
  })
);

export const executeGoogleSheetsPreviewSheetSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("preview_sheet"),
    })
  );

export const executeGoogleSheetsReadTableSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithTableObjectSchema.extend({
      action: z.literal("read_table"),
    })
  );

export const executeGoogleSheetsGetHeadersSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithTableObjectSchema.extend({
      action: z.literal("get_headers"),
    })
  );

export const executeGoogleSheetsFindRowsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithTableObjectSchema.extend({
      action: z.literal("find_rows"),
      match: googleSheetsMatchSchema,
    })
  );

export const executeGoogleSheetsAppendRowsSchema = googleSheetsTargetRefinement(
  googleSheetsTargetWithRangeObjectSchema.extend({
    action: z.literal("append_rows"),
    values: googleSheetsValuesSchema,
  })
);

export const executeGoogleSheetsUpdateRangeSchema = googleSheetsTargetRefinement(
  googleSheetsTargetWithRangeObjectSchema.extend({
    action: z.literal("update_range"),
    values: googleSheetsValuesSchema,
  })
);

export const executeGoogleSheetsClearRangeSchema = googleSheetsTargetRefinement(
  googleSheetsTargetWithRangeObjectSchema.extend({
    action: z.literal("clear_range"),
  })
);

export const executeGoogleSheetsAppendRecordsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithTableObjectSchema.extend({
      action: z.literal("append_records"),
      records: googleSheetsRecordsSchema,
    })
  );

export const executeGoogleSheetsUpdateRowsByMatchSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithTableObjectSchema.extend({
      action: z.literal("update_rows_by_match"),
      match: googleSheetsMatchSchema,
      records: googleSheetsRecordsSchema,
    })
  );

export const executeGoogleSheetsInsertRowsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("insert_rows"),
      startRowIndex: z.number().int().min(0).max(999999),
      rowCount: z.number().int().min(1).max(1000),
    })
  );

export const executeGoogleSheetsInsertColumnsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("insert_columns"),
      startColumnIndex: z.number().int().min(0).max(18277),
      columnCount: z.number().int().min(1).max(1000),
    })
  );

export const executeGoogleSheetsCreateSheetSchema = googleSheetsTargetRefinement(
  googleSheetsBaseTargetObjectSchema.extend({
    action: z.literal("create_sheet"),
    title: z.string().trim().min(1).max(100),
    rowCount: z.number().int().min(1).max(20000).optional(),
    columnCount: z.number().int().min(1).max(1000).optional(),
  })
);

export const executeGoogleSheetsRenameSheetSchema = googleSheetsTargetRefinement(
  googleSheetsBaseTargetObjectSchema.extend({
    action: z.literal("rename_sheet"),
    sheetName: googleSheetsSheetNameSchema,
    newSheetName: z.string().trim().min(1).max(100),
  })
);

export const executeGoogleSheetsDuplicateSheetSchema = googleSheetsTargetRefinement(
  googleSheetsBaseTargetObjectSchema.extend({
    action: z.literal("duplicate_sheet"),
    sheetName: googleSheetsSheetNameSchema,
    newSheetName: z.string().trim().min(1).max(100).optional(),
  })
);

export const executeGoogleSheetsFormatRangeSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithRangeObjectSchema.extend({
      action: z.literal("format_range"),
      format: googleSheetsFormatSchema,
    })
  );

export const executeGoogleSheetsAutoResizeColumnsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("auto_resize_columns"),
      startColumnIndex: z.number().int().min(0).max(18277),
      columnCount: z.number().int().min(1).max(1000),
    })
  );

export const executeGoogleSheetsFreezeRowsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("freeze_rows"),
      count: z.number().int().min(0).max(1000),
    })
  );

export const executeGoogleSheetsFreezeColumnsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("freeze_columns"),
      count: z.number().int().min(0).max(1000),
    })
  );

export const executeGoogleSheetsSetNumberFormatSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithRangeObjectSchema.extend({
      action: z.literal("set_number_format"),
      pattern: z.string().trim().min(1).max(100),
      type: z.enum([
        "TEXT",
        "NUMBER",
        "PERCENT",
        "CURRENCY",
        "DATE",
        "TIME",
        "DATE_TIME",
        "SCIENTIFIC",
      ]),
    })
  );

export const executeGoogleSheetsSortRangeSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithRangeObjectSchema.extend({
      action: z.literal("sort_range"),
      sortSpecs: z
        .array(
          z.object({
            dimensionIndex: z.number().int().min(0).max(18277),
            sortOrder: z.enum(["ASCENDING", "DESCENDING"]).default("ASCENDING"),
          })
        )
        .min(1)
        .max(10),
    })
  );

export const executeGoogleSheetsSetBasicFilterSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("set_basic_filter"),
      rangeA1: googleSheetsRangeSchema.optional(),
    })
  );

export const executeGoogleSheetsClearBasicFilterSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("clear_basic_filter"),
      rangeA1: googleSheetsRangeSchema.optional(),
    })
  );

export const executeGoogleSheetsSetDataValidationSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithRangeObjectSchema.extend({
      action: z.literal("set_data_validation"),
      rule: googleSheetsValidationRuleSchema,
    })
  );

export const executeGoogleSheetsCreateNamedRangeSchema =
  googleSheetsTargetRefinement(
    googleSheetsBaseTargetObjectSchema.extend({
      action: z.literal("create_named_range"),
      name: z.string().trim().min(1).max(100),
      sheetName: googleSheetsSheetNameSchema,
      rangeA1: googleSheetsRangeSchema,
    })
  );

export const executeGoogleSheetsProtectRangeSchema =
  googleSheetsTargetRefinement(
    googleSheetsProtectedTargetObjectSchema.extend({
      action: z.literal("protect_range"),
    })
  );

export const executeGoogleSheetsCreateSpreadsheetSchema = z.object({
  action: z.literal("create_spreadsheet"),
  title: z.string().trim().min(1).max(200),
  initialSheetTitle: z.string().trim().min(1).max(100).optional(),
});

export const executeGoogleSheetsCopySpreadsheetSchema = googleSheetsSourceTargetObjectSchema
  .extend({
    action: z.literal("copy_spreadsheet"),
    title: z.string().trim().min(1).max(200),
  })
  .superRefine((value, ctx) => {
    if (!value.sourceSpreadsheetId?.trim() && !value.sourceSpreadsheetUrl?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceSpreadsheetUrl"],
        message: "Debes indicar un sourceSpreadsheetId o una URL valida para copiar el spreadsheet.",
      });
    }
  });

export const executeGoogleSheetsDeleteRowsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithTableObjectSchema.extend({
      action: z.literal("delete_rows"),
      match: googleSheetsMatchSchema,
    })
  );

export const executeGoogleSheetsDeleteColumnsSchema =
  googleSheetsTargetRefinement(
    googleSheetsTargetWithSheetObjectSchema.extend({
      action: z.literal("delete_columns"),
      startColumnIndex: z.number().int().min(0).max(18277),
      columnCount: z.number().int().min(1).max(1000),
    })
  );

export const executeGoogleSheetsDeleteSheetSchema = googleSheetsTargetRefinement(
  googleSheetsBaseTargetObjectSchema.extend({
    action: z.literal("delete_sheet"),
    sheetName: googleSheetsSheetNameSchema,
  })
);

export const executeGoogleSheetsReadToolSchema = z.union([
  executeGoogleSheetsListSheetsSchema,
  executeGoogleSheetsReadRangeSchema,
  executeGoogleSheetsGetSpreadsheetSchema,
  executeGoogleSheetsPreviewSheetSchema,
  executeGoogleSheetsReadTableSchema,
  executeGoogleSheetsGetHeadersSchema,
  executeGoogleSheetsFindRowsSchema,
]);

export const executeGoogleSheetsWriteToolSchema = z.union([
  executeGoogleSheetsAppendRowsSchema,
  executeGoogleSheetsUpdateRangeSchema,
  executeGoogleSheetsClearRangeSchema,
  executeGoogleSheetsAppendRecordsSchema,
  executeGoogleSheetsUpdateRowsByMatchSchema,
  executeGoogleSheetsInsertRowsSchema,
  executeGoogleSheetsInsertColumnsSchema,
  executeGoogleSheetsCreateSheetSchema,
  executeGoogleSheetsRenameSheetSchema,
  executeGoogleSheetsDuplicateSheetSchema,
  executeGoogleSheetsFormatRangeSchema,
  executeGoogleSheetsAutoResizeColumnsSchema,
  executeGoogleSheetsFreezeRowsSchema,
  executeGoogleSheetsFreezeColumnsSchema,
  executeGoogleSheetsSetNumberFormatSchema,
  executeGoogleSheetsSortRangeSchema,
  executeGoogleSheetsSetBasicFilterSchema,
  executeGoogleSheetsClearBasicFilterSchema,
  executeGoogleSheetsSetDataValidationSchema,
  executeGoogleSheetsCreateNamedRangeSchema,
  executeGoogleSheetsProtectRangeSchema,
  executeGoogleSheetsCreateSpreadsheetSchema,
  executeGoogleSheetsCopySpreadsheetSchema,
  executeGoogleSheetsDeleteRowsSchema,
  executeGoogleSheetsDeleteColumnsSchema,
  executeGoogleSheetsDeleteSheetSchema,
]);

export type ExecuteGoogleSheetsReadToolInput = z.infer<
  typeof executeGoogleSheetsReadToolSchema
>;
export type ExecuteGoogleSheetsWriteToolInput = z.infer<
  typeof executeGoogleSheetsWriteToolSchema
>;
export type ExecuteGoogleSheetsToolInput =
  | ExecuteGoogleSheetsReadToolInput
  | ExecuteGoogleSheetsWriteToolInput;

const GOOGLE_DRIVE_MAX_CONTENT_BYTES = 500 * 1024;
const GOOGLE_DRIVE_MAX_UPLOAD_BYTES = 1024 * 1024;

export const GOOGLE_DRIVE_EXPORTABLE_TEXT_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/xml",
] as const;

export const GOOGLE_DRIVE_SAFE_UPLOAD_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/xml",
] as const;

const googleDriveFileIdSchema = z.string().trim().min(3).max(255);
const googleDriveFolderIdSchema = z.string().trim().min(1).max(255);
const googleDriveNameSchema = z.string().trim().min(1).max(255);
const googleDrivePageSizeSchema = z.number().int().min(1).max(100).optional();
const googleDriveOptionalQuerySchema = z.string().trim().min(1).max(500).optional();
const googleDriveSearchCorporaSchema = z
  .enum(["user", "drive", "allDrives"])
  .optional();
const googleDriveOrderBySchema = z
  .enum([
    "createdTime",
    "folder",
    "modifiedByMeTime",
    "modifiedTime",
    "name",
    "name_natural",
    "quotaBytesUsed",
    "recency",
    "sharedWithMeTime",
    "starred",
    "viewedByMeTime",
  ])
  .optional();
const googleDriveSharedDrivesSchema = z.object({
  supportsAllDrives: z.boolean().optional(),
  includeItemsFromAllDrives: z.boolean().optional(),
  driveId: googleDriveFileIdSchema.optional(),
  corpora: googleDriveSearchCorporaSchema,
});
const googleDriveFileReferenceSchema = z.object({
  fileId: googleDriveFileIdSchema,
  supportsAllDrives: z.boolean().optional(),
});

export const executeGoogleDriveSearchFilesSchema = googleDriveSharedDrivesSchema.extend({
  action: z.literal("search_files"),
  query: googleDriveOptionalQuerySchema,
  pageSize: googleDrivePageSizeSchema,
  pageToken: z.string().trim().min(1).max(500).optional(),
  orderBy: googleDriveOrderBySchema,
  mimeTypes: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  parentFolderId: googleDriveFolderIdSchema.optional(),
});

export const executeGoogleDriveListFolderSchema = googleDriveSharedDrivesSchema.extend({
  action: z.literal("list_folder"),
  folderId: googleDriveFolderIdSchema,
  pageSize: googleDrivePageSizeSchema,
  pageToken: z.string().trim().min(1).max(500).optional(),
  orderBy: googleDriveOrderBySchema,
});

export const executeGoogleDriveGetFileMetadataSchema =
  googleDriveFileReferenceSchema.extend({
    action: z.literal("get_file_metadata"),
  });

export const executeGoogleDriveGetFileContentSchema =
  googleDriveFileReferenceSchema.extend({
    action: z.literal("get_file_content"),
    exportMimeType: z.enum(GOOGLE_DRIVE_EXPORTABLE_TEXT_MIME_TYPES).optional(),
    maxBytes: z.number().int().min(1).max(GOOGLE_DRIVE_MAX_CONTENT_BYTES).optional(),
  });

export const executeGoogleDriveCreateFolderSchema = z.object({
  action: z.literal("create_folder"),
  name: googleDriveNameSchema,
  parentFolderId: googleDriveFolderIdSchema.optional(),
  supportsAllDrives: z.boolean().optional(),
});

export const executeGoogleDriveMoveFileSchema = z.object({
  action: z.literal("move_file"),
  fileId: googleDriveFileIdSchema,
  destinationFolderId: googleDriveFolderIdSchema,
  sourceFolderId: googleDriveFolderIdSchema.optional(),
  supportsAllDrives: z.boolean().optional(),
});

export const executeGoogleDriveRenameFileSchema = z.object({
  action: z.literal("rename_file"),
  fileId: googleDriveFileIdSchema,
  newName: googleDriveNameSchema,
  supportsAllDrives: z.boolean().optional(),
});

export const executeGoogleDriveCopyFileSchema = z.object({
  action: z.literal("copy_file"),
  fileId: googleDriveFileIdSchema,
  name: googleDriveNameSchema.optional(),
  parentFolderId: googleDriveFolderIdSchema.optional(),
  supportsAllDrives: z.boolean().optional(),
});

export const executeGoogleDriveShareFileSchema = z
  .object({
    action: z.literal("share_file"),
    fileId: googleDriveFileIdSchema,
    role: z.enum(["reader", "commenter", "writer"]),
    type: z.enum(["user", "group", "domain", "anyone"]).default("user"),
    emailAddress: z.string().trim().email().max(254).optional(),
    domain: z.string().trim().min(1).max(255).optional(),
    message: z.string().trim().max(1000).optional(),
    sendNotificationEmail: z.boolean().optional(),
    supportsAllDrives: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.type === "user" || value.type === "group") && !value.emailAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emailAddress"],
        message: "Debes indicar un email valido para compartir con un usuario o grupo.",
      });
    }

    if (value.type === "domain" && !value.domain) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["domain"],
        message: "Debes indicar un dominio valido para compartir por dominio.",
      });
    }
  });

export const executeGoogleDriveTrashFileSchema = z.object({
  action: z.literal("trash_file"),
  fileId: googleDriveFileIdSchema,
  supportsAllDrives: z.boolean().optional(),
});

export const executeGoogleDriveUploadFileSchema = z.object({
  action: z.literal("upload_file"),
  fileName: googleDriveNameSchema,
  mimeType: z.enum(GOOGLE_DRIVE_SAFE_UPLOAD_MIME_TYPES),
  content: z
    .string()
    .min(1, "Debes indicar contenido para subir.")
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= GOOGLE_DRIVE_MAX_UPLOAD_BYTES,
      "El archivo supera el maximo permitido de 1 MB para upload_file."
    ),
  parentFolderId: googleDriveFolderIdSchema.optional(),
  supportsAllDrives: z.boolean().optional(),
});

export const executeGoogleDriveReadToolSchema = z.union([
  executeGoogleDriveSearchFilesSchema,
  executeGoogleDriveListFolderSchema,
  executeGoogleDriveGetFileMetadataSchema,
  executeGoogleDriveGetFileContentSchema,
]);

export const executeGoogleDriveWriteToolSchema = z.union([
  executeGoogleDriveCreateFolderSchema,
  executeGoogleDriveMoveFileSchema,
  executeGoogleDriveRenameFileSchema,
  executeGoogleDriveCopyFileSchema,
  executeGoogleDriveShareFileSchema,
  executeGoogleDriveTrashFileSchema,
  executeGoogleDriveUploadFileSchema,
]);

export type ExecuteGoogleDriveReadToolInput = z.infer<
  typeof executeGoogleDriveReadToolSchema
>;
export type ExecuteGoogleDriveWriteToolInput = z.infer<
  typeof executeGoogleDriveWriteToolSchema
>;
export type ExecuteGoogleDriveToolInput =
  | ExecuteGoogleDriveReadToolInput
  | ExecuteGoogleDriveWriteToolInput;

export const executeGoogleGmailSearchThreadsSchema = z.object({
  action: z.literal("search_threads"),
  query: z.string().trim().max(120).nullable().optional(),
  maxResults: z.number().int().min(1).max(5).optional(),
});

export const executeGoogleGmailReadThreadSchema = z.object({
  action: z.literal("read_thread"),
  threadId: z.string().trim().min(12).max(128),
});

export const executeGoogleGmailReadToolSchema = z.discriminatedUnion("action", [
  executeGoogleGmailSearchThreadsSchema,
  executeGoogleGmailReadThreadSchema,
]);

export type ExecuteGoogleGmailReadToolInput = z.infer<
  typeof executeGoogleGmailReadToolSchema
>;

const gmailThreadReferenceSchema = {
  threadId: z.string().trim().min(12).max(128),
  messageId: z.string().trim().min(1).max(128),
  rfcMessageId: z.string().trim().min(3).max(255).optional(),
  subject: z.string().trim().min(1).max(160).optional(),
};

const gmailEmailSchema = z.string().trim().toLowerCase().email().max(254);

const gmailRecipientsSchema = {
  to: z.array(gmailEmailSchema).min(1).max(20),
  cc: z.array(gmailEmailSchema).max(20).optional(),
  bcc: z.array(gmailEmailSchema).max(20).optional(),
};

export function dedupeEmails(emails: string[]): string[] {
  return [...new Set(emails.map((e) => e.toLowerCase().trim()))];
}


const gmailAttachmentSchema = {
  links: z.array(z.string().url().max(2000)).max(10).optional(),
  attachmentPaths: z.array(z.string().trim().min(1).max(500)).max(3).optional(),
};

export const executeGoogleGmailCreateDraftReplySchema = z.object({
  action: z.literal("create_draft_reply"),
  ...gmailThreadReferenceSchema,
  body: z.string().trim().min(1).max(8000),
  cc: z.array(gmailEmailSchema).max(20).optional(),
  bcc: z.array(gmailEmailSchema).max(20).optional(),
  ...gmailAttachmentSchema,
});

export const executeGoogleGmailSendReplySchema = z.object({
  action: z.literal("send_reply"),
  ...gmailThreadReferenceSchema,
  body: z.string().trim().min(1).max(8000),
  cc: z.array(gmailEmailSchema).max(20).optional(),
  bcc: z.array(gmailEmailSchema).max(20).optional(),
  ...gmailAttachmentSchema,
});

export const executeGoogleGmailCreateDraftEmailSchema = z.object({
  action: z.literal("create_draft_email"),
  ...gmailRecipientsSchema,
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(8000),
  ...gmailAttachmentSchema,
});

export const executeGoogleGmailSendEmailSchema = z.object({
  action: z.literal("send_email"),
  ...gmailRecipientsSchema,
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(8000),
  ...gmailAttachmentSchema,
});

export const executeGoogleGmailArchiveThreadSchema = z.object({
  action: z.literal("archive_thread"),
  ...gmailThreadReferenceSchema,
});

export const executeGoogleGmailApplyLabelSchema = z.object({
  action: z.literal("apply_label"),
  ...gmailThreadReferenceSchema,
  labelName: z.string().trim().min(1).max(225),
});

export const executeGoogleGmailMarkAsReadSchema = z.object({
  action: z.literal("mark_as_read"),
  ...gmailThreadReferenceSchema,
});

export const executeGoogleGmailMarkAsUnreadSchema = z.object({
  action: z.literal("mark_as_unread"),
  ...gmailThreadReferenceSchema,
});

export const executeGoogleGmailStarThreadSchema = z.object({
  action: z.literal("star_thread"),
  ...gmailThreadReferenceSchema,
});

export const executeGoogleGmailUnstarThreadSchema = z.object({
  action: z.literal("unstar_thread"),
  ...gmailThreadReferenceSchema,
});

export const executeGoogleGmailRemoveLabelSchema = z.object({
  action: z.literal("remove_label"),
  ...gmailThreadReferenceSchema,
  labelName: z.string().trim().min(1).max(225),
});

export const executeGoogleGmailForwardThreadSchema = z.object({
  action: z.literal("forward_thread"),
  ...gmailThreadReferenceSchema,
  to: z.array(gmailEmailSchema).min(1).max(20),
  cc: z.array(gmailEmailSchema).max(20).optional(),
  bcc: z.array(gmailEmailSchema).max(20).optional(),
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().max(8000).optional(),
});

export const executeGoogleGmailWriteToolSchema = z.discriminatedUnion("action", [
  executeGoogleGmailCreateDraftReplySchema,
  executeGoogleGmailSendReplySchema,
  executeGoogleGmailCreateDraftEmailSchema,
  executeGoogleGmailSendEmailSchema,
  executeGoogleGmailArchiveThreadSchema,
  executeGoogleGmailApplyLabelSchema,
  executeGoogleGmailMarkAsReadSchema,
  executeGoogleGmailMarkAsUnreadSchema,
  executeGoogleGmailStarThreadSchema,
  executeGoogleGmailUnstarThreadSchema,
  executeGoogleGmailRemoveLabelSchema,
  executeGoogleGmailForwardThreadSchema,
]);

export type ExecuteGoogleGmailWriteToolInput = z.infer<
  typeof executeGoogleGmailWriteToolSchema
>;

export type ExecuteGoogleGmailToolInput =
  | ExecuteGoogleGmailReadToolInput
  | ExecuteGoogleGmailWriteToolInput;

export const executeGoogleCalendarCreateEventSchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("create_event"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    location: z.string().trim().max(500).optional(),
    attendeeEmails: z.array(z.string().email()).max(20).optional(),
  });

export const executeGoogleCalendarRescheduleEventSchema =
  googleCalendarBaseWindowSchema.extend({
    action: z.literal("reschedule_event"),
    eventId: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(200).optional(),
    eventTitle: z.string().trim().min(1).max(200).optional(),
    eventStartIso: z.string().datetime("eventStartIso invalido").optional(),
    eventEndIso: z.string().datetime("eventEndIso invalido").optional(),
    eventTimezone: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(5000).optional(),
    location: z.string().trim().max(500).optional(),
    attendeeEmails: z.array(z.string().email()).max(20).optional(),
  });

export const executeGoogleCalendarCancelEventSchema = z.object({
  action: z.literal("cancel_event"),
  eventId: z.string().trim().min(1).max(255),
  eventTitle: z.string().trim().min(1).max(200).optional(),
  eventStartIso: z.string().datetime("eventStartIso invalido").optional(),
  eventEndIso: z.string().datetime("eventEndIso invalido").optional(),
  eventTimezone: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(500).optional(),
  attendeeEmails: z.array(z.string().email()).max(20).optional(),
});

const executeGoogleCalendarUpdateEventDetailsBaseSchema = z.object({
  action: z.literal("update_event_details"),
  eventId: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(500).optional(),
  attendeeEmails: z.array(z.string().email()).max(20).optional(),
});

export const executeGoogleCalendarUpdateEventDetailsSchema =
  executeGoogleCalendarUpdateEventDetailsBaseSchema.superRefine((value, ctx) => {
    if (
      value.title === undefined &&
      value.description === undefined &&
      value.location === undefined &&
      value.attendeeEmails === undefined
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes indicar al menos un campo a actualizar" });
    }
  });

export const executeGoogleCalendarWriteToolSchema = z.discriminatedUnion("action", [
  executeGoogleCalendarCreateEventSchema,
  executeGoogleCalendarRescheduleEventSchema,
  executeGoogleCalendarCancelEventSchema,
  executeGoogleCalendarUpdateEventDetailsBaseSchema,
]);

export type ExecuteGoogleCalendarWriteToolInput = z.infer<
  typeof executeGoogleCalendarWriteToolSchema
>;

export type ExecuteGoogleCalendarToolInput =
  | ExecuteGoogleCalendarReadToolInput
  | ExecuteGoogleCalendarWriteToolInput;

export function getDefaultGmailAgentToolConfig(): GmailAgentToolConfig {
  return {
    provider: "google",
    surface: "gmail",
    allowed_actions: [...GMAIL_READONLY_TOOL_ACTIONS],
  };
}

export function getDefaultGoogleCalendarAgentToolConfig(): GoogleCalendarAgentToolConfig {
  return {
    provider: "google",
    surface: "google_calendar",
    allowed_actions: [...GOOGLE_CALENDAR_TOOL_ACTIONS],
  };
}

export function getDefaultGoogleSheetsAgentToolConfig(): GoogleSheetsAgentToolConfig {
  return {
    provider: "google",
    surface: "google_sheets",
    allowed_actions: [...GOOGLE_SHEETS_READ_TOOL_ACTIONS],
  };
}

export function getDefaultGoogleDriveAgentToolConfig(): GoogleDriveAgentToolConfig {
  return {
    provider: "google",
    surface: "google_drive",
    allowed_actions: [...GOOGLE_DRIVE_READ_TOOL_ACTIONS],
  };
}

export function parseGmailAgentToolConfig(
  value: Json | null | undefined
): GmailAgentToolConfig | null {
  const parsed = gmailAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseGoogleCalendarAgentToolConfig(
  value: Json | null | undefined
): GoogleCalendarAgentToolConfig | null {
  const parsed = googleCalendarAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseGoogleSheetsAgentToolConfig(
  value: Json | null | undefined
): GoogleSheetsAgentToolConfig | null {
  const parsed = googleSheetsAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseGoogleDriveAgentToolConfig(
  value: Json | null | undefined
): GoogleDriveAgentToolConfig | null {
  const parsed = googleDriveAgentToolConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isGoogleCalendarReadAction(
  action: GoogleCalendarToolAction
): action is GoogleCalendarReadToolAction {
  return GOOGLE_CALENDAR_READ_TOOL_ACTIONS.includes(
    action as GoogleCalendarReadToolAction
  );
}

export function isGoogleCalendarActionAllowed(
  config: GoogleCalendarAgentToolConfig,
  action: GoogleCalendarToolAction
): boolean {
  return config.allowed_actions.includes(action);
}

export function isGoogleSheetsReadAction(
  action: GoogleSheetsToolAction
): action is GoogleSheetsReadToolAction {
  return GOOGLE_SHEETS_READ_TOOL_ACTIONS.includes(action as GoogleSheetsReadToolAction);
}

export function isGoogleSheetsWriteAction(
  action: GoogleSheetsToolAction
): action is GoogleSheetsWriteToolAction {
  return GOOGLE_SHEETS_WRITE_TOOL_ACTIONS.includes(action as GoogleSheetsWriteToolAction);
}

export function isGoogleSheetsActionAllowed(
  config: GoogleSheetsAgentToolConfig,
  action: GoogleSheetsToolAction
): boolean {
  return config.allowed_actions.includes(action);
}

export function isGoogleDriveReadAction(
  action: GoogleDriveToolAction
): action is GoogleDriveReadToolAction {
  return GOOGLE_DRIVE_READ_TOOL_ACTIONS.includes(action as GoogleDriveReadToolAction);
}

export function isGoogleDriveWriteAction(
  action: GoogleDriveToolAction
): action is GoogleDriveWriteToolAction {
  return GOOGLE_DRIVE_WRITE_TOOL_ACTIONS.includes(action as GoogleDriveWriteToolAction);
}

export function isGoogleDriveActionAllowed(
  config: GoogleDriveAgentToolConfig,
  action: GoogleDriveToolAction
): boolean {
  return config.allowed_actions.includes(action);
}

export function getGmailActionLabel(action: GmailToolAction): string {
  const labels: Record<GmailToolAction, string> = {
    search_threads: "Buscar threads",
    read_thread: "Leer thread",
    create_draft_reply: "Crear borrador de respuesta",
    create_draft_email: "Crear borrador nuevo",
    send_reply: "Enviar respuesta",
    send_email: "Enviar email nuevo",
    archive_thread: "Archivar thread",
    apply_label: "Aplicar label",
    mark_as_read: "Marcar como leido",
    mark_as_unread: "Marcar como no leido",
    star_thread: "Destacar thread",
    unstar_thread: "Quitar destacado",
    remove_label: "Quitar label",
    forward_thread: "Reenviar thread",
  };

  return labels[action];
}

export function getGmailActionDescription(action: GmailToolAction): string {
  const descriptions: Record<GmailToolAction, string> = {
    search_threads: "Busca hilos recientes con metadata segura, headers utiles y snippet truncado sin body completo.",
    read_thread: "Resume un hilo con metadata, headers, snippets y conteo de adjuntos, sin exponer body ni HTML.",
    create_draft_reply: "Crea un borrador real de respuesta en Gmail despues de pasar por approval inbox y worker async.",
    create_draft_email: "Crea un borrador de email nuevo con destinatarios libres despues de aprobacion humana.",
    send_reply: "Envia una respuesta real sobre un hilo existente despues de aprobacion humana.",
    send_email: "Envia un email nuevo con destinatarios libres despues de aprobacion humana.",
    archive_thread: "Archiva el thread real quitandolo de Inbox despues de aprobacion humana.",
    apply_label: "Aplica un label existente al thread real despues de aprobacion humana.",
    mark_as_read: "Marca el hilo como leido quitando la etiqueta UNREAD despues de aprobacion humana.",
    mark_as_unread: "Marca el hilo como no leido agregando la etiqueta UNREAD despues de aprobacion humana.",
    star_thread: "Destaca el hilo con estrella agregando la etiqueta STARRED despues de aprobacion humana.",
    unstar_thread: "Quita la estrella del hilo removiendo la etiqueta STARRED despues de aprobacion humana.",
    remove_label: "Quita un label existente del hilo despues de aprobacion humana.",
    forward_thread: "Reenvía el hilo a uno o más destinatarios nuevos despues de aprobacion humana.",
  };

  return descriptions[action];
}

export function isGmailReadOnlyAction(
  action: GmailToolAction
): action is GmailReadOnlyToolAction {
  return GMAIL_READONLY_TOOL_ACTIONS.includes(action as GmailReadOnlyToolAction);
}

export function isGmailWriteAction(
  action: GmailToolAction
): action is GmailWriteToolAction {
  return GMAIL_WRITE_TOOL_ACTIONS.includes(action as GmailWriteToolAction);
}

export const GMAIL_STANDALONE_ACTIONS = [
  "create_draft_email",
  "send_email",
] as const;

export type GmailStandaloneAction = (typeof GMAIL_STANDALONE_ACTIONS)[number];

export function isGmailStandaloneAction(
  action: string
): action is GmailStandaloneAction {
  return GMAIL_STANDALONE_ACTIONS.includes(action as GmailStandaloneAction);
}

export const GMAIL_THREAD_WRITE_ACTIONS = [
  "create_draft_reply",
  "send_reply",
  "archive_thread",
  "apply_label",
  "mark_as_read",
  "mark_as_unread",
  "star_thread",
  "unstar_thread",
  "remove_label",
  "forward_thread",
] as const;

export type GmailThreadWriteAction = (typeof GMAIL_THREAD_WRITE_ACTIONS)[number];

export function isGmailThreadWriteAction(
  action: string
): action is GmailThreadWriteAction {
  return GMAIL_THREAD_WRITE_ACTIONS.includes(action as GmailThreadWriteAction);
}

export const gmailEditableApprovalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_draft_reply"),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
    ...gmailAttachmentSchema,
  }),
  z.object({
    action: z.literal("send_reply"),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
    ...gmailAttachmentSchema,
  }),
  z.object({
    action: z.literal("create_draft_email"),
    to: z.array(gmailEmailSchema).min(1).max(20),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
    ...gmailAttachmentSchema,
  }),
  z.object({
    action: z.literal("send_email"),
    to: z.array(gmailEmailSchema).min(1).max(20),
    cc: z.array(gmailEmailSchema).max(20).optional(),
    bcc: z.array(gmailEmailSchema).max(20).optional(),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(8000),
    ...gmailAttachmentSchema,
  }),
]);

export function getGoogleCalendarActionLabel(
  action: GoogleCalendarToolAction
): string {
  const labels: Record<GoogleCalendarToolAction, string> = {
    check_availability: "Ver disponibilidad",
    list_events: "Listar eventos",
    get_event_details: "Ver detalle de evento",
    create_event: "Crear evento",
    reschedule_event: "Reprogramar evento",
    cancel_event: "Cancelar evento",
    update_event_details: "Actualizar detalles de evento",
  };

  return labels[action];
}

export function getGoogleCalendarActionDescription(
  action: GoogleCalendarToolAction
): string {
  const descriptions: Record<GoogleCalendarToolAction, string> = {
    check_availability: "Consulta disponibilidad agregada con una sola llamada tipo free/busy.",
    list_events: "Lista eventos compactos en una ventana de tiempo acotada.",
    get_event_details: "Obtiene el detalle completo de un evento incluyendo asistentes, descripcion y ubicacion.",
    create_event: "Crea eventos reales despues de confirmacion conversacional.",
    reschedule_event: "Reprograma eventos existentes despues de confirmacion conversacional.",
    cancel_event: "Cancela eventos reales despues de confirmacion conversacional.",
    update_event_details: "Actualiza titulo, descripcion, ubicacion o asistentes de un evento existente despues de aprobacion humana.",
  };

  return descriptions[action];
}

export function getGoogleSheetsActionLabel(
  action: GoogleSheetsToolAction
): string {
  const labels: Record<GoogleSheetsToolAction, string> = {
    list_sheets: "Listar pestanas",
    read_range: "Leer rango",
    get_spreadsheet: "Ver spreadsheet",
    preview_sheet: "Previsualizar hoja",
    read_table: "Leer tabla",
    get_headers: "Leer encabezados",
    find_rows: "Buscar filas",
    append_rows: "Agregar filas",
    update_range: "Actualizar rango",
    clear_range: "Limpiar rango",
    append_records: "Agregar registros",
    update_rows_by_match: "Actualizar filas por criterio",
    insert_rows: "Insertar filas",
    insert_columns: "Insertar columnas",
    create_sheet: "Crear hoja",
    rename_sheet: "Renombrar hoja",
    duplicate_sheet: "Duplicar hoja",
    format_range: "Formatear rango",
    auto_resize_columns: "Autoajustar columnas",
    freeze_rows: "Congelar filas",
    freeze_columns: "Congelar columnas",
    set_number_format: "Definir formato numerico",
    sort_range: "Ordenar rango",
    set_basic_filter: "Crear filtro basico",
    clear_basic_filter: "Quitar filtro basico",
    set_data_validation: "Definir validacion",
    create_named_range: "Crear rango nombrado",
    protect_range: "Proteger rango",
    create_spreadsheet: "Crear spreadsheet",
    copy_spreadsheet: "Copiar spreadsheet",
    delete_rows: "Eliminar filas",
    delete_columns: "Eliminar columnas",
    delete_sheet: "Eliminar hoja",
  };

  return labels[action];
}

export function getGoogleSheetsActionDescription(
  action: GoogleSheetsToolAction
): string {
  const descriptions: Record<GoogleSheetsToolAction, string> = {
    list_sheets: "Lista las pestanas del spreadsheet indicado por URL o spreadsheetId.",
    read_range: "Lee un rango A1 explicito dentro de una pestana concreta, con maximo 200 filas por request.",
    get_spreadsheet: "Trae metadata general del spreadsheet y capacidades basicas del archivo compartido.",
    preview_sheet: "Muestra una vista previa compacta de una hoja para inspeccion rapida en chat.",
    read_table: "Lee una tabla orientada por encabezados desde una hoja completa o un rango A1 acotado.",
    get_headers: "Devuelve solo los encabezados detectados de una tabla en Google Sheets.",
    find_rows: "Busca filas por igualdad exacta sobre una columna de encabezado.",
    append_rows: "Agrega filas al rango indicado usando USER_ENTERED despues de approval inbox.",
    update_range: "Actualiza un rango A1 explicito usando USER_ENTERED despues de approval inbox.",
    clear_range: "Limpia un rango A1 explicito despues de approval inbox; nunca borra una hoja completa.",
    append_records: "Agrega registros orientados por encabezados despues de approval inbox.",
    update_rows_by_match: "Actualiza filas encontradas por criterio de igualdad despues de approval inbox.",
    insert_rows: "Inserta filas estructurales en la hoja despues de approval inbox.",
    insert_columns: "Inserta columnas estructurales en la hoja despues de approval inbox.",
    create_sheet: "Crea una hoja nueva dentro del spreadsheet despues de approval inbox.",
    rename_sheet: "Renombra una hoja existente despues de approval inbox.",
    duplicate_sheet: "Duplica una hoja existente y opcionalmente le asigna un nuevo nombre.",
    format_range: "Aplica formato visual a un rango explicito despues de approval inbox.",
    auto_resize_columns: "Autoajusta el ancho de columnas de una hoja despues de approval inbox.",
    freeze_rows: "Configura filas congeladas en una hoja despues de approval inbox.",
    freeze_columns: "Configura columnas congeladas en una hoja despues de approval inbox.",
    set_number_format: "Aplica formato numerico tipado a un rango despues de approval inbox.",
    sort_range: "Ordena un rango explicito con uno o varios criterios despues de approval inbox.",
    set_basic_filter: "Activa un filtro basico sobre una hoja o rango despues de approval inbox.",
    clear_basic_filter: "Quita el filtro basico actual despues de approval inbox.",
    set_data_validation: "Define reglas de validacion de datos tipadas despues de approval inbox.",
    create_named_range: "Crea un named range reutilizable despues de approval inbox.",
    protect_range: "Protege un rango con warning o proteccion dura despues de approval inbox.",
    create_spreadsheet: "Crea un spreadsheet nuevo usando la integracion Google compartida.",
    copy_spreadsheet: "Copia un spreadsheet existente usando permisos limitados de drive.file.",
    delete_rows: "Elimina filas encontradas por criterio de tabla despues de approval inbox.",
    delete_columns: "Elimina columnas estructurales despues de approval inbox.",
    delete_sheet: "Elimina una hoja completa despues de approval inbox.",
  };

  return descriptions[action];
}

export function getGoogleDriveActionLabel(
  action: GoogleDriveToolAction
): string {
  const labels: Record<GoogleDriveToolAction, string> = {
    search_files: "Buscar archivos",
    list_folder: "Listar carpeta",
    get_file_metadata: "Ver metadata de archivo",
    get_file_content: "Leer contenido de archivo",
    create_folder: "Crear carpeta",
    move_file: "Mover archivo",
    rename_file: "Renombrar archivo",
    copy_file: "Copiar archivo",
    share_file: "Compartir archivo",
    trash_file: "Enviar archivo a papelera",
    upload_file: "Subir archivo textual",
  };

  return labels[action];
}

export function getGoogleDriveActionDescription(
  action: GoogleDriveToolAction
): string {
  const descriptions: Record<GoogleDriveToolAction, string> = {
    search_files: "Busca archivos y carpetas en Google Drive, con soporte para shared drives cuando corresponda.",
    list_folder: "Lista el contenido directo de una carpeta concreta, incluyendo shared drives si la configuracion lo permite.",
    get_file_metadata: "Obtiene metadata segura de un archivo y expone `spreadsheetId` cuando el archivo es una Google Sheet.",
    get_file_content: "Lee contenido textual seguro o exportable de un archivo con truncado estricto de 500 KB.",
    create_folder: "Crea una carpeta nueva en Google Drive despues de approval inbox.",
    move_file: "Mueve un archivo o carpeta entre ubicaciones permitidas despues de approval inbox y falla cerrado si Google rechaza el scope.",
    rename_file: "Renombra un archivo o carpeta despues de approval inbox dentro de los limites reales de `drive.file`.",
    copy_file: "Copia un archivo permitido y puede ubicar la copia en una carpeta destino despues de approval inbox.",
    share_file: "Comparte un archivo real solo despues de confirmacion humana y falla cerrado ante permisos o scopes insuficientes.",
    trash_file: "Envía un archivo a la papelera solo despues de confirmacion humana y falla cerrado ante permisos o scopes insuficientes.",
    upload_file: "Sube un archivo textual pequeno y seguro, limitado a MIME allowlist y maximo 1 MB, despues de approval inbox.",
  };

  return descriptions[action];
}

export function normalizeGoogleSpreadsheetId(input: {
  spreadsheetId?: string | null;
  spreadsheetUrl?: string | null;
}): string | null {
  const directId = input.spreadsheetId?.trim();
  if (directId) {
    return directId;
  }

  const url = input.spreadsheetUrl?.trim();
  if (!url) {
    return null;
  }

  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}
