import assert from "node:assert/strict";
import {
  buildDynamicFormMarker,
  buildDynamicFormSubmissionMessage,
  buildInteractiveMarkersGuidance,
  parseChoiceChipsMarker,
  parseDynamicFormMarker,
} from "./interactive-markers";

function runChoiceChipsChecks(): void {
  const two = parseChoiceChipsMarker("Cual prefieres?\n[CHOICES:Opcion A|Opcion B]");
  assert.ok(two);
  assert.equal(two.strippedContent, "Cual prefieres?");
  assert.deepEqual(two.choices, ["Opcion A", "Opcion B"]);

  const three = parseChoiceChipsMarker("Elige uno:\n[CHOICES:Rojo|Verde|Azul]");
  assert.ok(three);
  assert.deepEqual(three.choices, ["Rojo", "Verde", "Azul"]);

  const five = parseChoiceChipsMarker("Opciones:\n[CHOICES:A|B|C|D|E]");
  assert.ok(five);
  assert.equal(five.choices.length, 5);

  assert.equal(parseChoiceChipsMarker("Solo una\n[CHOICES:Unica]"), null);
  assert.equal(
    parseChoiceChipsMarker("Demasiadas\n[CHOICES:A|B|C|D|E|F]"),
    null
  );
  assert.equal(parseChoiceChipsMarker("Sin marker"), null);
  assert.equal(
    parseChoiceChipsMarker("Marker al medio [CHOICES:A|B] y texto"),
    null
  );

  const withCrlf = parseChoiceChipsMarker("Texto\r\n[CHOICES:Si|No]");
  assert.ok(withCrlf);
  assert.deepEqual(withCrlf.choices, ["Si", "No"]);

  const caseInsensitive = parseChoiceChipsMarker("Texto\n[choices:A|B]");
  assert.ok(caseInsensitive);
  assert.deepEqual(caseInsensitive.choices, ["A", "B"]);
}

function runDynamicFormChecks(): void {
  const basic = parseDynamicFormMarker(
    "Necesito datos.\n[FORM:Nuevo lead|firstName:text:Nombre|lastName:text:Apellido*|email:email:Email*]"
  );
  assert.ok(basic);
  assert.equal(basic.strippedContent, "Necesito datos.");
  assert.equal(basic.definition.title, "Nuevo lead");
  assert.equal(basic.definition.fields.length, 3);
  assert.equal(basic.definition.fields[0]?.key, "firstName");
  assert.equal(basic.definition.fields[0]?.type, "text");
  assert.equal(basic.definition.fields[0]?.required, false);
  assert.equal(basic.definition.fields[1]?.required, true);
  assert.equal(basic.definition.fields[2]?.type, "email");
  assert.deepEqual(basic.initialValues, {});
  assert.deepEqual(basic.fieldUi, {});

  const withSelect = parseDynamicFormMarker(
    "Completa esto.\n[FORM:Tarea|subject:text:Asunto*|priority:select:Prioridad:Alta,Normal,Baja]"
  );
  assert.ok(withSelect);
  assert.equal(withSelect.definition.fields[1]?.type, "select");
  assert.deepEqual(withSelect.definition.fields[1]?.options, [
    { value: "Alta", label: "Alta" },
    { value: "Normal", label: "Normal" },
    { value: "Baja", label: "Baja" },
  ]);

  const allTypes = parseDynamicFormMarker(
    "Form.\n[FORM:Test|a:text:A|b:email:B|c:tel:C|d:date:D|e:datetime-local:E|f:textarea:F|g:select:G:X,Y]"
  );
  assert.ok(allTypes);
  assert.equal(allTypes.definition.fields.length, 7);

  assert.equal(parseDynamicFormMarker("Sin marker"), null);
  assert.equal(
    parseDynamicFormMarker("Solo titulo\n[FORM:Titulo]"),
    null,
    "Legacy FORM marker sin pipe no debe matchear"
  );
  assert.equal(
    parseDynamicFormMarker("Bad type\n[FORM:T|key:number:Label]"),
    null,
    "Tipo invalido debe retornar null"
  );
  assert.equal(
    parseDynamicFormMarker("No fields\n[FORM:T|]"),
    null,
    "Sin campos validos"
  );

  const legacyMarker = parseDynamicFormMarker(
    "Texto.\n[FORM:salesforce_create_lead]"
  );
  assert.equal(legacyMarker, null, "Legacy marker sin | no matchea");

  const structured = parseDynamicFormMarker(
    `Completa el email.\n${buildDynamicFormMarker({
      definition: {
        title: "Nuevo email",
        fields: [
          { key: "action", type: "text", label: "Action", required: true },
          { key: "to", type: "email", label: "Destinatario", required: true },
          { key: "body", type: "textarea", label: "Mensaje", required: true },
        ],
      },
      initialValues: {
        action: "send_email",
        to: "ana@example.com",
      },
      fieldUi: {
        action: { hidden: true, readOnly: true },
        to: { readOnly: true },
      },
    })}`
  );

  assert.ok(structured);
  assert.equal(structured.definition.title, "Nuevo email");
  assert.equal(structured.initialValues.action, "send_email");
  assert.equal(structured.initialValues.to, "ana@example.com");
  assert.deepEqual(structured.fieldUi.action, { hidden: true, readOnly: true });
  assert.deepEqual(structured.fieldUi.to, { readOnly: true });
}

function runSubmissionChecks(): void {
  const definition = {
    title: "Test",
    fields: [
      { key: "name", type: "text" as const, label: "Name", required: true },
      { key: "email", type: "email" as const, label: "Email", required: false },
      { key: "notes", type: "textarea" as const, label: "Notes", required: false },
      { key: "attachments", type: "file" as const, label: "Attachments", required: false },
    ],
  };

  const message = buildDynamicFormSubmissionMessage(definition, {
    name: "Juan",
    email: "juan@test.com",
    notes: "Linea 1\nLinea 2",
  });

  assert.equal(
    message,
    "name: Juan\nemail: juan@test.com\nnotes: Linea 1\\nLinea 2"
  );

  const withUploadedPaths = buildDynamicFormSubmissionMessage(
    definition,
    {
      name: "Juan",
    },
    {
      attachments: [
        {
          name: "archivo.pdf",
          type: "application/pdf",
          size: 1024,
          base64: "abc",
        },
      ],
    },
    {
      attachments: ["org-1/batch-1/archivo.pdf"],
    }
  );
  assert.equal(
    withUploadedPaths,
    "name: Juan\nattachments: org-1/batch-1/archivo.pdf"
  );

  const emptyFields = buildDynamicFormSubmissionMessage(definition, {
    name: "Solo nombre",
  });
  assert.equal(emptyFields, "name: Solo nombre");
}

function runGuidanceChecks(): void {
  assert.equal(buildInteractiveMarkersGuidance([]), null);

  const guidance = buildInteractiveMarkersGuidance(["salesforce", "gmail"]);
  assert.ok(guidance);
  assert.ok(guidance.includes("salesforce, gmail"));
  assert.ok(guidance.includes("CHOICE CHIPS"));
  assert.ok(guidance.includes("DYNAMIC FORMS"));
  assert.ok(guidance.includes("FORM_DATA"));
  assert.ok(guidance.includes("accion concreta"));
}

function run(): void {
  runChoiceChipsChecks();
  runDynamicFormChecks();
  runSubmissionChecks();
  runGuidanceChecks();
  console.log("interactive-markers checks passed");
}

run();
