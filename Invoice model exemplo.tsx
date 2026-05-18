import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Trash2, Upload, X } from "lucide-react";

import { cashFlowService } from "../services/cashflow";

type InvoiceModalProps = {
  open: boolean;
  sourceLabel: string;
  defaultDescription: string;
  onClose: () => void;
  onCreated?: (message: string) => void;
};

type InvoiceItem = {
  id: string;
  date: string;
  description: string;
  qty: string;
  rate: string;
};

type MediaKind = "image" | "pdf" | "file";

type PreparedInvoiceItem = {
  id: string;
  dateLabel: string;
  description: string;
  qtyNumber: number;
  rateNumber: number;
  totalNumber: number;
  qtyLabel: string;
  rateLabel: string;
  amountLabel: string;
};

type InvoiceDocumentData = {
  invoiceNumber: string;
  issuedDate: string;
  dueDate: string;
  terms: string;
  invoiceToLines: string[];
  flatLabel: string;
  totalValue: number;
  totalLabel: string;
  items: PreparedInvoiceItem[];
  bankDetails: Array<{ label: string; value: string }>;
};

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const localDate =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(year, month - 1, day)
      : new Date(value);

  return new Intl.DateTimeFormat("en-GB", { dateStyle: "short" }).format(localDate);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatSingleFlatLabel(value: string) {
  const flatValue = value.trim();
  if (!flatValue) return "";
  return /^flat\s+/i.test(flatValue) ? flatValue : `Flat ${flatValue}`;
}

function formatFlatLabels(values: string[]) {
  if (!values.length) return "Flat / client";
  return values.map(formatSingleFlatLabel).join(", ");
}

function formatInvoiceNumber(paymentNumber: number) {
  return `Inv-${String(paymentNumber).padStart(4, "0")}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.readAsDataURL(file);
  });
}

function getMediaKind(file: File): MediaKind {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(name)) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "file";
}

function splitMultiline(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getItemTotal(item: InvoiceItem) {
  return normalizeNumber(item.qty) * normalizeNumber(item.rate);
}

function newInvoiceItem(date = toDateInputValue(new Date()), description = ""): InvoiceItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date,
    description,
    qty: "",
    rate: "",
  };
}

function buildInvoiceDocumentData(params: {
  invoiceDate: string;
  invoiceNumber: string;
  to: string;
  flat: string[];
  items: InvoiceItem[];
  totalValue: number;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  reference: string;
}) {
  const fallbackDate = params.invoiceDate || toDateInputValue(new Date());
  const flatLabel = formatFlatLabels(params.flat);
  const toLines = splitMultiline(params.to);
  const invoiceToLines = toLines.length ? [...toLines, ...(params.flat.length ? [flatLabel] : [])] : [flatLabel];

  const items: PreparedInvoiceItem[] = params.items.map((item) => {
    const qtyNumber = normalizeNumber(item.qty);
    const rateNumber = normalizeNumber(item.rate);
    const totalNumber = qtyNumber * rateNumber;

    return {
      id: item.id,
      dateLabel: formatDisplayDate(item.date || fallbackDate),
      description: item.description.trim(),
      qtyNumber,
      rateNumber,
      totalNumber,
      qtyLabel: formatQuantity(qtyNumber),
      rateLabel: formatCurrency(rateNumber),
      amountLabel: formatCurrency(totalNumber),
    };
  });

  const bankDetails = [
    { label: "Account name", value: params.accountName.trim() || "—" },
    { label: "Sort code", value: params.sortCode.trim() || "—" },
    { label: "Account number", value: params.accountNumber.trim() || "—" },
    { label: "Reference", value: params.reference.trim() || "—" },
  ];

  const formattedDate = formatDisplayDate(fallbackDate);

  return {
    invoiceNumber: params.invoiceNumber.trim() || "Inv-0000",
    issuedDate: formattedDate,
    dueDate: formattedDate,
    terms: "Due on receipt",
    invoiceToLines,
    flatLabel,
    totalValue: params.totalValue,
    totalLabel: formatCurrency(params.totalValue),
    items,
    bankDetails,
  } satisfies InvoiceDocumentData;
}

function buildPreviewHtml(params: {
  documentData: InvoiceDocumentData;
  mediaPreviewUrl: string | null;
  mediaPreviewKind: MediaKind;
  mediaFileName: string | null;
}) {
  const { documentData, mediaPreviewUrl, mediaPreviewKind, mediaFileName } = params;
  const tableRows = documentData.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.dateLabel)}</td>
          <td>${item.description ? escapeHtml(item.description) : "&nbsp;"}</td>
          <td class="num">${escapeHtml(item.qtyLabel)}</td>
          <td class="num">${escapeHtml(item.rateLabel)}</td>
          <td class="num">${escapeHtml(item.amountLabel)}</td>
        </tr>
      `
    )
    .join("");

  const bankDetailsMarkup = documentData.bankDetails
    .map(
      (detail) => `
        <div class="bank-row">
          <span class="bank-label">${escapeHtml(detail.label)}</span>
          <span class="bank-value">${escapeHtml(detail.value)}</span>
        </div>
      `
    )
    .join("");

  const mediaMarkup =
    mediaPreviewUrl && mediaPreviewKind === "image"
      ? `<img src="${escapeHtml(mediaPreviewUrl)}" alt="Invoice media" />`
      : mediaPreviewUrl && mediaPreviewKind === "pdf"
        ? `<object data="${escapeHtml(mediaPreviewUrl)}" type="application/pdf" aria-label="Invoice media PDF"><div class="media-note">PDF attached<br />${escapeHtml(mediaFileName ?? "attachment.pdf")}</div></object>`
        : mediaPreviewUrl
          ? `<div class="media-note">File attached<br />${escapeHtml(mediaFileName ?? "attachment")}</div>`
          : `<div class="media-placeholder">Media area<br />Attach image or PDF</div>`;

  const invoiceToMarkup = documentData.invoiceToLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(documentData.invoiceNumber)}</title>
  <style>
    :root {
      color-scheme: light;
      --accent: #2563a6;
      --accent-dark: #1f4e86;
      --line: #d8e1ea;
      --text: #0f1720;
      --muted: #5a6776;
      --panel: #f5f8fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f1f5f9;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--text);
    }
    .page {
      max-width: 980px;
      min-height: 100vh;
      margin: 0 auto;
      background: #fff;
      padding: 34px 36px 30px;
    }
    .top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 250px;
      gap: 28px;
      align-items: start;
    }
    .invoice-to-label {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .invoice-to-body {
      min-height: 108px;
      font-size: 14px;
      line-height: 1.6;
      white-space: normal;
    }
    .meta-stack {
      display: grid;
      gap: 10px;
    }
    .meta-box,
    .meta-split {
      border-radius: 2px;
      overflow: hidden;
    }
    .meta-box {
      background: var(--accent);
      color: #fff;
      padding: 12px 14px;
    }
    .meta-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--accent);
      color: #fff;
    }
    .meta-split > div {
      padding: 12px 14px;
    }
    .meta-split > div + div {
      border-left: 1px solid rgba(255, 255, 255, 0.22);
    }
    .meta-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      margin-bottom: 6px;
      text-transform: uppercase;
      opacity: 0.88;
    }
    .meta-value {
      display: block;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.25;
    }
    .top-rule {
      height: 4px;
      margin: 22px 0 22px;
      background: var(--accent);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 13px;
    }
    thead th {
      background: var(--accent);
      color: #fff;
      text-align: left;
      padding: 12px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    tbody td {
      border-bottom: 1px solid var(--line);
      padding: 12px 10px;
      vertical-align: top;
      color: var(--text);
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .total-due {
      margin: 18px 0 18px auto;
      width: 240px;
      border: 1px solid var(--line);
      border-top: 4px solid var(--accent);
      padding: 14px 16px;
      background: var(--panel);
    }
    .total-due-label {
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .total-due-value {
      margin-top: 8px;
      font-size: 28px;
      font-weight: 800;
      text-align: right;
    }
    .bottom {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      align-items: stretch;
    }
    .bottom-box {
      min-height: 170px;
      border: 1px solid var(--line);
      background: #fff;
    }
    .bank-box {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 18px;
      background: var(--panel);
      text-align: center;
    }
    .bank-title {
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      margin-bottom: 14px;
      text-transform: uppercase;
    }
    .bank-row + .bank-row {
      margin-top: 8px;
    }
    .bank-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .bank-value {
      display: block;
      margin-top: 4px;
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      overflow-wrap: anywhere;
    }
    .media-box {
      display: grid;
      place-items: center;
      padding: 10px;
      background: #fbfdff;
      overflow: hidden;
    }
    .media-box img,
    .media-box object {
      width: 100%;
      height: 100%;
      min-height: 148px;
      object-fit: contain;
      border: 0;
      background: #fff;
    }
    .media-placeholder,
    .media-note {
      text-align: center;
      font-size: 13px;
      line-height: 1.5;
      font-weight: 600;
      color: var(--muted);
      padding: 14px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div>
        <div class="invoice-to-label">Invoice To</div>
        <div class="invoice-to-body">${invoiceToMarkup}</div>
      </div>

      <div class="meta-stack">
        <div class="meta-box">
          <span class="meta-label">Invoice</span>
          <span class="meta-value">${escapeHtml(documentData.invoiceNumber)}</span>
        </div>
        <div class="meta-split">
          <div>
            <span class="meta-label">Date</span>
            <span class="meta-value">${escapeHtml(documentData.issuedDate)}</span>
          </div>
          <div>
            <span class="meta-label">Terms</span>
            <span class="meta-value">${escapeHtml(documentData.terms)}</span>
          </div>
        </div>
        <div class="meta-box">
          <span class="meta-label">Due Date</span>
          <span class="meta-value">${escapeHtml(documentData.dueDate)}</span>
        </div>
      </div>
    </div>

    <div class="top-rule"></div>

    <table>
      <colgroup>
        <col style="width: 16%" />
        <col style="width: 44%" />
        <col style="width: 10%" />
        <col style="width: 15%" />
        <col style="width: 15%" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Rate</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div class="total-due">
      <div class="total-due-label">Total Due</div>
      <div class="total-due-value">${escapeHtml(documentData.totalLabel)}</div>
    </div>

    <div class="bottom">
      <div class="bottom-box bank-box">
        <div class="bank-title">Bank Details</div>
        ${bankDetailsMarkup}
      </div>
      <div class="bottom-box media-box">
        ${mediaMarkup}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function InvoiceModal({ open, sourceLabel, defaultDescription, onClose, onCreated }: InvoiceModalProps) {
  const [invoiceDate, setInvoiceDate] = useState(() => toDateInputValue(new Date()));
  const [to, setTo] = useState("");
  const [flat, setFlat] = useState<string[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>(() => [newInvoiceItem(toDateInputValue(new Date()), defaultDescription)]);
  const [accountName, setAccountName] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [reference, setReference] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaPreviewKind, setMediaPreviewKind] = useState<MediaKind>("file");
  const [invoiceNumber, setInvoiceNumber] = useState("Inv-0001");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const flatOptions = ["50", "51", "52"];

  function toggleFlat(value: string, checked: boolean) {
    setFlat((current) =>
      checked ? (current.includes(value) ? current : [...current, value]) : current.filter((item) => item !== value)
    );
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const nextDate = toDateInputValue(new Date());
    setInvoiceDate(nextDate);
    setTo("");
    setFlat([]);
    setItems([newInvoiceItem(nextDate, defaultDescription)]);
    setAccountName("");
    setSortCode("");
    setAccountNumber("");
    setReference("");
    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaPreviewKind("file");
    setInvoiceNumber("Inv-0001");
    setError(null);
    setSaving(false);

    void cashFlowService
      .getNextPaymentNumber()
      .then((nextPaymentNumber) => {
        if (cancelled) return;
        setInvoiceNumber(formatInvoiceNumber(nextPaymentNumber));
      })
      .catch(() => {
        if (cancelled) return;
        setInvoiceNumber("Inv-0001");
      });

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [defaultDescription, onClose, open]);

  const totalValue = useMemo(() => items.reduce((sum, item) => sum + getItemTotal(item), 0), [items]);

  const documentData = useMemo(
    () =>
      buildInvoiceDocumentData({
        invoiceDate,
        invoiceNumber,
        to,
        flat,
        items,
        totalValue,
        accountName,
        sortCode,
        accountNumber,
        reference,
      }),
    [accountName, accountNumber, flat, invoiceDate, invoiceNumber, items, reference, sortCode, to, totalValue]
  );

  const previewHtml = useMemo(
    () =>
      buildPreviewHtml({
        documentData,
        mediaPreviewUrl,
        mediaPreviewKind,
        mediaFileName: mediaFile?.name ?? null,
      }),
    [documentData, mediaFile?.name, mediaPreviewKind, mediaPreviewUrl]
  );

  function addItem() {
    setItems((current) => [...current, newInvoiceItem(invoiceDate || toDateInputValue(new Date()))]);
  }

  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    setItems((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));
  }

  function handleMediaChange(file: File | null) {
    setMediaFile(file);
    setMediaPreviewUrl(null);
    setMediaPreviewKind(file ? getMediaKind(file) : "file");
    setError(null);

    if (!file) return;

    void fileToDataUrl(file)
      .then((dataUrl) => {
        setMediaPreviewUrl(dataUrl);
      })
      .catch(() => {
        setMediaPreviewUrl(null);
        setError("Unable to preview selected media.");
      });
  }

  async function handleDownload() {
    const { jsPDF } = await import("jspdf");

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 42;
    const rightEdge = pageWidth - margin;
    const contentWidth = pageWidth - margin * 2;
    const accent = [37, 99, 166] as const;
    const accentDark = [29, 78, 137] as const;
    const lineColor = [216, 225, 234] as const;
    const panelColor = [245, 248, 251] as const;
    let y = 46;

    const metaWidth = 232;
    const metaX = rightEdge - metaWidth;
    const metaGap = 10;
    const metaHeight = 40;
    const splitHeight = 40;

    function drawMetaBox(x: number, top: number, width: number, height: number, label: string, value: string) {
      pdf.setFillColor(...accent);
      pdf.rect(x, top, width, height, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.text(label.toUpperCase(), x + 12, top + 13);
      pdf.setFontSize(12);
      pdf.text(String(value), x + 12, top + 28);
    }

    function drawSplitMetaBox(
      x: number,
      top: number,
      width: number,
      height: number,
      leftLabel: string,
      leftValue: string,
      rightLabel: string,
      rightValue: string
    ) {
      const half = width / 2;

      pdf.setFillColor(...accent);
      pdf.rect(x, top, width, height, "F");
      pdf.setDrawColor(255, 255, 255);
      pdf.line(x + half, top, x + half, top + height);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.text(leftLabel.toUpperCase(), x + 12, top + 13);
      pdf.text(rightLabel.toUpperCase(), x + half + 12, top + 13);
      pdf.setFontSize(11);
      pdf.text(String(leftValue), x + 12, top + 28);
      pdf.text(String(rightValue), x + half + 12, top + 28);
    }

    pdf.setTextColor(...accent);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("INVOICE TO", margin, y + 10);

    pdf.setTextColor(15, 23, 32);
    pdf.setFontSize(12);
    const invoiceToText = documentData.invoiceToLines.join("\n");
    const invoiceToLines = pdf.splitTextToSize(invoiceToText, contentWidth - metaWidth - 36);
    pdf.setFont("helvetica", "normal");
    pdf.text(invoiceToLines, margin, y + 30);

    drawMetaBox(metaX, y, metaWidth, metaHeight, "Invoice", documentData.invoiceNumber);
    drawSplitMetaBox(
      metaX,
      y + metaHeight + metaGap,
      metaWidth,
      splitHeight,
      "Date",
      documentData.issuedDate,
      "Terms",
      documentData.terms
    );
    drawMetaBox(metaX, y + metaHeight + metaGap + splitHeight + metaGap, metaWidth, metaHeight, "Due date", documentData.dueDate);

    const topBlockHeight = Math.max(invoiceToLines.length * 15 + 26, metaHeight + splitHeight + metaHeight + metaGap * 2);
    y += topBlockHeight + 18;

    pdf.setDrawColor(...accent);
    pdf.setLineWidth(3);
    pdf.line(margin, y, rightEdge, y);
    pdf.setLineWidth(1);
    y += 18;

    const tableHeaders = ["DATE", "DESCRIPTION", "QTY", "RATE", "AMOUNT"];
    const columnWidths = [78, 205, 48, 80, contentWidth - 78 - 205 - 48 - 80];
    const headerHeight = 32;
    const rowLineHeight = 13;

    function drawTableHeader(top: number) {
      let x = margin;

      pdf.setFillColor(...accentDark);
      pdf.rect(margin, top, contentWidth, headerHeight, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);

      tableHeaders.forEach((header, index) => {
        const isNumeric = index >= 2;
        pdf.text(header, isNumeric ? x + columnWidths[index] - 8 : x + 8, top + 20, {
          align: isNumeric ? "right" : "left",
        });
        x += columnWidths[index];
      });
    }

    function ensureSpace(requiredHeight: number, repeatHeader = false) {
      if (y + requiredHeight <= pageHeight - margin) return;
      pdf.addPage();
      y = margin;
      if (repeatHeader) {
        drawTableHeader(y);
        y += headerHeight;
      }
    }

    drawTableHeader(y);
    y += headerHeight;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(15, 23, 32);
    pdf.setDrawColor(...lineColor);

    documentData.items.forEach((item) => {
      const descriptionLines = pdf.splitTextToSize(item.description || " ", columnWidths[1] - 16);
      const rowHeight = Math.max(30, descriptionLines.length * rowLineHeight + 12);

      ensureSpace(rowHeight, true);

      let x = margin;

      pdf.rect(margin, y, contentWidth, rowHeight);
      for (let index = 0; index < columnWidths.length - 1; index += 1) {
        x += columnWidths[index];
        pdf.line(x, y, x, y + rowHeight);
      }

      x = margin;
      pdf.text(String(item.dateLabel), x + 8, y + 18);
      x += columnWidths[0];

      pdf.text(descriptionLines, x + 8, y + 18);
      x += columnWidths[1];

      pdf.text(String(item.qtyLabel), x + columnWidths[2] - 8, y + 18, { align: "right" });
      x += columnWidths[2];

      pdf.text(String(item.rateLabel), x + columnWidths[3] - 8, y + 18, { align: "right" });
      x += columnWidths[3];

      pdf.text(String(item.amountLabel), x + columnWidths[4] - 8, y + 18, { align: "right" });
      y += rowHeight;
    });

    ensureSpace(90);

    const totalBoxWidth = 218;
    const totalBoxHeight = 58;
    const totalX = rightEdge - totalBoxWidth;

    y += 18;
    pdf.setFillColor(...panelColor);
    pdf.setDrawColor(...lineColor);
    pdf.rect(totalX, y, totalBoxWidth, totalBoxHeight, "FD");
    pdf.setFillColor(...accent);
    pdf.rect(totalX, y, totalBoxWidth, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...accentDark);
    pdf.text("TOTAL DUE", totalX + 14, y + 22);
    pdf.setFontSize(22);
    pdf.setTextColor(15, 23, 32);
    pdf.text(String(documentData.totalLabel), totalX + totalBoxWidth - 14, y + 42, { align: "right" });

    y += totalBoxHeight + 18;

    const boxGap = 16;
    const boxWidth = (contentWidth - boxGap) / 2;
    const boxHeight = 168;

    ensureSpace(boxHeight);

    const bankBoxX = margin;
    const mediaBoxX = bankBoxX + boxWidth + boxGap;

    pdf.setFillColor(...panelColor);
    pdf.rect(bankBoxX, y, boxWidth, boxHeight, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...accentDark);
    pdf.text("BANK DETAILS", bankBoxX + boxWidth / 2, y + 24, { align: "center" });
    pdf.setTextColor(15, 23, 32);

    let bankY = y + 48;
    documentData.bankDetails.forEach((detail) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(90, 103, 118);
      pdf.text(String(detail.label).toUpperCase(), bankBoxX + boxWidth / 2, bankY, { align: "center" });
      bankY += 13;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(15, 23, 32);
      const detailLines = pdf.splitTextToSize(String(detail.value), boxWidth - 24);
      pdf.text(detailLines, bankBoxX + boxWidth / 2, bankY, { align: "center" });
      bankY += detailLines.length * 12 + 10;
    });

    pdf.rect(mediaBoxX, y, boxWidth, boxHeight);

    if (mediaPreviewUrl && mediaPreviewKind === "image") {
      const dataUrlMatch = /^data:(image\/[a-zA-Z0-9+.-]+);base64,/.exec(mediaPreviewUrl);
      const imageMime = dataUrlMatch?.[1]?.toLowerCase() ?? "image/png";
      const imageFormat = imageMime.includes("png") ? "PNG" : imageMime.includes("jpg") || imageMime.includes("jpeg") ? "JPEG" : "PNG";

      try {
        const properties = pdf.getImageProperties(mediaPreviewUrl);
        const availableWidth = boxWidth - 16;
        const availableHeight = boxHeight - 16;
        const widthRatio = availableWidth / properties.width;
        const heightRatio = availableHeight / properties.height;
        const ratio = Math.min(widthRatio, heightRatio);
        const renderWidth = properties.width * ratio;
        const renderHeight = properties.height * ratio;
        const imageX = mediaBoxX + (boxWidth - renderWidth) / 2;
        const imageY = y + (boxHeight - renderHeight) / 2;

        pdf.addImage(mediaPreviewUrl, imageFormat, imageX, imageY, renderWidth, renderHeight, undefined, "FAST");
      } catch {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(90, 103, 118);
        pdf.text("Unable to render image", mediaBoxX + boxWidth / 2, y + boxHeight / 2 - 4, { align: "center" });
      }
    } else if (mediaFile && mediaPreviewKind === "pdf") {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(90, 103, 118);
      pdf.text("PDF attached", mediaBoxX + boxWidth / 2, y + boxHeight / 2 - 10, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const fileNameLines = pdf.splitTextToSize(mediaFile.name, boxWidth - 24);
      pdf.text(fileNameLines, mediaBoxX + boxWidth / 2, y + boxHeight / 2 + 12, { align: "center" });
    } else if (mediaFile) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(90, 103, 118);
      pdf.text("File attached", mediaBoxX + boxWidth / 2, y + boxHeight / 2 - 10, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const fileNameLines = pdf.splitTextToSize(mediaFile.name, boxWidth - 24);
      pdf.text(fileNameLines, mediaBoxX + boxWidth / 2, y + boxHeight / 2 + 12, { align: "center" });
    } else {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(90, 103, 118);
      pdf.text("Media area", mediaBoxX + boxWidth / 2, y + boxHeight / 2 - 6, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text("Attach image or PDF", mediaBoxX + boxWidth / 2, y + boxHeight / 2 + 12, { align: "center" });
    }

    const fileName = `${safeFileName(
      `invoice-${documentData.invoiceNumber}-${flat.length ? flat.join("-") : sourceLabel}`
    ) || "invoice"}.pdf`;
    pdf.save(fileName);
  }

  async function handleLaunchToCashflow() {
    setError(null);

    const normalizedItems = items.map((item) => {
      const qtyNumber = normalizeNumber(item.qty);
      const rateNumber = normalizeNumber(item.rate);

      return {
        ...item,
        description: item.description.trim(),
        qtyNumber,
        rateNumber,
        totalNumber: qtyNumber * rateNumber,
      };
    });
    const normalizedInvoiceNumber = invoiceNumber.trim();

    if (!normalizedInvoiceNumber) {
      setError("Enter an invoice number.");
      return;
    }

    if (normalizedItems.some((item) => !item.description)) {
      setError("Enter a description for every invoice item.");
      return;
    }

    if (
      normalizedItems.length === 0 ||
      totalValue <= 0 ||
      normalizedItems.some((item) => item.qtyNumber <= 0 || item.rateNumber <= 0 || item.totalNumber <= 0)
    ) {
      setError("Enter valid quantity and rate for every invoice item.");
      return;
    }

    setSaving(true);
    try {
      const cashflowValue = (-Math.abs(totalValue)).toFixed(2);
      const created = await cashFlowService.create({
        invoice: "Yes",
        date: invoiceDate,
        value: cashflowValue,
        description: normalizedItems.map((item) => item.description).join("; "),
        flat: flat.length ? flat.join(", ") : undefined,
        invoiceMedia: mediaFile,
      });

      onCreated?.(`Invoice ${normalizedInvoiceNumber} sent to cashflow successfully. Cashflow record #${created.payment_number}.`);
      onClose();
    } catch (requestError) {
      const message = (requestError as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(message ?? "Unable to send invoice to cashflow.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
      <article className="flex h-[92vh] max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-oak-border bg-white shadow-oakLg">
        <header className="flex items-center justify-between gap-4 border-b border-oak-border px-5 py-3 sm:px-6">
          <div>
            <p className="oak-label">Invoice</p>
            <h2 className="text-xl font-extrabold text-oak-coffee">{sourceLabel}</h2>
          </div>
          <button className="grid size-10 place-items-center rounded-xl border border-oak-border" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[420px_minmax(0,1fr)]">
          <form
            className="flex min-h-0 flex-col overflow-hidden border-b border-oak-border xl:border-b-0 xl:border-r"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-5">
                <section className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="oak-label">Invoice date</span>
                      <input
                        className="oak-input !min-h-10 !px-3 !py-2"
                        type="date"
                        value={invoiceDate}
                        onChange={(event) => setInvoiceDate(event.target.value)}
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="oak-label">Invoice number</span>
                      <input
                        className="oak-input !min-h-10 !px-3 !py-2"
                        value={invoiceNumber}
                        onChange={(event) => setInvoiceNumber(event.target.value)}
                      />
                    </label>
                  </div>

                  <label className="grid gap-1.5">
                    <span className="oak-label">Invoice to</span>
                    <textarea
                      className="oak-input min-h-[110px] resize-y !px-3 !py-2"
                      placeholder={"Client name\nAddress line 1\nAddress line 2"}
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                    />
                  </label>

                  <div className="grid gap-1.5">
                    <span className="oak-label">Flats</span>
                    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-oak-border bg-white p-3">
                      {flatOptions.map((value) => {
                        const inputId = `flat-${value}`;

                        return (
                          <label
                            key={value}
                            htmlFor={inputId}
                            className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-oak-coffee"
                          >
                            <input
                              id={inputId}
                              type="checkbox"
                              checked={flat.includes(value)}
                              onChange={(event) => toggleFlat(value, event.target.checked)}
                            />
                            <span>{value}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="oak-label">Account name</span>
                      <input
                        className="oak-input !min-h-10 !px-3 !py-2"
                        value={accountName}
                        onChange={(event) => setAccountName(event.target.value)}
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="oak-label">Sort code</span>
                      <input
                        className="oak-input !min-h-10 !px-3 !py-2"
                        value={sortCode}
                        onChange={(event) => setSortCode(event.target.value)}
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="oak-label">Account number</span>
                      <input
                        className="oak-input !min-h-10 !px-3 !py-2"
                        value={accountNumber}
                        onChange={(event) => setAccountNumber(event.target.value)}
                      />
                    </label>

                    <label className="grid gap-1.5">
                      <span className="oak-label">Reference</span>
                      <input
                        className="oak-input !min-h-10 !px-3 !py-2"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                      />
                    </label>
                  </div>
                </section>

                <section className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="oak-label">Invoice items</p>
                    <button className="oak-button-secondary !min-h-9 !px-3 !py-2" type="button" onClick={addItem}>
                      <Plus size={16} />
                      Add item
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {items.map((item, index) => {
                      const itemTotal = getItemTotal(item);

                      return (
                        <div className="grid gap-3 rounded-2xl border border-oak-border bg-white p-3" key={item.id}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-extrabold text-oak-coffee">Item {index + 1}</p>
                            <button
                              className="oak-button-secondary !min-h-8 !px-2"
                              disabled={items.length === 1}
                              type="button"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          <label className="grid gap-1.5">
                            <span className="oak-label">Date</span>
                            <input
                              className="oak-input !min-h-10 !px-3 !py-2"
                              type="date"
                              value={item.date}
                              onChange={(event) => updateItem(item.id, { date: event.target.value })}
                            />
                          </label>

                          <label className="grid gap-1.5">
                            <span className="oak-label">Description</span>
                            <textarea
                              className="oak-input min-h-[96px] resize-y !px-3 !py-2"
                              value={item.description}
                              onChange={(event) => updateItem(item.id, { description: event.target.value })}
                            />
                          </label>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="grid gap-1.5">
                              <span className="oak-label">Qty</span>
                              <input
                                className="oak-input !min-h-10 !px-3 !py-2"
                                min="0"
                                step="0.01"
                                type="number"
                                value={item.qty}
                                onChange={(event) => updateItem(item.id, { qty: event.target.value })}
                              />
                            </label>

                            <label className="grid gap-1.5">
                              <span className="oak-label">Rate</span>
                              <input
                                className="oak-input !min-h-10 !px-3 !py-2"
                                min="0"
                                step="0.01"
                                type="number"
                                value={item.rate}
                                onChange={(event) => updateItem(item.id, { rate: event.target.value })}
                              />
                            </label>

                            <label className="grid gap-1.5">
                              <span className="oak-label">Total</span>
                              <input
                                className="oak-input !min-h-10 !bg-oak-panel !px-3 !py-2"
                                type="text"
                                value={formatCurrency(itemTotal)}
                                readOnly
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl bg-oak-panel p-3 text-sm font-extrabold text-oak-coffee">
                    Invoice total: {formatCurrency(totalValue)}
                  </div>
                </section>

                <section className="grid gap-1.5">
                  <span className="oak-label">Media</span>
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-oak-border bg-oak-panel/50 px-4 py-4 text-sm font-semibold text-oak-coffee">
                    <Upload size={18} />
                    <span className="min-w-0 truncate">{mediaFile ? mediaFile.name : "Choose image or PDF"}</span>
                    <input
                      className="hidden"
                      accept="image/*,.jpg,.jpeg,.png,.pdf,application/pdf"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        handleMediaChange(file);
                      }}
                    />
                  </label>
                </section>
              </div>
            </div>

            <div className="shrink-0 border-t border-oak-border bg-white px-4 py-4 sm:px-5">
              <div className="grid gap-3">
                {error ? (
                  <div className="rounded-xl border border-oak-danger/30 bg-oak-dangerBg p-3 text-sm font-bold text-oak-danger">{error}</div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button className="oak-button-secondary !min-h-10 !py-2" type="button" onClick={() => void handleDownload()}>
                    <Download size={16} />
                    Download
                  </button>
                  <button
                    className="oak-button-primary !min-h-10 !py-2"
                    type="button"
                    disabled={saving}
                    onClick={() => void handleLaunchToCashflow()}
                  >
                    {saving ? "Sending..." : "Launch to cashflow"}
                  </button>
                </div>
              </div>
            </div>
          </form>

          <div className="grid min-h-0 gap-0 bg-[#f7f5f1] p-4 sm:p-5">
            <div className="overflow-hidden rounded-3xl border border-oak-border bg-white shadow-oak">
              <iframe
                className="h-[calc(92vh-130px)] min-h-[520px] w-full bg-white"
                sandbox="allow-same-origin"
                srcDoc={previewHtml}
                title="Invoice preview"
              />
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
