import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const srcRoot = path.join(repoRoot, "src");
const serverOnlyStubUrl = pathToFileURL(
  path.join(scriptsDir, "server-only-stub.mjs")
).href;
const candidateExtensions = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"];

function resolveExistingPath(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return pathToFileURL(basePath).href;
  }

  for (const extension of candidateExtensions) {
    const filePath = `${basePath}${extension}`;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return pathToFileURL(filePath).href;
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const extension of candidateExtensions) {
      const indexPath = path.join(basePath, `index${extension}`);
      if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
        return pathToFileURL(indexPath).href;
      }
    }
  }

  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === "server-only") {
    return { url: serverOnlyStubUrl, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const resolved = resolveExistingPath(
      path.join(srcRoot, specifier.slice(2))
    );
    if (resolved) {
      return { url: resolved, shortCircuit: true };
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentPath = fileURLToPath(context.parentURL);
    const resolved = resolveExistingPath(
      path.resolve(path.dirname(parentPath), specifier)
    );
    if (resolved) {
      return { url: resolved, shortCircuit: true };
    }
  }

  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      !path.extname(specifier) &&
      !specifier.startsWith("node:")
    ) {
      return defaultResolve(`${specifier}.js`, context, defaultResolve);
    }

    throw error;
  }
}
