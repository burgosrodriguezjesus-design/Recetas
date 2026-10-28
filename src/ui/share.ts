// Descargar archivos y compartir texto con las capacidades reales del dispositivo.

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Comparte un texto: usa la hoja de compartir del sistema si existe (iPhone, Android),
 * si no copia al portapapeles y, como último recurso, descarga un .txt.
 * Devuelve qué método se ha usado para informar al usuario.
 */
export async function shareText(title: string, text: string): Promise<'share' | 'clipboard' | 'download' | 'cancelled'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'share';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      /* sigue al siguiente método */
    }
  }
  downloadFile(`${title}.txt`, text, 'text/plain;charset=utf-8');
  return 'download';
}
