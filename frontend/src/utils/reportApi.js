import { buildApiUrl, buildAuthHeaders, readHttpError } from './api';

export function reportHtmlUrl(requestId) {
  return buildApiUrl(`/analysis/jobs/${encodeURIComponent(requestId)}/report.html`);
}

export function reportPdfUrl(requestId) {
  return buildApiUrl(`/analysis/jobs/${encodeURIComponent(requestId)}/report.pdf`);
}

function filenameFromContentDisposition(headerValue) {
  if (!headerValue) return null;

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = headerValue.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] || null;
}

export async function downloadAnalysisPdf(requestId) {
  const response = await fetch(reportPdfUrl(requestId), {
    method: 'GET',
    headers: {
      ...buildAuthHeaders(),
      Accept: 'application/pdf',
    },
  });

  if (!response.ok) {
    throw new Error(await readHttpError(response));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const filename =
    filenameFromContentDisposition(response.headers.get('Content-Disposition')) ||
    `TradingAgent_${requestId}.pdf`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
