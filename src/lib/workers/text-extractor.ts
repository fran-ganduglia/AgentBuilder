import "server-only";

export async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  const normalizedType = fileType.toLowerCase();

  if (
    normalizedType === "txt" ||
    normalizedType === "text/plain" ||
    normalizedType === "csv" ||
    normalizedType === "text/csv" ||
    normalizedType.endsWith(".txt") ||
    normalizedType.endsWith(".csv")
  ) {
    return buffer.toString("utf-8");
  }

  if (normalizedType === "pdf" || normalizedType === "application/pdf" || normalizedType.endsWith(".pdf")) {
    const pdfParseModule = await import("pdf-parse");
    const pdfParseFn = (pdfParseModule as unknown as { default: (data: Buffer) => Promise<{ text: string }> }).default
      ?? (pdfParseModule as unknown as (data: Buffer) => Promise<{ text: string }>);
    const result = await pdfParseFn(buffer);
    return result.text;
  }

  if (
    normalizedType === "docx" ||
    normalizedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedType.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Tipo de archivo no soportado: ${fileType}`);
}