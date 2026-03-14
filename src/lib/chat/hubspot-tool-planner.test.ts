import assert from "node:assert/strict";

async function run(): Promise<void> {
  const { shouldAllowDuplicateHubSpotContact } = await import(
    new URL("./hubspot-duplicate-guard.ts", import.meta.url).href
  );

  assert.equal(
    shouldAllowDuplicateHubSpotContact(
      "Crea un contacto duplicado en HubSpot con el mismo email de Francisco"
    ),
    true
  );

  assert.equal(
    shouldAllowDuplicateHubSpotContact(
      "Duplica el contacto de Francisco en HubSpot aunque ya exista"
    ),
    true
  );

  assert.equal(
    shouldAllowDuplicateHubSpotContact(
      "Crea un contacto en HubSpot con nombre Francisco Ganduglia y empresa AgentBuilder"
    ),
    false
  );
}

run()
  .then(() => {
    console.log("hubspot-tool-planner checks passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
