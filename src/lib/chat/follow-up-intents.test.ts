import assert from "node:assert/strict";
import { extractChatFollowUpIntents } from "./follow-up-intents";

function run(): void {
  assert.deepEqual(
    extractChatFollowUpIntents([
      "Queres avanzar con alguna opcion?",
      "",
      "1. Calificar a Francisco",
      "2. Buscar otro lead",
      "3. Crear un nuevo lead",
    ].join("\n")),
    [
      {
        id: "follow-up-1-calificar a francisco",
        label: "Calificar a Francisco",
        prompt: "Calificar a Francisco",
        order: 1,
      },
      {
        id: "follow-up-2-buscar otro lead",
        label: "Buscar otro lead",
        prompt: "Buscar otro lead",
        order: 2,
      },
      {
        id: "follow-up-3-crear un nuevo lead",
        label: "Crear un nuevo lead",
        prompt: "Crear un nuevo lead",
        order: 3,
      },
    ]
  );

  assert.deepEqual(
    extractChatFollowUpIntents([
      "1. Calificar a Francisco",
      "2. Buscar otro lead",
    ].join("\n")),
    [
      {
        id: "follow-up-1-calificar a francisco",
        label: "Calificar a Francisco",
        prompt: "Calificar a Francisco",
        order: 1,
      },
      {
        id: "follow-up-2-buscar otro lead",
        label: "Buscar otro lead",
        prompt: "Buscar otro lead",
        order: 2,
      },
    ]
  );

  assert.deepEqual(
    extractChatFollowUpIntents([
      "2. Buscar otro lead",
      "3. Crear un nuevo lead",
    ].join("\n")),
    []
  );

  assert.deepEqual(
    extractChatFollowUpIntents([
      "- Buscar otro lead",
      "* Crear un nuevo lead",
    ].join("\n")),
    []
  );

  assert.deepEqual(
    extractChatFollowUpIntents(
      "El usuario eligio 1. Buscar otro lead durante la llamada."
    ),
    []
  );

  assert.deepEqual(
    extractChatFollowUpIntents([
      "1.   **Calificar a Francisco**   ",
      "2. Buscar   otro   lead",
    ].join("\n")),
    [
      {
        id: "follow-up-1-calificar a francisco",
        label: "Calificar a Francisco",
        prompt: "Calificar a Francisco",
        order: 1,
      },
      {
        id: "follow-up-2-buscar otro lead",
        label: "Buscar otro lead",
        prompt: "Buscar otro lead",
        order: 2,
      },
    ]
  );

  console.log("follow-up-intents checks passed");
}

run();
