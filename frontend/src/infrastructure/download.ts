/** Hand a generated file to the browser as a download. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers; one frame
  // is enough for the navigation to have been handed off.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
