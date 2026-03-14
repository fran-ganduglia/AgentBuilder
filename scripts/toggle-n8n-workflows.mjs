import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];

if (mode !== "activate" && mode !== "deactivate") {
  console.error("Uso: node scripts/toggle-n8n-workflows.mjs <activate|deactivate>");
  process.exit(1);
}

const baseUrl = process.env.N8N_BASE_URL;
const apiKey = process.env.N8N_API_KEY;

if (!baseUrl || !apiKey) {
  console.error("Faltan N8N_BASE_URL o N8N_API_KEY en el entorno.");
  process.exit(1);
}

const workflowsDir = path.join(process.cwd(), "n8n", "workflows");
const entries = await readdir(workflowsDir, { withFileTypes: true });
const localWorkflows = [];

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) {
    continue;
  }

  const fullPath = path.join(workflowsDir, entry.name);
  const raw = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw);

  if (typeof parsed.id === "string" && parsed.id.length > 0 && typeof parsed.name === "string") {
    localWorkflows.push({
      id: parsed.id,
      name: parsed.name,
    });
  }
}

const listResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/workflows`, {
  headers: {
    "X-N8N-API-KEY": apiKey,
  },
});

if (!listResponse.ok) {
  console.error(`No se pudo listar workflows de n8n. Status ${listResponse.status}`);
  process.exit(1);
}

const listPayload = await listResponse.json();
const remoteWorkflows = Array.isArray(listPayload)
  ? listPayload
  : Array.isArray(listPayload?.data)
    ? listPayload.data
    : [];

for (const workflow of localWorkflows) {
  const remoteWorkflow = remoteWorkflows.find((candidate) =>
    candidate?.id === workflow.id || candidate?.name === workflow.name
  );

  if (!remoteWorkflow?.id) {
    console.warn(`${mode} ${workflow.name} omitido: no existe en n8n`);
    continue;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/workflows/${remoteWorkflow.id}/${mode}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-N8N-API-KEY": apiKey,
    },
  });

  if (!response.ok) {
    console.error(`${mode} ${workflow.name} (${remoteWorkflow.id}) fallo con status ${response.status}`);
    process.exitCode = 1;
    continue;
  }

  console.log(`${mode} ${workflow.name} (${remoteWorkflow.id}) ok`);
}
