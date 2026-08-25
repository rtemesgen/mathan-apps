import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { registerPlugin } from '@capacitor/core';
import { jsPDF } from 'jspdf';
import type { ExportMetadata, ExportSummaryItem } from './exports/exportTypes';
import { buildExportMetadataRows } from './exports/exportMetadata';

export const isNativeMobile = () => Capacitor.isNativePlatform();

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
  saveBackup(options: { filename: string; mimeType: string; data: string }): Promise<{ uri?: string }>;
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

/** Save an admin backup in Android/media/<package>/backups on Android. */
export async function saveWorkspaceBackupFile(filename: string, content: string) {
  if (!isNativeMobile()) {
    await saveTextFile(filename, content, 'application/json');
    return;
  }
  await FileSaver.saveBackup({ filename: toSafeFilename(filename), mimeType: 'application/json', data: encodeUtf8(content) });
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
  const columnWidth = width / labels.length;
  pdf.setFillColor(84, 98, 62);
  pdf.setDrawColor(210, 218, 203);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(x, y - 12, width, 38, 4, 4, 'FD');
  labels.forEach((label, index) => {
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    const wrapped = pdf.splitTextToSize(label.toUpperCase(), columnWidth - 12) as string[];
    pdf.text(wrapped.slice(0, 2), x + 8 + index * columnWidth, y + (wrapped.length > 1 ? 1 : 8));
    if (index < labels.length - 1) {
      pdf.setDrawColor(210, 218, 203);
      pdf.line(x + (index + 1) * columnWidth, y - 12, x + (index + 1) * columnWidth, y + 26);
    }
  });
}

export async function exportPdfFile(filename: string, title: string, lines: string[], tableHeaders: string[] = [], metadata?: ExportMetadata, summary: ExportSummaryItem[] = []) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = drawPdfHeader(pdf, title, pageWidth);
  const bodyLines = lines.filter((line) => line.trim());
  const metadataRows = buildExportMetadataRows(metadata).map((row) => [String(row[0]), String(row[1] ?? '')]);

  if (metadataRows.length) {
    metadataRows.forEach((item) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(84, 98, 62);
      pdf.text(`${item[0]}:`, margin, y);
      pdf.setTextColor(31, 36, 31);
      pdf.text(item[1] || '—', margin + 58, y);
      y += 18;
    });
    y += 8;
  }

  if (summary.length) {
    const gap = 6;
    const rowGap = 8;
    const columns = Math.min(summary.length, 6);
    const cardHeight = 46;
    const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
    summary.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (cardWidth + gap);
      const cardY = y + row * (cardHeight + rowGap);
      pdf.setFillColor(item.tone === 'positive' ? 237 : item.tone === 'negative' ? 253 : 246, item.tone === 'positive' ? 250 : item.tone === 'negative' ? 239 : 245, item.tone === 'positive' ? 241 : item.tone === 'negative' ? 239 : 239);
      pdf.setDrawColor(232, 230, 220);
      pdf.roundedRect(x, cardY, cardWidth, cardHeight, 7, 7, 'FD');
      pdf.setTextColor(110, 110, 105);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.5);
      const label = pdf.splitTextToSize(item.label.toUpperCase(), cardWidth - 12).slice(0, 2);
      pdf.text(label, x + 6, cardY + 11);
      pdf.setTextColor(item.tone === 'positive' ? 0 : item.tone === 'negative' ? 185 : 24, item.tone === 'positive' ? 128 : item.tone === 'negative' ? 28 : 24, item.tone === 'positive' ? 90 : item.tone === 'negative' ? 55 : 27);
      pdf.setFontSize(9);
      pdf.text(item.value || '—', x + 6, cardY + 34);
    });
    y += Math.ceil(summary.length / columns) * (cardHeight + rowGap) + 8;
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
    const labels = tableHeaders.length ? tableHeaders : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
    drawPdfTableHeader(pdf, labels.slice(0, columnCount), margin, y, pageWidth - margin * 2);
    y += 38;
  }

  // Keep every body row on the same grid as the header. This is especially
  // important for imported or hand-built lines with an unexpected extra cell.
  const tableColumnCount = firstRow
    ? Math.min(firstRow.split('|').length, tableHeaders.length || firstRow.split('|').length)
    : 1;

  for (const line of rows) {
    const cells = line.split('|').map((cell) => cell.trim());
    const rowHeight = cells.length > 1 ? 40 : 30;
    if (y + rowHeight > pageHeight - 52) {
      pdf.addPage();
      y = drawPdfHeader(pdf, title, pageWidth);
    }
    if (cells.length > 1) {
      const incomeIndex = tableHeaders.findIndex((header) => /cash in|income|credit/i.test(header));
      const expenseIndex = tableHeaders.findIndex((header) => /cash out|expense|debit/i.test(header));
      const typeIndex = tableHeaders.findIndex((header) => /type|entry/i.test(header));
      const amountIndex = tableHeaders.findIndex((header) => /^amount$/i.test(header));
      const typeValue = typeIndex >= 0 ? cells[typeIndex].toLowerCase() : '';
      const isIncome = (incomeIndex >= 0 && Boolean(cells[incomeIndex])) || /income|cash in|credit|inflow|capital injection/.test(typeValue);
      const isExpense = (expenseIndex >= 0 && Boolean(cells[expenseIndex])) || /expense|cash out|debit|outflow|withdraw|repay|loan|bill/.test(typeValue);
      pdf.setFillColor(isIncome ? 239 : isExpense ? 255 : (Math.round(y / rowHeight) % 2 === 0 ? 250 : 246), isIncome ? 249 : isExpense ? 242 : 249, isIncome ? 242 : isExpense ? 242 : 244);
      pdf.setDrawColor(218, 224, 214);
      pdf.setLineWidth(0.6);
      pdf.roundedRect(margin, y - 12, pageWidth - margin * 2, rowHeight, 4, 4, 'FD');
      const visibleColumnCount = tableColumnCount;
      const columnWidth = (pageWidth - margin * 2) / visibleColumnCount;
      cells.slice(0, visibleColumnCount).forEach((cell, index) => {
        const isBalance = cell.toLowerCase().includes('balance') || (index === cells.length - 1 && cells.length >= 4);
        const isIncomeCell = (index === incomeIndex && Boolean(cell)) || (index === typeIndex && isIncome) || (index === amountIndex && isIncome);
        const isExpenseCell = (index === expenseIndex && Boolean(cell)) || (index === typeIndex && isExpense) || (index === amountIndex && isExpense);
        pdf.setTextColor(isIncomeCell ? 0 : isExpenseCell ? 190 : isBalance ? 84 : index === 0 ? 45 : 55, isIncomeCell ? 128 : isExpenseCell ? 32 : isBalance ? 98 : index === 0 ? 45 : 55, isIncomeCell ? 90 : isExpenseCell ? 45 : isBalance ? 62 : index === 0 ? 45 : 55);
        pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
        pdf.setFontSize(11);
        if (index < visibleColumnCount - 1) {
          pdf.setDrawColor(225, 230, 222);
          pdf.line(margin + (index + 1) * columnWidth, y - 12, margin + (index + 1) * columnWidth, y + rowHeight - 12);
        }
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
