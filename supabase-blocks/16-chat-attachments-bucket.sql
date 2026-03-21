-- ============================================================
-- Bloque 16 — Bucket de Storage para adjuntos del chat
-- ============================================================
-- Crea el bucket "chat-attachments" necesario para que la API
-- /api/upload/chat-attachments suba archivos y el runtime de
-- Gmail los descargue al construir el MIME del email.
-- El bucket es privado (public = false). Solo service_role
-- puede subir y descargar.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  5242880, -- 5MB
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;
