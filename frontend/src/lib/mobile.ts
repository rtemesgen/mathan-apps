import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import { registerPlugin } from '@capacitor/core';
import { jsPDF } from 'jspdf';

export const isNativeMobile = () => Capacitor.isNativePlatform();

export function showAppToast(message: string) {
  if (isNativeMobile()) {
    void Toast.show({ text: message, duration: 'short' });
    return;
  }
  window.dispatchEvent(new CustomEvent('mathan:toast', { detail: message }));
}

const LATEST_RELEASE_APK_URL = 'https://github.com/rtemesgen/mathan-apps/releases/latest/download/app-release.apk';

/** Resolve the current APK asset so shared links start the download directly. */
export async function getLatestAppDownloadUrl() {
  try {
    const response = await fetch('https://api.github.com/repos/rtemesgen/mathan-apps/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (response.ok) {
      const release = await response.json() as { assets?: Array<{ name?: string; browser_download_url?: string }> };
      const apk = release.assets?.find((asset) => asset.name?.toLowerCase() === 'app-release.apk' || asset.name?.toLowerCase().endsWith('.apk'));
      if (apk?.browser_download_url) return apk.browser_download_url;
    }
  } catch {
    // Use GitHub's stable latest-release redirect below when the API is unavailable.
  }
  const configuredUrl = (import.meta.env.VITE_APP_SHARE_URL as string | undefined)?.trim();
  return configuredUrl && (configuredUrl.toLowerCase().includes('.apk') || configuredUrl.includes('/releases/latest/download/')) ? configuredUrl : LATEST_RELEASE_APK_URL;
}
const FileSaver = registerPlugin<{
  saveAndOpen(options: { filename: string; mimeType: string; data: string }): Promise<void>;
  save(options: { filename: string; mimeType: string; data: string }): Promise<{ uri?: string }>;
}>('FileSaver');

function toSafeFilename(filename: string) {
  return filename.replace(/[^a-z0-9._-]+/gi, '_');
}

function encodeUtf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
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

  await FileSaver.saveAndOpen({ filename: toSafeFilename(filename), mimeType: type, data: encodeUtf8(content) });
}

export async function saveBinaryFile(filename: string, mimeType: string, bytes: Uint8Array) {
  if (!isNativeMobile()) {
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = toSafeFilename(filename); link.style.visibility = 'hidden';
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    return;
  }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  await FileSaver.save({ filename: toSafeFilename(filename), mimeType, data: btoa(binary) });
}

function drawPdfLogo(pdf: jsPDF, x: number, y: number, size = 32) {
  pdf.setFillColor(24, 24, 27);
  pdf.roundedRect(x, y, size, size, 7, 7, 'F');
  pdf.setTextColor(255, 249, 233);
  pdf.setFont('helvetica', 'bolditalic');
  pdf.setFontSize(size * 0.55);
  pdf.text('M', x + size * 0.19, y + size * 0.68);
  pdf.setFillColor(242, 200, 111);
  pdf.circle(x + size * 0.78, y + size * 0.22, size * 0.07, 'F');
}

function drawPdfHeader(pdf: jsPDF, title: string, pageWidth: number) {
  pdf.setFillColor(24, 24, 27);
  pdf.rect(0, 0, pageWidth, 88, 'F');
  drawPdfLogo(pdf, 40, 20, 42);
  pdf.setTextColor(255, 249, 233);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('MATHAN ERP', 94, 29);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(title, 94, 51);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(201, 201, 201);
  pdf.text('Business apps · Official report', 94, 68);
  pdf.setDrawColor(242, 200, 111);
  pdf.setLineWidth(2);
  pdf.line(40, 81, pageWidth - 40, 81);
  return 116;
}

function drawPdfFooter(pdf: jsPDF, page: number, total: number, pageWidth: number, pageHeight: number) {
  pdf.setDrawColor(225, 222, 211);
  pdf.setLineWidth(0.5);
  pdf.line(40, pageHeight - 35, pageWidth - 40, pageHeight - 35);
  pdf.setTextColor(130, 130, 130);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text('Mathan ERP · Confidential business record', 40, pageHeight - 20);
  pdf.text(`Page ${page} of ${total}`, pageWidth - 40, pageHeight - 20, { align: 'right' });
}

function drawPdfTableHeader(pdf: jsPDF, labels: string[], x: number, y: number, width: number) {
  const columnWidth = (width - 16) / labels.length;
  pdf.setFillColor(84, 98, 62);
  pdf.roundedRect(x, y - 12, width, 25, 4, 4, 'F');
  labels.forEach((label, index) => {
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text(label.toUpperCase(), x + 8 + index * columnWidth, y + 3);
  });
}

export async function exportPdfFile(filename: string, title: string, lines: string[]) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = drawPdfHeader(pdf, title, pageWidth);
  const separatorIndex = lines.findIndex((line) => !line.trim());
  const summaryLines = lines.slice(0, separatorIndex >= 0 ? separatorIndex : Math.min(lines.length, 4));
  const bodyLines = separatorIndex >= 0 ? lines.slice(separatorIndex + 1) : lines.slice(summaryLines.length);
  const summary = summaryLines
    .filter((line) => line.includes(':'))
    .map((line) => {
      const splitAt = line.indexOf(':');
      return { label: line.slice(0, splitAt).trim(), value: line.slice(splitAt + 1).trim() };
    })
    .slice(0, 4);

  if (summary.length) {
    const gap = 10;
    const cardWidth = (pageWidth - margin * 2 - gap * (summary.length - 1)) / summary.length;
    summary.forEach((item, index) => {
      const x = margin + index * (cardWidth + gap);
      pdf.setFillColor(246, 245, 239);
      pdf.setDrawColor(232, 230, 220);
      pdf.roundedRect(x, y, cardWidth, 62, 8, 8, 'FD');
      pdf.setTextColor(110, 110, 105);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(item.label.toUpperCase(), x + 9, y + 16);
      pdf.setTextColor(24, 24, 27);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      const value = pdf.splitTextToSize(item.value || '—', cardWidth - 18) as string[];
      pdf.text(value.slice(0, 2), x + 9, y + 37);
    });
    y += 86;
  }

  pdf.setTextColor(84, 98, 62);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('REPORT DETAILS', margin, y);
  y += 16;
  pdf.setDrawColor(242, 200, 111);
  pdf.setLineWidth(1.5);
  pdf.line(margin, y, margin + 34, y);
  y += 12;

  const rows = bodyLines.filter((value) => value.trim());
  const firstRow = rows.find((line) => line.includes('|'));
  if (firstRow) {
    const columnCount = firstRow.split('|').length;
    const labels = title.toLowerCase().includes('cash book')
      ? ['Date & Time', 'Type', 'Amount', 'Remark', 'Category', 'Payment']
      : title.toLowerCase().includes('transaction')
      ? ['Date', 'Employee', 'Amount', 'Notes']
      : columnCount >= 7
        ? ['Employee', 'Start Date', 'Monthly Rate', 'Daily Rate', 'Earned', 'Paid', 'Balance']
        : columnCount >= 5
          ? ['Employee', 'Department', 'Earned', 'Paid', 'Balance']
        : ['Date', 'Amount', 'Notes'];
    drawPdfTableHeader(pdf, labels.slice(0, columnCount), margin, y, pageWidth - margin * 2);
    y += 28;
  }

  // Keep every body row on the same grid as the header. This is especially
  // important for imported or hand-built lines with an unexpected extra cell.
  const tableColumnCount = firstRow
    ? (title.toLowerCase().includes('cash book') ? 6 : Math.min(firstRow.split('|').length, 7))
    : 1;

  for (const line of rows) {
    const cells = line.split('|').map((cell) => cell.trim());
    const rowHeight = cells.length > 1 ? 30 : 22;
    if (y + rowHeight > pageHeight - 52) {
      pdf.addPage();
      y = drawPdfHeader(pdf, title, pageWidth);
    }
    if (cells.length > 1) {
      pdf.setFillColor((Math.round(y / rowHeight) % 2 === 0) ? 250 : 246, 249, 244);
      pdf.roundedRect(margin, y - 12, pageWidth - margin * 2, rowHeight, 4, 4, 'F');
      const visibleColumnCount = tableColumnCount;
      const columnWidth = (pageWidth - margin * 2 - 16) / visibleColumnCount;
      cells.slice(0, visibleColumnCount).forEach((cell, index) => {
        const isBalance = cell.toLowerCase().includes('balance') || (index === cells.length - 1 && cells.length >= 4);
        pdf.setTextColor(isBalance ? 84 : index === 0 ? 45 : 85, isBalance ? 98 : index === 0 ? 45 : 85, isBalance ? 62 : index === 0 ? 45 : 85);
        pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
        pdf.setFontSize(visibleColumnCount >= 7 ? 7 : 8);
        const wrapped = pdf.splitTextToSize(cell, columnWidth - 8) as string[];
        pdf.text(wrapped.slice(0, 2), margin + 8 + index * columnWidth, y + 2);
      });
    } else {
      pdf.setTextColor(55, 55, 55);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2) as string[];
      pdf.text(wrapped, margin, y);
      y += (wrapped.length - 1) * 12;
    }
    y += rowHeight;
  }

  if (!rows.length) {
    pdf.setFillColor(246, 245, 239);
    pdf.setDrawColor(232, 230, 220);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 64, 8, 8, 'FD');
    pdf.setTextColor(100, 100, 95);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('No records found for this report.', margin + 16, y + 36);
  }

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    drawPdfFooter(pdf, page, totalPages, pageWidth, pageHeight);
  }
  if (!isNativeMobile()) {
    pdf.save(filename);
    return;
  }
  const data = pdf.output('datauristring').split(',')[1];
  await FileSaver.saveAndOpen({ filename: toSafeFilename(filename), mimeType: 'application/pdf', data });
}

export async function shareApp() {
  const url = await getLatestAppDownloadUrl();
  const message = 'Download Mathan ERP directly — Cash Book, Payroll, and Truck Equity business tools.';
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

export async function shareInvite(link: string, email: string) {
  const text = `You’ve been invited to join a company on Mathan ERP${email ? ` (${email})` : ''}. Open this link to accept the invitation:`;
  if (isNativeMobile()) {
    await Share.share({ title: 'Company invitation', text: `${text}\n${link}`, url: link, dialogTitle: 'Share company invitation' });
    return;
  }
  if (navigator.share) {
    await navigator.share({ title: 'Company invitation', text, url: link });
    return;
  }
  await navigator.clipboard?.writeText(`${text}\n${link}`);
  window.alert('Sharing is not available here. The invitation was copied to your clipboard.');
}

export function printOrExplain() {
  if (isNativeMobile()) {
    window.alert('Printing is not available inside the Android app. Export the report as CSV to share or save it.');
    return;
  }
  window.print();
}
