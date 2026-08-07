import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';

export const isNativeMobile = () => Capacitor.isNativePlatform();

function toSafeFilename(filename: string) {
  return filename.replace(/[^a-z0-9._-]+/gi, '_');
}

/** Save text in a browser download, or hand a native file to Android sharing. */
export async function saveTextFile(filename: string, content: string, type = 'text/csv;charset=utf-8;') {
  if (!isNativeMobile()) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const safeFilename = toSafeFilename(filename);
  const result = await Filesystem.writeFile({
    path: safeFilename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  await Share.share({
    title: filename,
    url: result.uri,
    dialogTitle: 'Share exported report',
  });
}

export async function exportPdfFile(filename: string, title: string, lines: string[]) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = 48;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text(title, margin, y);
  y += 26;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 22;
  pdf.setTextColor(30, 30, 30);
  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2) as string[];
    if (y + wrapped.length * 14 > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(wrapped, margin, y);
    y += wrapped.length * 14;
  }
  if (!isNativeMobile()) {
    pdf.save(filename);
    return;
  }
  const data = pdf.output('datauristring').split(',')[1];
  const result = await Filesystem.writeFile({ path: toSafeFilename(filename), data, directory: Directory.Cache, recursive: true });
  await Share.share({ title: filename, url: result.uri, dialogTitle: 'Share PDF report' });
}

export async function shareApp() {
  const url = import.meta.env.VITE_APP_SHARE_URL as string | undefined;
  const message = 'Mathan ERP — standalone Cash Book and Payroll business tools.';
  if (isNativeMobile()) {
    await Share.share({ title: 'Share Mathan ERP', text: message, ...(url ? { url } : {}), dialogTitle: 'Share Mathan ERP' });
    return;
  }
  if (navigator.share) {
    await navigator.share({ title: 'Mathan ERP', text: message, ...(url ? { url } : {}) });
    return;
  }
  await navigator.clipboard?.writeText(url ? `${message}\n${url}` : message);
  window.alert('Sharing is not available here. The app description was copied to your clipboard.');
}

export function printOrExplain() {
  if (isNativeMobile()) {
    window.alert('Printing is not available inside the Android app. Export the report as CSV to share or save it.');
    return;
  }
  window.print();
}
