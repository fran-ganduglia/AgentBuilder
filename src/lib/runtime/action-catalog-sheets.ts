import type {
  RuntimeActionDefinitionV1,
} from "./action-catalog";

export const SHEETS_ACTION_CATALOG: Record<string, RuntimeActionDefinitionV1> = {
  read_sheet_range: {
    type: "read_sheet_range",
    approvalMode: "auto",
    sideEffectKind: "read",
    input: {
      minimum: ["sheetRef", "rangeRef"],
      optional: [],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Spreadsheet o sheet a leer.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        rangeRef: {
          key: "rangeRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Rango A1 a leer.",
          resourceFamily: "range",
          criticality: "critical",
        },
      },
    },
    output: {
      summary: "Lectura acotada de un rango de Google Sheets.",
    },
  },
  append_sheet_rows: {
    type: "append_sheet_rows",
    approvalMode: "required",
    sideEffectKind: "write",
    input: {
      minimum: ["sheetRef", "rows"],
      optional: ["rangeRef"],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Spreadsheet o sheet destino.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        rows: {
          key: "rows",
          required: true,
          allowedKinds: ["computed"],
          summary: "Filas a agregar.",
          resourceFamily: "rows",
          criticality: "critical",
        },
        rangeRef: {
          key: "rangeRef",
          required: false,
          allowedKinds: ["reference"],
          summary: "Rango base opcional.",
          resourceFamily: "range",
          criticality: "non_critical",
        },
      },
    },
    output: {
      summary: "Preview y encolado para append de filas en Sheets.",
    },
  },
  update_sheet_range: {
    type: "update_sheet_range",
    approvalMode: "required",
    sideEffectKind: "destructive",
    input: {
      minimum: ["sheetRef", "rangeRef", "rows"],
      optional: [],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Spreadsheet o sheet destino.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        rangeRef: {
          key: "rangeRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Rango A1 a actualizar.",
          resourceFamily: "range",
          criticality: "critical",
        },
        rows: {
          key: "rows",
          required: true,
          allowedKinds: ["computed"],
          summary: "Filas a escribir.",
          resourceFamily: "rows",
          criticality: "critical",
        },
      },
    },
    output: {
      summary: "Preview y encolado para update de rango en Sheets.",
    },
  },
  list_sheets: {
    type: "list_sheets",
    approvalMode: "auto",
    sideEffectKind: "read",
    input: {
      minimum: [],
      optional: ["spreadsheetRef"],
      params: {
        spreadsheetRef: {
          key: "spreadsheetRef",
          required: false,
          allowedKinds: ["reference"],
          summary: "Spreadsheet del que listar las hojas.",
          resourceFamily: "sheet",
          criticality: "non_critical",
        },
      },
    },
    output: {
      summary: "Lista de hojas disponibles en el spreadsheet.",
    },
  },
  find_rows: {
    type: "find_rows",
    approvalMode: "auto",
    sideEffectKind: "read",
    input: {
      minimum: ["sheetRef", "query"],
      optional: ["maxResults"],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Sheet donde buscar.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        query: {
          key: "query",
          required: true,
          allowedKinds: ["primitive"],
          summary: "Termino o filtro de busqueda.",
          resourceFamily: "query",
          criticality: "critical",
        },
        maxResults: {
          key: "maxResults",
          required: false,
          allowedKinds: ["primitive"],
          summary: "Cantidad maxima de filas a devolver.",
          resourceFamily: "limit",
          criticality: "non_critical",
        },
      },
    },
    output: {
      summary: "Filas encontradas en la hoja.",
    },
  },
  append_records: {
    type: "append_records",
    approvalMode: "required",
    sideEffectKind: "write",
    input: {
      minimum: ["sheetRef", "records"],
      optional: [],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Sheet destino.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        records: {
          key: "records",
          required: true,
          allowedKinds: ["computed"],
          summary: "Registros a agregar como filas.",
          resourceFamily: "rows",
          criticality: "critical",
        },
      },
    },
    output: {
      summary: "Registros agregados en la hoja.",
    },
  },
  get_headers: {
    type: "get_headers",
    approvalMode: "auto",
    sideEffectKind: "read",
    input: {
      minimum: ["sheetRef"],
      optional: ["rangeRef"],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Sheet de la que obtener encabezados.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        rangeRef: {
          key: "rangeRef",
          required: false,
          allowedKinds: ["reference"],
          summary: "Rango de encabezados.",
          resourceFamily: "range",
          criticality: "non_critical",
        },
      },
    },
    output: {
      summary: "Encabezados de columnas de la hoja.",
    },
  },
  preview_sheet: {
    type: "preview_sheet",
    approvalMode: "auto",
    sideEffectKind: "read",
    input: {
      minimum: ["sheetRef"],
      optional: ["maxRows"],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Sheet a previsualizar.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        maxRows: {
          key: "maxRows",
          required: false,
          allowedKinds: ["primitive"],
          summary: "Cantidad maxima de filas a incluir.",
          resourceFamily: "limit",
          criticality: "non_critical",
        },
      },
    },
    output: {
      summary: "Preview de las primeras filas de la hoja.",
    },
  },
  clear_range: {
    type: "clear_range",
    approvalMode: "required",
    sideEffectKind: "destructive",
    input: {
      minimum: ["sheetRef", "rangeRef"],
      optional: [],
      params: {
        sheetRef: {
          key: "sheetRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Sheet que contiene el rango.",
          resourceFamily: "sheet",
          criticality: "critical",
        },
        rangeRef: {
          key: "rangeRef",
          required: true,
          allowedKinds: ["reference"],
          summary: "Rango A1 a limpiar.",
          resourceFamily: "range",
          criticality: "critical",
        },
      },
    },
    output: {
      summary: "Rango limpiado en la hoja.",
    },
  },
  create_spreadsheet: {
    type: "create_spreadsheet",
    approvalMode: "required",
    sideEffectKind: "write",
    input: {
      minimum: ["title"],
      optional: [],
      params: {
        title: {
          key: "title",
          required: true,
          allowedKinds: ["primitive"],
          summary: "Titulo del nuevo spreadsheet.",
          resourceFamily: "text",
          criticality: "critical",
        },
      },
    },
    output: {
      summary: "Spreadsheet creado en Google Sheets.",
    },
  },
};
