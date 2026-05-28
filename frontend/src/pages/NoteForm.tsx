import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { useAuthStore } from "../store/authStore";
import {
  UploadCloud,
  Plus,
  Trash2,
  ArrowLeft,
  Loader2,
  Camera,
  X,
  FolderOpen,
} from "lucide-react";

type ReceiptItem = {
  item_name: string;
  qty: number;
  price: number;
  subtotal: number;
};

type ReceiptForm = {
  date: string;
  buyer_name: string;
  requester_name: string;
  category_id: string;
  image_url: string;
  items: ReceiptItem[];
};

type CategoryOption = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type UploadCropPayload = { blob: Blob; name: string };
type UploadPayload = {
  blob: Blob | File;
  name: string;
  fallbackCrops?: UploadCropPayload[];
  topBottomSplitLikely?: boolean;
  tallImageLikely?: boolean;
  splitYRatio?: number;
};

type ReceiptSplitDetection = {
  isLikelySplit: boolean;
  splitYRatio?: number;
  blankRunRatio: number;
};

const MAX_UPLOAD_DIMENSION = 1100;
const MIN_UPLOAD_DIMENSION = 760;
const JPEG_QUALITY = 0.72;
const MIN_JPEG_QUALITY = 0.52;
const MAX_UPLOAD_BYTES = 450 * 1024;
const apiBaseURL = import.meta.env.VITE_API_BASE_URL || "/api";
const OCR_POLL_INTERVAL_MS = 1500;
const OCR_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RECEIPT_FORMS = 2;

const emptyReceipt = (
  requesterName = "",
  imageUrl = "",
  categoryId = "",
): ReceiptForm => ({
  date: "",
  buyer_name: "",
  requester_name: requesterName,
  category_id: categoryId,
  image_url: imageUrl,
  items: [],
});

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "string") {
    const normalized = value
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const normalizeOcrItems = (items: unknown): ReceiptItem[] => {
  const itemList = Array.isArray(items)
    ? items
    : items && typeof items === "object"
      ? Object.values(items)
      : [];

  return itemList
    .map((item): ReceiptItem | null => {
      if (typeof item === "string" && item.trim()) {
        return { item_name: item.trim(), qty: 1, price: 0, subtotal: 0 };
      }

      if (!item || typeof item !== "object") return null;

      const rawItem = item as Record<string, unknown>;
      const rawName =
        rawItem.item_name ??
        rawItem.itemName ??
        rawItem.name ??
        rawItem.description ??
        rawItem.product_name;
      const itemName =
        typeof rawName === "string" && rawName.trim()
          ? rawName.trim()
          : "Unrecognized Item";
      const qty = Math.max(
        1,
        toNumber(rawItem.qty ?? rawItem.quantity ?? rawItem.jumlah, 1),
      );
      const subtotalValue = Math.max(
        0,
        toNumber(rawItem.subtotal ?? rawItem.total ?? rawItem.amount),
      );
      const priceValue = Math.max(
        0,
        toNumber(
          rawItem.price ??
            rawItem.unit_price ??
            rawItem.unitPrice ??
            rawItem.harga,
        ),
      );
      const price =
        priceValue > 0
          ? priceValue
          : subtotalValue > 0
            ? subtotalValue / qty
            : 0;
      const subtotal = subtotalValue > 0 ? subtotalValue : qty * price;

      return { item_name: itemName, qty, price, subtotal };
    })
    .filter((item): item is ReceiptItem => item !== null);
};

const normalizeOcrDate = (date: unknown) => {
  if (typeof date !== "string" || !date.trim()) return "";

  const trimmedDate = date.trim();
  const isoDate = trimmedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const numericDate = trimmedDate.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/,
  );
  if (numericDate) {
    const [, day, month, year] = numericDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmedDate);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().split("T")[0];
};

const getOcrText = (data: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }

  return "";
};

const getOcrValue = (data: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null) return data[key];
  }

  return undefined;
};

const receiptListKeys = [
  "receipts",
  "receipt_list",
  "receiptList",
  "notes",
  "notas",
  "nota",
  "transactions",
  "transaction_details",
  "invoices",
];

const receiptCountKeys = [
  "receipt_count",
  "receiptCount",
  "nota_count",
  "notaCount",
  "detected_receipt_count",
  "detectedReceiptCount",
  "total_receipts",
  "totalReceipts",
  "jumlah_nota",
];

const ocrShapeKeys = [
  "receipt_count",
  "receiptCount",
  "date",
  "tanggal",
  "transaction_date",
  "invoice_date",
  "receipt_date",
  "buyer_name",
  "buyerName",
  "store_name",
  "storeName",
  "merchant_name",
  "items",
  "line_items",
  "lineItems",
  "products",
  "details",
  "total",
  "total_amount",
  "grand_total",
  "amount",
];

const nestedOcrKeys = [
  "ocrData",
  "data",
  "result",
  "receipt",
  "receipt_data",
  "receiptData",
  "invoice",
  "transaction",
  "extracted_data",
  "extractedData",
];

const hasOcrShape = (data: Record<string, unknown>) =>
  ocrShapeKeys.some((key) => data[key] !== undefined);

const extractOcrData = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return { receipts: value };
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  if (
    hasOcrShape(record) ||
    receiptListKeys.some((key) => record[key] !== undefined)
  )
    return record;

  for (const key of nestedOcrKeys) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const nestedRecord = extractOcrData(nested);
      if (
        hasOcrShape(nestedRecord) ||
        receiptListKeys.some(
          (nestedKey) => nestedRecord[nestedKey] !== undefined,
        )
      ) {
        return nestedRecord;
      }
    }
  }

  return record;
};

const extractReceiptRecords = (ocrData: unknown) => {
  const rawOcr = extractOcrData(ocrData);

  for (const key of receiptListKeys) {
    const value = rawOcr[key];
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map((item) => extractOcrData(item))
        .slice(0, MAX_RECEIPT_FORMS);
    }
  }

  return [rawOcr];
};

const getExpectedReceiptCount = (ocrData: unknown, fallbackCount: number) => {
  const rawOcr = extractOcrData(ocrData);
  const countValue = getOcrValue(rawOcr, ...receiptCountKeys);
  const parsedCount = Math.round(toNumber(countValue));

  if (parsedCount > 0) return Math.min(MAX_RECEIPT_FORMS, parsedCount);
  return Math.max(1, Math.min(MAX_RECEIPT_FORMS, fallbackCount));
};

const buildReceiptFromOcr = (
  raw: Record<string, unknown>,
  imageUrl: string,
  requesterName: string,
  categoryId: string,
): ReceiptForm => {
  const totalAmount = Math.max(
    0,
    toNumber(
      getOcrValue(
        raw,
        "total",
        "total_amount",
        "totalAmount",
        "grand_total",
        "grandTotal",
        "amount",
        "total_belanja",
        "total_tagihan",
        "jumlah",
      ),
    ),
  );
  const items = normalizeOcrItems(
    getOcrValue(
      raw,
      "items",
      "line_items",
      "lineItems",
      "products",
      "details",
      "item_details",
    ),
  );
  const fallbackItems =
    totalAmount > 0
      ? [
          {
            item_name: "Unrecognized Items",
            qty: 1,
            price: totalAmount,
            subtotal: totalAmount,
          },
        ]
      : [];

  return {
    date: normalizeOcrDate(
      getOcrValue(
        raw,
        "date",
        "tanggal",
        "transaction_date",
        "transactionDate",
        "invoice_date",
        "receipt_date",
      ),
    ),
    buyer_name: getOcrText(
      raw,
      "buyer_name",
      "buyerName",
      "store_name",
      "storeName",
      "merchant_name",
      "merchantName",
      "supplier_name",
      "vendor_name",
      "nama_pembeli",
      "nama_toko",
      "nama_merchant",
      "seller_name",
    ),
    requester_name:
      getOcrText(
        raw,
        "requester_name",
        "requesterName",
        "requester",
        "nama_requester",
      ) || requesterName,
    category_id: categoryId,
    image_url: imageUrl,
    items: items.length > 0 ? items : fallbackItems,
  };
};

const getReceiptTotal = (receipt: ReceiptForm) =>
  receipt.items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0),
    0,
  );

const normalizeComparableText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getRawReceiptItems = (record: Record<string, unknown>) =>
  normalizeOcrItems(
    getOcrValue(
      record,
      "items",
      "line_items",
      "lineItems",
      "products",
      "details",
      "item_details",
    ),
  );

const getRawReceiptTotal = (record: Record<string, unknown>) =>
  Math.max(
    0,
    toNumber(
      getOcrValue(
        record,
        "total",
        "total_amount",
        "totalAmount",
        "grand_total",
        "grandTotal",
        "amount",
        "total_belanja",
        "total_tagihan",
        "jumlah",
      ),
    ),
  );

const getRawReceiptDate = (record: Record<string, unknown>) =>
  normalizeOcrDate(
    getOcrValue(
      record,
      "date",
      "tanggal",
      "transaction_date",
      "transactionDate",
      "invoice_date",
      "receipt_date",
    ),
  );

const getRawReceiptBuyer = (record: Record<string, unknown>) =>
  normalizeComparableText(
    getOcrText(
      record,
      "buyer_name",
      "buyerName",
      "store_name",
      "storeName",
      "merchant_name",
      "merchantName",
      "supplier_name",
      "vendor_name",
      "nama_pembeli",
      "nama_toko",
      "nama_merchant",
      "seller_name",
    ),
  );

const getRealItemNames = (record: Record<string, unknown>) =>
  getRawReceiptItems(record)
    .map((item) => normalizeComparableText(item.item_name))
    .filter(
      (itemName) =>
        itemName &&
        itemName !== "unrecognized item" &&
        itemName !== "unrecognized items",
    );

const hasKnownReceiptBuyer = (record: Record<string, unknown>) => {
  const buyerName = getRawReceiptBuyer(record);
  return (
    buyerName !== "" &&
    buyerName !== "unknown" &&
    buyerName !== "unknown store" &&
    buyerName !== "unrecognized store"
  );
};

const isUsefulCropReceipt = (record: Record<string, unknown>) =>
  hasKnownReceiptBuyer(record) &&
  getRawReceiptTotal(record) > 0 &&
  getRealItemNames(record).length > 0;

const isNonEmptyReceiptRecord = (record: Record<string, unknown>) =>
  getRawReceiptTotal(record) > 0 ||
  getRealItemNames(record).length > 0 ||
  hasKnownReceiptBuyer(record);

const receiptRecordScore = (record: Record<string, unknown>) =>
  (hasKnownReceiptBuyer(record) ? 3 : 0) +
  (getRawReceiptTotal(record) > 0 ? 2 : 0) +
  getRealItemNames(record).length * 4;

const emptyOcrReceiptRecord = (index: number): Record<string, unknown> => ({
  buyer_name: `Receipt ${index + 1}`,
  requester_name: "",
  total: 0,
  items: [],
});

const itemOverlapRatio = (leftItems: string[], rightItems: string[]) => {
  if (leftItems.length === 0 || rightItems.length === 0) return 0;
  const leftSet = new Set(leftItems);
  const rightSet = new Set(rightItems);
  const overlapCount = [...leftSet].filter((itemName) =>
    rightSet.has(itemName),
  ).length;
  return overlapCount / Math.min(leftSet.size, rightSet.size);
};

const areSimilarReceiptRecords = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) => {
  const leftTotal = getRawReceiptTotal(left);
  const rightTotal = getRawReceiptTotal(right);
  const leftItems = getRealItemNames(left);
  const rightItems = getRealItemNames(right);
  const totalTolerance = Math.max(1000, Math.max(leftTotal, rightTotal) * 0.02);
  const totalsMatch =
    leftTotal > 0 &&
    rightTotal > 0 &&
    Math.abs(leftTotal - rightTotal) <= totalTolerance;
  const itemsOverlap = itemOverlapRatio(leftItems, rightItems);
  const sameBuyerAndDate =
    getRawReceiptDate(left) === getRawReceiptDate(right) &&
    getRawReceiptBuyer(left) === getRawReceiptBuyer(right);

  if (totalsMatch && itemsOverlap > 0.4) return true;
  if (sameBuyerAndDate && totalsMatch) return true;
  if (sameBuyerAndDate && itemsOverlap >= 0.8) return true;

  return false;
};

const dedupeReceiptRecords = (records: Record<string, unknown>[]) =>
  records.reduce<Record<string, unknown>[]>((uniqueRecords, record) => {
    if (
      !uniqueRecords.some((uniqueRecord) =>
        areSimilarReceiptRecords(uniqueRecord, record),
      )
    ) {
      uniqueRecords.push(record);
    }

    return uniqueRecords;
  }, []);

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to prepare image for upload"));
        }
      },
      "image/jpeg",
      quality,
    );
  });

const compressSourceToJpeg = async (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  name = "scanned_receipt.jpg",
): Promise<UploadPayload> => {
  let maxDimension = MAX_UPLOAD_DIMENSION;
  let quality = JPEG_QUALITY;
  let lastBlob: Blob | null = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const ratio = Math.min(
      1,
      maxDimension / sourceWidth,
      maxDimension / sourceHeight,
    );
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Failed to prepare image canvas");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    lastBlob = await canvasToJpegBlob(canvas, quality);
    if (lastBlob.size <= MAX_UPLOAD_BYTES) break;

    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, Number((quality - 0.08).toFixed(2)));
    } else if (maxDimension > MIN_UPLOAD_DIMENSION) {
      maxDimension = Math.max(
        MIN_UPLOAD_DIMENSION,
        Math.floor(maxDimension * 0.85),
      );
      quality = JPEG_QUALITY;
    } else {
      break;
    }
  }

  if (!lastBlob) throw new Error("Failed to prepare image for upload");

  return { blob: lastBlob, name };
};

const buildCropPayload = async (
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  name: string,
): Promise<UploadCropPayload> => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Failed to prepare receipt crop");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const payload = await compressSourceToJpeg(
    canvas,
    canvas.width,
    canvas.height,
    name,
  );
  return { blob: payload.blob as Blob, name: payload.name };
};

const findTopBottomSeparator = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): ReceiptSplitDetection => {
  if (sourceHeight / Math.max(1, sourceWidth) < 1.35) {
    return { isLikelySplit: false, blankRunRatio: 0 };
  }

  const sampleWidth = 180;
  const sampleHeight = 360;
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const ctx = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });
  if (!ctx) return { isLikelySplit: false, blankRunRatio: 0 };

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sampleWidth, sampleHeight);
  ctx.drawImage(source, 0, 0, sampleWidth, sampleHeight);

  const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const xStart = Math.floor(sampleWidth * 0.08);
  const xEnd = Math.ceil(sampleWidth * 0.92);
  const yStart = Math.floor(sampleHeight * 0.28);
  const yEnd = Math.ceil(sampleHeight * 0.72);
  const rowInkRatios: number[] = [];
  const rowBrightness: number[] = [];

  for (let y = yStart; y < yEnd; y += 1) {
    let darkPixels = 0;
    let brightnessSum = 0;

    for (let x = xStart; x < xEnd; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const brightness = (r + g + b) / 3;
      brightnessSum += brightness;

      if (brightness < 145) darkPixels += 1;
    }

    const width = xEnd - xStart;
    rowInkRatios.push(darkPixels / width);
    rowBrightness.push(brightnessSum / width);
  }

  let bestRunStart = -1;
  let bestRunEnd = -1;
  let currentRunStart = -1;

  for (let index = 0; index < rowInkRatios.length; index += 1) {
    const isBlankSeparatorRow =
      rowInkRatios[index] < 0.035 && rowBrightness[index] > 125;
    if (isBlankSeparatorRow) {
      if (currentRunStart === -1) currentRunStart = index;
    } else {
      if (currentRunStart !== -1) {
        const currentRunEnd = index - 1;
        if (currentRunEnd - currentRunStart > bestRunEnd - bestRunStart) {
          bestRunStart = currentRunStart;
          bestRunEnd = currentRunEnd;
        }
        currentRunStart = -1;
      }
    }
  }

  if (
    currentRunStart !== -1 &&
    rowInkRatios.length - 1 - currentRunStart > bestRunEnd - bestRunStart
  ) {
    bestRunStart = currentRunStart;
    bestRunEnd = rowInkRatios.length - 1;
  }

  const bestRun = bestRunStart === -1 ? 0 : bestRunEnd - bestRunStart + 1;
  const blankRunRatio = bestRun / sampleHeight;
  const splitYRatio =
    bestRunStart === -1
      ? undefined
      : (yStart + (bestRunStart + bestRunEnd) / 2) / sampleHeight;
  const isLikelySplit =
    Boolean(splitYRatio) &&
    blankRunRatio >= 0.025 &&
    splitYRatio! > 0.3 &&
    splitYRatio! < 0.7;

  return { isLikelySplit, splitYRatio, blankRunRatio };
};

const createTopBottomCropPayloads = async (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  splitYRatio = 0.5,
): Promise<UploadCropPayload[]> => {
  const overlapY = sourceHeight * 0.025;
  const splitY = sourceHeight * splitYRatio;
  const crops = [
    {
      x: 0,
      y: 0,
      width: sourceWidth,
      height: splitY + overlapY,
      name: "receipt-crop-top.jpg",
    },
    {
      x: 0,
      y: splitY - overlapY,
      width: sourceWidth,
      height: sourceHeight - splitY + overlapY,
      name: "receipt-crop-bottom.jpg",
    },
  ];

  return Promise.all(
    crops.map((crop) =>
      buildCropPayload(
        source,
        Math.max(0, crop.x),
        Math.max(0, crop.y),
        Math.min(crop.width, sourceWidth - Math.max(0, crop.x)),
        Math.min(crop.height, sourceHeight - Math.max(0, crop.y)),
        crop.name,
      ),
    ),
  );
};

const loadImageFromFile = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to read camera image"));
    };
    img.src = objectUrl;
  });

const compressImageFileForUpload = async (
  file: File,
): Promise<UploadPayload> => {
  const img = await loadImageFromFile(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const payload = await compressSourceToJpeg(img, width, height);
  const tallImageLikely = height / Math.max(1, width) >= 1.8;
  const splitDetection = findTopBottomSeparator(img, width, height);
  const topBottomSplitLikely = splitDetection.isLikelySplit;
  const splitYRatio = splitDetection.splitYRatio;
  return {
    ...payload,
    fallbackCrops:
      topBottomSplitLikely || tallImageLikely
        ? await createTopBottomCropPayloads(img, width, height, splitYRatio)
        : undefined,
    topBottomSplitLikely,
    tallImageLikely,
    splitYRatio,
  };
};

const buildApiUrl = (path: string) => `${apiBaseURL.replace(/\/$/, "")}${path}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchApiJson = async (path: string, init?: RequestInit) => {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  });

  const result = await response.json().catch(() => null);

  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = "/login";
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) throw new Error(result?.message || "Request failed");

  return result;
};

const uploadReceiptImage = async (payload: UploadPayload) => {
  const runUploadJob = async (
    uploadPayload: UploadPayload | UploadCropPayload,
  ) => {
    const formData = new FormData();
    formData.append("image", uploadPayload.blob, uploadPayload.name);

    const startResult = await fetchApiJson("/notes/upload/async", {
      method: "POST",
      body: formData,
    });

    const jobId = startResult?.data?.jobId;
    if (!jobId) throw new Error("OCR job could not be started");

    const startedAt = Date.now();
    while (Date.now() - startedAt < OCR_POLL_TIMEOUT_MS) {
      await sleep(OCR_POLL_INTERVAL_MS);
      const statusResult = await fetchApiJson(`/notes/upload/jobs/${jobId}`);
      const job = statusResult?.data;

      if (job?.status === "completed" && job.result) return job.result;
      if (job?.status === "failed")
        throw new Error(job.error || "OCR processing failed");
    }

    throw new Error(
      "OCR processing took too long. Please try again with a clearer photo.",
    );
  };

  const fullImageResult = await runUploadJob(payload);
  const fullReceipts = extractReceiptRecords(fullImageResult?.ocrData);
  const fallbackCrops = payload.fallbackCrops || [];
  const fullResultUseful = fullReceipts.some(isUsefulCropReceipt);
  const expectedReceiptCount = payload.topBottomSplitLikely
    ? MAX_RECEIPT_FORMS
    : getExpectedReceiptCount(fullImageResult?.ocrData, fullReceipts.length);
  const shouldTryTopBottomCrops =
    fallbackCrops.length > 0 &&
    (expectedReceiptCount > fullReceipts.length ||
      (!fullResultUseful && payload.tallImageLikely));

  if (!shouldTryTopBottomCrops) {
    return fullImageResult;
  }

  const cropResults = await Promise.allSettled(
    fallbackCrops.map((crop) => runUploadJob(crop)),
  );
  const fulfilledCropReceipts = cropResults
    .filter(
      (result): result is PromiseFulfilledResult<unknown> =>
        result.status === "fulfilled",
    )
    .flatMap((result) =>
      extractReceiptRecords((result.value as { ocrData?: unknown })?.ocrData),
    );
  const cropReceipts = payload.topBottomSplitLikely
    ? Array.from(
        { length: MAX_RECEIPT_FORMS },
        (_, index) =>
          fulfilledCropReceipts[index] || emptyOcrReceiptRecord(index),
      )
    : dedupeReceiptRecords(fulfilledCropReceipts.filter(isUsefulCropReceipt));

  if (payload.topBottomSplitLikely) {
    // Hanya konfirmasi 2 nota jika KEDUA crop benar-benar punya data nota lengkap
    // (buyer + items + total). Kalau cuma 1 yang berguna → 1 nota saja.
    const usefulCropCount = cropReceipts.filter(isUsefulCropReceipt).length;

    if (usefulCropCount >= 2) {
      const selectedReceipts = cropReceipts.map((record, index) =>
        isNonEmptyReceiptRecord(record) ? record : emptyOcrReceiptRecord(index),
      );
      return {
        imageUrl: fullImageResult.imageUrl,
        ocrData: {
          ...selectedReceipts[0],
          receipt_count: 2,
          receipts: selectedReceipts,
        },
      };
    }
    // Hanya 1 crop berguna → jatuhkan ke logika best-pick di bawah (1 nota)
  }

  const bestCropReceipt = cropReceipts
    .slice()
    .sort(
      (left, right) => receiptRecordScore(right) - receiptRecordScore(left),
    )[0];
  const bestFullReceipt = fullReceipts
    .slice()
    .sort(
      (left, right) => receiptRecordScore(right) - receiptRecordScore(left),
    )[0];

  if (
    bestCropReceipt &&
    receiptRecordScore(bestCropReceipt) >
      receiptRecordScore(bestFullReceipt || {})
  ) {
    return {
      imageUrl: fullImageResult.imageUrl,
      ocrData: {
        ...bestCropReceipt,
        receipt_count: 1,
        receipts: [bestCropReceipt],
      },
    };
  }

  return fullImageResult;
};

export default function NoteForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const currentUser = useAuthStore((state) => state.user);

  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptForm[]>([
    emptyReceipt(currentUser?.name || ""),
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const defaultRequesterName = currentUser?.name || "";
  const combinedTotal = receipts.reduce(
    (sum, receipt) => sum + getReceiptTotal(receipt),
    0,
  );
  const isPdfPreview = imagePreview?.startsWith("data:application/pdf");

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleCameraClick = () => {
    setImagePreview(null);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      cameraInputRef.current?.click();
      return;
    }

    startCameraStream();
  };

  const startCameraStream = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        setIsCameraOpen(false);
        cameraInputRef.current?.click();
      }
    }
  };

  const takePhoto = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      alert("Camera is not ready yet. Please wait a moment and try again.");
      return;
    }

    setUploading(true);

    try {
      const payload = await compressSourceToJpeg(
        video,
        video.videoWidth,
        video.videoHeight,
      );
      payload.tallImageLikely =
        video.videoHeight / Math.max(1, video.videoWidth) >= 1.8;
      const splitDetection = findTopBottomSeparator(
        video,
        video.videoWidth,
        video.videoHeight,
      );
      payload.topBottomSplitLikely = splitDetection.isLikelySplit;
      payload.splitYRatio = splitDetection.splitYRatio;
      payload.fallbackCrops =
        payload.topBottomSplitLikely || payload.tallImageLikely
          ? await createTopBottomCropPayloads(
              video,
              video.videoWidth,
              video.videoHeight,
              payload.splitYRatio,
            )
          : undefined;
      stopCamera();
      uploadMutation.mutate(payload);
    } catch {
      setUploading(false);
      alert(
        "Failed to capture photo. Please try uploading an image file instead.",
      );
    }
  };

  useQuery({
    queryKey: ["note", id],
    queryFn: async () => {
      if (!isEditMode) return null;
      const res = await api.get(`/notes/${id}`);
      const note = res.data.data;
      const imageUrl = note.image_url || "";

      if (imageUrl) {
        // Path relatif: bekerja di dev (Vite proxy /uploads)
        // dan production (Nginx /uploads) tanpa hardcode port
        setImagePreview(imageUrl);
      }

      setReceipts([
        {
          date: new Date(note.date).toISOString().split("T")[0],
          buyer_name: note.buyer.name,
          requester_name: note.requester.name,
          category_id: note.category_id,
          image_url: imageUrl,
          items: note.items.map(
            (item: {
              item_name: string;
              qty: number;
              price: string | number;
              subtotal: string | number;
            }) => ({
              item_name: item.item_name,
              qty: item.qty,
              price: Number(item.price),
              subtotal: Number(item.subtotal),
            }),
          ),
        },
      ]);

      return note;
    },
    enabled: isEditMode,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get("/categories");
      return res.data.data.filter(
        (category: CategoryOption) => category.is_active,
      ) as CategoryOption[];
    },
  });

  const updateReceipt = (receiptIndex: number, patch: Partial<ReceiptForm>) => {
    setReceipts((currentReceipts) =>
      currentReceipts.map((receipt, index) =>
        index === receiptIndex ? { ...receipt, ...patch } : receipt,
      ),
    );
  };

  const updateReceiptItem = (
    receiptIndex: number,
    itemIndex: number,
    field: keyof ReceiptItem,
    value: string | number,
  ) => {
    setReceipts((currentReceipts) =>
      currentReceipts.map((receipt, index) => {
        if (index !== receiptIndex) return receipt;

        const items = receipt.items.map((item, currentItemIndex) => {
          if (currentItemIndex !== itemIndex) return item;

          const nextItem = {
            ...item,
            [field]: field === "item_name" ? String(value) : Number(value) || 0,
          };
          if (field === "qty" || field === "price") {
            nextItem.subtotal =
              Number(nextItem.qty || 0) * Number(nextItem.price || 0);
          }

          return nextItem;
        });

        return { ...receipt, items };
      }),
    );
  };

  const addItem = (receiptIndex: number) => {
    setReceipts((currentReceipts) =>
      currentReceipts.map((receipt, index) =>
        index === receiptIndex
          ? {
              ...receipt,
              items: [
                ...receipt.items,
                { item_name: "", qty: 1, price: 0, subtotal: 0 },
              ],
            }
          : receipt,
      ),
    );
  };

  const removeItem = (receiptIndex: number, itemIndex: number) => {
    setReceipts((currentReceipts) =>
      currentReceipts.map((receipt, index) =>
        index === receiptIndex
          ? {
              ...receipt,
              items: receipt.items.filter(
                (_, currentItemIndex) => currentItemIndex !== itemIndex,
              ),
            }
          : receipt,
      ),
    );
  };

  // Tambah receipt ke-2 secara manual (pakai foto yang sama)
  const addReceiptManually = () => {
    const sharedImageUrl = imagePreview || receipts[0]?.image_url || "";
    const sharedCategoryId = receipts[0]?.category_id || "";
    setReceipts((prev) => [
      ...prev,
      emptyReceipt(defaultRequesterName, sharedImageUrl, sharedCategoryId),
    ]);
  };

  const removeReceipt = (receiptIndex: number) => {
    setReceipts((prev) => prev.filter((_, i) => i !== receiptIndex));
  };

  const uploadMutation = useMutation({
    mutationFn: uploadReceiptImage,
    onSuccess: (data) => {
      try {
        const imageUrl =
          typeof data?.imageUrl === "string" ? data.imageUrl : "";
        if (imageUrl) setImagePreview(imageUrl);

        const currentCategoryId = receipts[0]?.category_id || "";
        const expectedCount = getExpectedReceiptCount(data?.ocrData, 1);
        const receiptRecords = extractReceiptRecords(data?.ocrData).slice(
          0,
          expectedCount,
        );
        const nextReceipts = receiptRecords.map((record) =>
          buildReceiptFromOcr(
            record,
            imageUrl,
            defaultRequesterName,
            currentCategoryId,
          ),
        );

        setReceipts(
          nextReceipts.length > 0
            ? nextReceipts
            : [emptyReceipt(defaultRequesterName, imageUrl, currentCategoryId)],
        );
      } catch (error) {
        console.warn("OCR response could not be applied to the form:", error);
      } finally {
        setUploading(false);
      }
    },
    onError: (err: unknown) => {
      setUploading(false);
      const error = err as Error;
      alert("Failed to upload image: " + error.message);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payloads: ReceiptForm[]) => {
      if (isEditMode) {
        const receipt = payloads[0];
        await api.patch(`/notes/${id}`, {
          ...receipt,
          total: getReceiptTotal(receipt),
        });
        return;
      }

      for (const receipt of payloads) {
        await api.post("/notes", {
          ...receipt,
          total: getReceiptTotal(receipt),
        });
      }
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);

    try {
      if (file.type === "application/pdf") {
        uploadMutation.mutate({ blob: file, name: file.name });
        return;
      }

      const payload = await compressImageFileForUpload(file);
      uploadMutation.mutate(payload);
    } catch {
      setUploading(false);
      alert(
        "Failed to read camera image. Please set your phone camera format to JPG/Most Compatible, then try again.",
      );
    }
  };

  const validateReceipts = () => {
    for (let index = 0; index < receipts.length; index += 1) {
      const receipt = receipts[index];
      const label = receipts.length > 1 ? `Receipt ${index + 1}` : "Receipt";

      if (!receipt.image_url) return `${label}: receipt image is required`;
      if (!receipt.date) return `${label}: date is required`;
      if (!receipt.category_id) return `${label}: category is required`;
      if (!receipt.buyer_name.trim()) return `${label}: buyer name is required`;
      if (!receipt.requester_name.trim())
        return `${label}: requester name is required`;
      if (receipt.items.length === 0)
        return `${label}: at least one item is required`;
      if (receipt.items.some((item) => !item.item_name.trim()))
        return `${label}: every item needs a name`;
    }

    return "";
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationMessage = validateReceipts();
    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      await submitMutation.mutateAsync(receipts);
      window.location.href = "/receipts";
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      alert(
        `Failed to ${isEditMode ? "update" : "save"} note: ` +
          (error.response?.data?.message || error.message),
      );
    }
  };

  return (
    <div className="font-body-md text-gray-800 dark:text-white antialiased bg-[#fff0f3] dark:bg-transparent min-h-screen p-4 sm:p-6 -m-4 sm:-m-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto pb-12">
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={() => navigate("/receipts")}
            className="p-2 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-full transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-[#1e293b] dark:text-gray-300" />
          </button>
          <h1 className="font-h2 text-3xl font-bold text-[#1e293b] dark:text-white tracking-tight">
            {isEditMode ? "Edit Receipt" : "Capture Receipt"}
          </h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8"
        >
          <div className="lg:col-span-4 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-[#1e293b] dark:text-white ml-1">
              Receipt Upload
            </h2>

            <div className="bg-white dark:bg-[#1a1a1c] p-6 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800 flex-1">
              {!imagePreview ? (
                isCameraOpen ? (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-h-[500px] flex flex-col shadow-sm">
                    <video
                      ref={handleVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 inset-x-0 p-6 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 backdrop-blur-sm transition-colors"
                      >
                        <X className="w-6 h-6" />
                      </button>
                      <button
                        type="button"
                        onClick={takePhoto}
                        className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                      />
                      <div className="w-12 h-12" />
                    </div>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-2xl px-6 py-12 flex flex-col items-center justify-center text-center transition-colors h-full min-h-[400px]
                    ${uploading ? "bg-gray-50 border-gray-300 dark:bg-[#252525] dark:border-gray-700" : "border-[#ecc7c7] bg-[#fffafb] dark:bg-[#1a1a1c] dark:border-red-900/30"}
                  `}
                  >
                    {uploading ? (
                      <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="w-12 h-12 text-[#a60016] animate-spin mb-4" />
                        <p className="text-sm font-bold text-gray-800 dark:text-white">
                          Processing Receipt...
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Extracting data with AI Engine
                        </p>
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="w-12 h-12 text-[#4a5568] dark:text-gray-400 mb-3" />
                        <p className="text-base font-bold text-[#1e293b] dark:text-white mb-1">
                          Drag & drop your receipt here
                        </p>
                        <p className="text-xs text-[#64748b] dark:text-gray-500 mb-8">
                          Supports JPG, PNG, PDF
                        </p>

                        <div className="flex items-center w-full mb-8">
                          <div className="flex-1 h-[1px] bg-[#ecc7c7] dark:bg-gray-700" />
                          <span className="px-4 text-[10px] font-bold text-[#94a3b8] dark:text-gray-500 tracking-widest uppercase">
                            OR
                          </span>
                          <div className="flex-1 h-[1px] bg-[#ecc7c7] dark:bg-gray-700" />
                        </div>

                        <button
                          type="button"
                          onClick={handleCameraClick}
                          className="w-full mb-4 py-3.5 bg-[#e6effb] text-[#2c4b72] dark:bg-blue-900/30 dark:text-blue-300 rounded-xl font-bold text-sm flex justify-center items-center gap-2 hover:bg-[#dbe6f7] dark:hover:bg-blue-900/50 transition-colors"
                        >
                          <Camera className="w-4 h-4" /> Capture with Camera
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-3.5 bg-[#a60016] text-white hover:bg-[#8b0012] rounded-xl font-bold text-sm flex justify-center items-center gap-2 transition-colors shadow-sm"
                        >
                          <FolderOpen className="w-4 h-4" /> Browse Files
                        </button>
                      </>
                    )}
                  </div>
                )
              ) : (
                <div className="relative group rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252525] h-full min-h-[400px] flex items-center justify-center">
                  {isPdfPreview ? (
                    <object
                      data={imagePreview}
                      type="application/pdf"
                      className="w-full h-[600px] max-h-[600px]"
                    >
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        PDF preview unavailable
                      </span>
                    </object>
                  ) : (
                    <img
                      src={imagePreview}
                      alt="Receipt Preview"
                      className="w-full h-auto object-contain max-h-[600px]"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col gap-3 w-48">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white text-gray-800 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-100 flex items-center justify-center gap-2 shadow-sm"
                      >
                        <UploadCloud className="w-4 h-4" /> Upload New
                      </button>
                      <button
                        type="button"
                        onClick={handleCameraClick}
                        className="bg-[#a60016] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#8b0012] flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Camera className="w-4 h-4" /> Retake Photo
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/jpeg, image/png, image/jpg, application/pdf"
                onChange={handleFileChange}
              />
              <input
                type="file"
                ref={cameraInputRef}
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-6">
            {receipts.map((receipt, receiptIndex) => {
              const receiptTotal = getReceiptTotal(receipt);

              return (
                <div key={receiptIndex} className="flex flex-col gap-6">
                  {receipts.length > 1 && (
                    <div className="flex items-center justify-between ml-1">
                      <h2 className="text-xl font-bold text-[#1e293b] dark:text-white">
                        Receipt {receiptIndex + 1}
                      </h2>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-[#a60016]">
                          Rp {receiptTotal.toLocaleString("id-ID")}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeReceipt(receiptIndex)}
                          className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <X className="w-3 h-3" /> Remove
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-[#1e293b] dark:text-white ml-1">
                      Transaction Details
                    </h2>
                    <div className="bg-white dark:bg-[#1a1a1c] p-6 sm:p-8 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
                            Date
                          </label>
                          <input
                            type="date"
                            value={receipt.date}
                            onChange={(event) =>
                              updateReceipt(receiptIndex, {
                                date: event.target.value,
                              })
                            }
                            className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors shadow-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
                            Category
                          </label>
                          <select
                            value={receipt.category_id}
                            onChange={(event) =>
                              updateReceipt(receiptIndex, {
                                category_id: event.target.value,
                              })
                            }
                            className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors cursor-pointer shadow-sm"
                          >
                            <option value="">Select Category</option>
                            {categories?.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name} ({category.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
                            Buyer Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. John Doe"
                            value={receipt.buyer_name}
                            onChange={(event) =>
                              updateReceipt(receiptIndex, {
                                buyer_name: event.target.value,
                              })
                            }
                            className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors shadow-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
                            Requester Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Jane Smith"
                            value={receipt.requester_name}
                            onChange={(event) =>
                              updateReceipt(receiptIndex, {
                                requester_name: event.target.value,
                              })
                            }
                            className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors shadow-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-[#1e293b] dark:text-white ml-1">
                      Items
                    </h2>
                    <div className="bg-white dark:bg-[#1a1a1c] rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[550px]">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1c]">
                              <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300">
                                Item Name
                              </th>
                              <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300 w-24">
                                Qty
                              </th>
                              <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300 w-32">
                                Price
                              </th>
                              <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300 w-32">
                                Subtotal
                              </th>
                              <th className="px-4 py-5 w-12" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-[#1a1a1c]">
                            {receipt.items.map((item, itemIndex) => (
                              <tr
                                key={itemIndex}
                                className="hover:bg-gray-50/50 dark:hover:bg-[#202022] transition-colors"
                              >
                                <td className="px-4 py-2">
                                  <input
                                    value={item.item_name}
                                    onChange={(event) =>
                                      updateReceiptItem(
                                        receiptIndex,
                                        itemIndex,
                                        "item_name",
                                        event.target.value,
                                      )
                                    }
                                    className="w-full bg-transparent border-0 focus:ring-0 rounded p-2 text-[14px] font-medium text-gray-500 dark:text-gray-400 placeholder-gray-300 outline-none"
                                    placeholder="Item description"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    value={item.qty}
                                    onChange={(event) =>
                                      updateReceiptItem(
                                        receiptIndex,
                                        itemIndex,
                                        "qty",
                                        parseFloat(event.target.value) || 0,
                                      )
                                    }
                                    className="w-full bg-transparent border-0 focus:ring-0 rounded p-2 text-[14px] font-medium text-gray-500 dark:text-gray-400 outline-none"
                                    min="1"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    value={item.price}
                                    onChange={(event) =>
                                      updateReceiptItem(
                                        receiptIndex,
                                        itemIndex,
                                        "price",
                                        parseFloat(event.target.value) || 0,
                                      )
                                    }
                                    className="w-full bg-transparent border-0 focus:ring-0 rounded p-2 text-[14px] font-medium text-gray-500 dark:text-gray-400 outline-none"
                                    min="0"
                                  />
                                </td>
                                <td className="px-4 py-2 text-[#1e293b] dark:text-white font-bold text-[14px]">
                                  Rp{" "}
                                  {(
                                    Number(item.qty || 0) *
                                    Number(item.price || 0)
                                  ).toLocaleString("id-ID")}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeItem(receiptIndex, itemIndex)
                                    }
                                    className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-gray-800"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1c]">
                        <button
                          type="button"
                          onClick={() => addItem(receiptIndex)}
                          className="text-[#a60016] font-semibold text-sm flex items-center gap-2 hover:opacity-80 transition-opacity ml-2"
                        >
                          <Plus className="w-4 h-4 font-bold" /> Add Row
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Tombol tambah receipt ke-2 secara manual */}
            {!isEditMode && receipts.length < MAX_RECEIPT_FORMS && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={addReceiptManually}
                  className="flex items-center gap-2 px-6 py-3 border-2 border-dashed border-[#ecc7c7] dark:border-red-900/40 text-[#a60016] font-semibold text-sm rounded-xl hover:border-[#a60016] hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Second Receipt Manually
                </button>
              </div>
            )}

            <div className="bg-white dark:bg-[#1a1a1c] p-5 sm:p-6 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-6 mt-2">
              <div className="flex items-center gap-5 w-full sm:w-auto ml-2">
                <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 tracking-widest uppercase leading-tight">
                  Total
                  <br />
                  Amount
                </span>
                <span className="text-3xl font-bold text-[#a60016]">
                  Rp {combinedTotal.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="flex w-full sm:w-auto gap-4">
                <button
                  type="button"
                  onClick={() => navigate("/receipts")}
                  className="flex-1 sm:flex-none px-8 py-3.5 border-2 border-gray-200 dark:border-gray-700 text-[#4a5568] dark:text-gray-300 font-bold text-[15px] rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitMutation.isPending ||
                    uploading ||
                    receipts.length === 0
                  }
                  className="flex-1 sm:flex-none px-10 py-3.5 bg-[#a60016] text-white font-bold text-[15px] rounded-xl hover:bg-[#8b0012] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-red-900/10"
                >
                  {submitMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {receipts.length > 1 ? "Save Receipts" : "Save Receipt"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
