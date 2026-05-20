import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/prisma';
import { GoogleGenAI } from '@google/genai';
import { sendSuccess, sendError } from '../utils/responseHandler';
import OpenAI from 'openai';
import Tesseract from 'tesseract.js';
import { parseReceiptText } from '../utils/ocrParser';
import { syncToN8n } from '../services/n8nService';

// Model Gemini yang akan dirotasi per key (urut dari terbaik ke fallback)
// Hanya model yang masih aktif di Google API (Mei 2026)
const GEMINI_MODELS = [
  'gemini-2.5-flash',               // Terbaik, vision + reasoning terkuat
  'gemini-2.5-flash-lite',          // Fallback lebih ringan saat Flash sedang padat
];

// Model Groq Vision yang tersedia
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
];

// Model Mistral AI Vision
const MISTRAL_MODELS = [
  'pixtral-12b',
  'pixtral-large',
];

// Model OpenRouter Vision (free tier)
const OPENROUTER_MODELS = [
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'qwen/qwen-2-vl-7b-instruct:free',
];

const sanitizeSnapshot = (snapshot: unknown): unknown => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return snapshot;
  }

  const { image_url: _imageUrl, ...rest } = snapshot as Record<string, unknown>;
  return rest;
};

const createAuditSnapshot = (note: unknown) => JSON.parse(JSON.stringify(sanitizeSnapshot(note)));

type OcrRecord = Record<string, unknown>;

type NormalizedOcrItem = {
  item_name: string;
  qty: number;
  price: number;
  subtotal: number;
};

type NormalizedOcrData = {
  date: string;
  buyer_name: string;
  requester_name: string;
  total: number;
  items: NormalizedOcrItem[];
};

type OcrProcessResult = {
  imageUrl: string;
  ocrData: NormalizedOcrData;
  message: string;
};

type OcrJob = {
  status: 'processing' | 'completed' | 'failed';
  createdAt: number;
  result?: OcrProcessResult;
  error?: string;
};

class OcrProcessingError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ocrJobs = new Map<string, OcrJob>();
const OCR_JOB_TTL_MS = 15 * 60 * 1000;

const isRecord = (value: unknown): value is OcrRecord => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const pickValue = (record: OcrRecord, keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
};

const getTextValue = (record: OcrRecord, keys: string[]) => {
  const value = pickValue(record, keys);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const toOcrNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'string') {
    const normalized = value
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.');
    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const todayIsoDate = () => new Date().toISOString().split('T')[0];

const normalizeOcrDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return todayIsoDate();

  const trimmed = value.trim();
  const isoDate = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const numericDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numericDate) {
    const [, day, month, year] = numericDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return todayIsoDate();

  return parsed.toISOString().split('T')[0];
};

const receiptShapeKeys = [
  'date', 'tanggal', 'transaction_date', 'invoice_date', 'receipt_date',
  'buyer_name', 'buyerName', 'store_name', 'storeName', 'merchant_name',
  'items', 'line_items', 'lineItems', 'products', 'details',
  'total', 'total_amount', 'grand_total', 'amount',
];

const nestedOcrKeys = [
  'ocrData', 'data', 'result', 'receipt', 'receipt_data', 'receiptData',
  'invoice', 'transaction', 'extracted_data', 'extractedData',
];

const hasReceiptShape = (record: OcrRecord) => (
  receiptShapeKeys.some((key) => record[key] !== undefined)
);

const unwrapOcrData = (raw: unknown): unknown => {
  if (!isRecord(raw)) return raw;
  if (hasReceiptShape(raw)) return raw;

  for (const key of nestedOcrKeys) {
    const nested = raw[key];
    if (isRecord(nested) && (hasReceiptShape(nested) || nestedOcrKeys.some((nestedKey) => nested[nestedKey] !== undefined))) {
      return unwrapOcrData(nested);
    }
  }

  return raw;
};

const normalizeOcrItems = (rawItems: unknown): NormalizedOcrItem[] => {
  const itemList = Array.isArray(rawItems)
    ? rawItems
    : isRecord(rawItems)
      ? Object.values(rawItems)
      : [];

  return itemList
    .map((item): NormalizedOcrItem | null => {
      if (typeof item === 'string' && item.trim()) {
        return { item_name: item.trim(), qty: 1, price: 0, subtotal: 0 };
      }

      if (!isRecord(item)) return null;

      const itemName = getTextValue(item, [
        'item_name', 'itemName', 'name', 'description', 'product_name',
        'productName', 'nama_barang', 'barang', 'produk',
      ]) || 'Unrecognized Item';
      const qty = Math.max(1, toOcrNumber(pickValue(item, ['qty', 'quantity', 'jumlah', 'kuantitas']), 1));
      const subtotalValue = toOcrNumber(pickValue(item, ['subtotal', 'total', 'amount', 'jumlah_harga']));
      const priceValue = toOcrNumber(pickValue(item, ['price', 'unit_price', 'unitPrice', 'harga', 'harga_satuan']));
      const price = priceValue > 0 ? priceValue : subtotalValue > 0 ? subtotalValue / qty : 0;
      const subtotal = subtotalValue > 0 ? subtotalValue : qty * price;

      return {
        item_name: itemName,
        qty,
        price,
        subtotal,
      };
    })
    .filter((item): item is NormalizedOcrItem => item !== null);
};

const normalizeReceiptOcrData = (raw: unknown): NormalizedOcrData => {
  const unwrapped = unwrapOcrData(raw);
  const record = isRecord(unwrapped) ? unwrapped : {};
  const rawItems = pickValue(record, ['items', 'line_items', 'lineItems', 'products', 'details', 'item_details']);
  const items = normalizeOcrItems(rawItems);
  const itemTotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const total = toOcrNumber(pickValue(record, [
    'total', 'total_amount', 'totalAmount', 'grand_total', 'grandTotal',
    'amount', 'total_belanja', 'total_tagihan', 'jumlah',
  ]), itemTotal);
  const finalTotal = total > 0 ? total : itemTotal;
  const finalItems = items.length > 0
    ? items
    : [{ item_name: 'Unrecognized Items', qty: 1, price: finalTotal, subtotal: finalTotal }];

  return {
    date: normalizeOcrDate(pickValue(record, ['date', 'tanggal', 'transaction_date', 'transactionDate', 'invoice_date', 'receipt_date'])),
    buyer_name: getTextValue(record, [
      'buyer_name', 'buyerName', 'store_name', 'storeName', 'merchant_name',
      'merchantName', 'supplier_name', 'vendor_name', 'nama_pembeli',
      'nama_toko', 'nama_merchant', 'seller_name',
    ]) || 'Unknown Store',
    requester_name: getTextValue(record, ['requester_name', 'requesterName', 'requester', 'nama_requester']),
    total: finalTotal,
    items: finalItems,
  };
};

const buildOcrSuccess = (imageUrl: string, rawOcrData: unknown, message: string): OcrProcessResult => {
  const ocrData = normalizeReceiptOcrData(rawOcrData);
  console.log(`[OCR] Normalized result -> date=${ocrData.date}, buyer="${ocrData.buyer_name}", items=${ocrData.items.length}, total=${ocrData.total}`);
  return { imageUrl, ocrData, message };
};

const sendOcrSuccess = (res: Response, imageUrl: string, rawOcrData: unknown, message: string) => {
  const result = buildOcrSuccess(imageUrl, rawOcrData, message);
  sendSuccess(res, { imageUrl: result.imageUrl, ocrData: result.ocrData }, result.message);
};

const buildPrompt = () => `
Analisa gambar struk/invoice ini dengan teliti.
Ekstrak data dan kembalikan HANYA dalam format JSON mentah tanpa markdown, komentar, atau teks tambahan apapun.

FORMAT JSON YANG HARUS DIKEMBALIKAN:
{
  "date": "YYYY-MM-DD",
  "buyer_name": "Nama Pembeli / Nama Toko Penjual",
  "requester_name": "",
  "total": angka_total_akhir_tagihan,
  "items": [
    {
      "item_name": "Nama Barang",
      "qty": jumlah_barang,
      "price": harga_satuan,
      "subtotal": subtotal_per_item
    }
  ]
}

ATURAN WAJIB:
1. FORMAT ANGKA: Gunakan standar Indonesia. Titik (.) adalah pemisah ribuan, BUKAN desimal. 
   Contoh: "Rp 32.500" -> 32500, "Rp 1.200.000" -> 1200000.
2. ONGKOS KIRIM / BIAYA PENGIRIMAN: Jika ada baris ongkir (JNE, JNT, TIKI, dsb), 
   WAJIB dimasukkan ke dalam array "items" sebagai satu item terpisah dengan:
   - item_name: nama layanan pengiriman (misal "JNE Reguler")
   - qty: 1 (SELALU 1, bukan berat dalam kg)
   - price: biaya ongkir (angka flat, bukan qty x harga)
   - subtotal: sama dengan price
3. TOTAL: Gunakan angka total yang tertera di struk. Jika tidak ada, jumlahkan semua subtotal item + ongkir.
4. TANGGAL: Jika tidak ditemukan, gunakan tanggal hari ini dalam format YYYY-MM-DD.
5. QTY: Jika tidak terbaca, isi dengan 1.
6. JANGAN bungkus JSON di dalam key lain seperti "data", "receipt", atau "result".
`;

// Helper: cek apakah error adalah rate limit / quota habis
const isRateLimitError = (err: any): boolean => {
  const msg = JSON.stringify(err?.message || err || '');
  return msg.includes('429') || 
         msg.includes('RESOURCE_EXHAUSTED') || 
         msg.includes('quota') ||
         msg.includes('rate_limit') ||
         msg.includes('rate limit');
};

const processUploadedReceipt = async (file: Express.Multer.File): Promise<OcrProcessResult> => {
  console.log('>>> [BACKEND] Processing uploaded receipt');
  console.log(`>>> [BACKEND] File received: ${file.originalname}, Size: ${file.size} bytes, Mime: ${file.mimetype}`);

  const imageBase64 = file.buffer.toString('base64');
  const imageDataUri = `data:${file.mimetype};base64,${imageBase64}`;
  const isPdf = file.mimetype === 'application/pdf';
  const prompt = buildPrompt();

  // ==========================================
  // LAYER 1: GEMINI API
  // Strategi: Key luar x Model dalam
  // Kalau satu model kena quota -> langsung skip ke model berikutnya (bukan retry)
  // ==========================================
  const geminiKeys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter((key): key is string => !!key && key.trim() !== '');

  console.log(`=== LAYER 1: Gemini API (${geminiKeys.length} Key x ${GEMINI_MODELS.length} Model) ===`);

  for (let keyIdx = 0; keyIdx < geminiKeys.length; keyIdx++) {
    const ai = new GoogleGenAI({ apiKey: geminiKeys[keyIdx] });

    for (const model of GEMINI_MODELS) {
      console.log(`[Gemini] Key ${keyIdx + 1}/${geminiKeys.length} + Model "${model}"...`);

      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            prompt,
            { inlineData: { data: imageBase64, mimeType: file.mimetype } }
          ]
        });

        const rawResponse = response.text || "{}";
        const cleanJsonString = rawResponse.replace(/```json|```/gi, "").trim();
        const ocrData = JSON.parse(cleanJsonString);

        console.log(`=== GEMINI SUKSES: Key ${keyIdx + 1}, Model "${model}" ===`);
        return buildOcrSuccess(imageDataUri, ocrData, `Processed by Gemini (${model})`);

      } catch (err: any) {
        if (isRateLimitError(err)) {
          console.warn(`[Gemini] Key ${keyIdx + 1} + "${model}" -> Quota habis, coba model/key berikutnya.`);
        } else {
          console.warn(`[Gemini] Key ${keyIdx + 1} + "${model}" -> Error: ${err?.message || err}`);
        }
        // Lanjut ke model berikutnya
      }
    }
  }

  console.warn('❌ Semua kombinasi Gemini Key+Model habis quota / gagal. Fallback ke Groq Vision...');

  if (isPdf) {
    throw new OcrProcessingError(422, 'PDF processing requires an available Gemini API key');
  }

  // ==========================================
  // LAYER 2: GROQ VISION API (2 Key x 2 Model)
  // ==========================================
  const groqKeys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
  ].filter((key): key is string => !!key && key.trim() !== '');

  for (let gkIdx = 0; gkIdx < groqKeys.length; gkIdx++) {
    const groqClient = new OpenAI({
      apiKey: groqKeys[gkIdx],
      baseURL: 'https://api.groq.com/openai/v1'
    });

    for (const model of GROQ_VISION_MODELS) {
      try {
        console.log(`=== LAYER 2: Groq Vision Key ${gkIdx + 1}/${groqKeys.length} + "${model}" ===`);
        const groqResponse = await groqClient.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageDataUri } }
              ]
            }
          ],
          temperature: 0.1,
        });

        const rawResponse = groqResponse.choices[0].message.content || "{}";
        const cleanJsonString = rawResponse.replace(/```json|```/gi, "").trim();
        const ocrData = JSON.parse(cleanJsonString);

        console.log(`=== GROQ VISION SUKSES: Key ${gkIdx + 1}, "${model}" ===`);
        return buildOcrSuccess(imageDataUri, ocrData, `Processed by Groq Vision (${model})`);

      } catch (groqError: any) {
        console.error(`❌ Groq Vision Key ${gkIdx + 1} + "${model}" gagal:`, groqError?.error?.message || groqError?.message);
      }
    }
  }

  console.warn('❌ Semua Groq Vision gagal. Fallback ke Mistral AI...');

  // ==========================================
  // LAYER 3: MISTRAL AI VISION (pixtral models)
  // ==========================================
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    const mistralClient = new OpenAI({
      apiKey: mistralKey,
      baseURL: 'https://api.mistral.ai/v1'
    });

    for (const model of MISTRAL_MODELS) {
      try {
        console.log(`=== LAYER 3: Mistral AI "${model}" ===`);
        const mistralResponse = await mistralClient.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageDataUri } }
              ]
            }
          ],
          temperature: 0.1,
        });

        const rawResponse = mistralResponse.choices[0].message.content || "{}";
        const cleanJsonString = rawResponse.replace(/```json|```/gi, "").trim();
        const ocrData = JSON.parse(cleanJsonString);

        console.log(`=== MISTRAL AI SUKSES: "${model}" ===`);
        return buildOcrSuccess(imageDataUri, ocrData, `Processed by Mistral AI (${model})`);

      } catch (mistralError: any) {
        console.error(`❌ Mistral AI "${model}" gagal:`, mistralError?.error?.message || mistralError?.message);
      }
    }
  }

  console.warn('❌ Semua Mistral AI gagal. Fallback ke OpenRouter...');

  // ==========================================
  // LAYER 4: OPENROUTER.AI VISION (free models)
  // ==========================================
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    const openrouterClient = new OpenAI({
      apiKey: openrouterKey,
      baseURL: 'https://openrouter.ai/api/v1'
    });

    for (const model of OPENROUTER_MODELS) {
      try {
        console.log(`=== LAYER 4: OpenRouter "${model}" ===`);
        const orResponse = await openrouterClient.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageDataUri } }
              ]
            }
          ],
          temperature: 0.1,
        });

        const rawResponse = orResponse.choices[0].message.content || "{}";
        const cleanJsonString = rawResponse.replace(/```json|```/gi, "").trim();
        const ocrData = JSON.parse(cleanJsonString);

        console.log(`=== OPENROUTER SUKSES: "${model}" ===`);
        return buildOcrSuccess(imageDataUri, ocrData, `Processed by OpenRouter (${model})`);

      } catch (orError: any) {
        console.error(`❌ OpenRouter "${model}" gagal:`, orError?.error?.message || orError?.message);
      }
    }
  }

  console.warn('❌ Semua AI Vision gagal. Fallback ke Tesseract + Groq Text...');

  // ==========================================
  // LAYER 5: TESSERACT.JS + GROQ TEXT (Last Resort AI)
  // ==========================================
  try {
    console.log("=== LAYER 5: Tesseract.js + Groq Text ===");
    const { data: { text } } = await Tesseract.recognize(file.buffer, 'ind+eng');

    console.log("=== RAW TEXT DARI TESSERACT ===\n", text, "\n===============================");

    const groqTextClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY || '',
      baseURL: 'https://api.groq.com/openai/v1'
    });

    const groqTextResponse = await groqTextClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Anda adalah asisten data entry akuntan dari Indonesia. Tugas Anda adalah mengekstrak teks mentah hasil OCR dari struk/invoice ke format JSON yang bersih dan akurat.

ATURAN WAJIB:
1. FORMAT ANGKA: Teks menggunakan standar Indonesia di mana TITIK (.) adalah pemisah ribuan.
   "32.500" -> 32500 | "14.900" -> 14900 | "86.300" -> 86300. JANGAN anggap titik sebagai desimal!
2. ONGKOS KIRIM: Jika ada baris ongkir (JNE, JNT, TIKI, Pos, Anteraja, dsb), masukkan ke "items" dengan:
   - qty: SELALU 1 (bukan berat dalam kg)
   - price & subtotal: biaya ongkir flat (bukan qty x harga)
   Contoh: "JNE - Reguler  0.39 kg  Rp 24.000" -> qty: 1, price: 24000, subtotal: 24000
3. VALIDASI TOTAL: Jumlahkan semua subtotal item. Jika angka total dari OCR terlihat terpotong/salah, gunakan hasil hitungan Anda.
4. Kembalikan HANYA JSON tanpa markdown atau teks lain.

FORMAT JSON:
{
  "date": "YYYY-MM-DD",
  "buyer_name": "Nama",
  "total": angka,
  "items": [{"item_name": "...", "qty": angka, "price": angka, "subtotal": angka}]
}`
        },
        {
          role: "user",
          content: `Berikut adalah teks OCR mentahnya:\n\n${text}`
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const rawJsonResponse = groqTextResponse.choices[0].message.content || "{}";
    const ocrData = JSON.parse(rawJsonResponse);

    console.log("=== TESSERACT + GROQ TEXT: SUKSES ===");
    return buildOcrSuccess(imageDataUri, ocrData, 'Processed by Tesseract + Groq Text');

  } catch (finalError: any) {
    console.error('❌ Groq Text juga gagal. Fallback ke Regex lokal murni...', finalError?.message);
    const { data: { text } } = await Tesseract.recognize(file.buffer, 'ind+eng');
    const ocrData = parseReceiptText(text);
    return buildOcrSuccess(imageDataUri, ocrData, 'Processed by pure Tesseract regex fallback');
  }
};

const cleanupOcrJobs = () => {
  const now = Date.now();
  for (const [jobId, job] of ocrJobs.entries()) {
    if (now - job.createdAt > OCR_JOB_TTL_MS) {
      ocrJobs.delete(jobId);
    }
  }
};

export const uploadNoteImageAsync = async (req: Request, res: Response): Promise<void> => {
  console.log('>>> [BACKEND] Received async /upload request');
  try {
    if (!req.file) {
      console.log('>>> [BACKEND] No file found in request');
      sendError(res, 400, 'No file uploaded');
      return;
    }

    cleanupOcrJobs();
    const file = req.file;
    const jobId = randomUUID();
    ocrJobs.set(jobId, { status: 'processing', createdAt: Date.now() });

    processUploadedReceipt(file)
      .then((result) => {
        ocrJobs.set(jobId, { status: 'completed', createdAt: Date.now(), result });
      })
      .catch((error: any) => {
        console.error('Async OCR job failed:', error);
        ocrJobs.set(jobId, {
          status: 'failed',
          createdAt: Date.now(),
          error: error?.message || 'Internal server error during processing',
        });
      });

    sendSuccess(res, { jobId, status: 'processing' }, 'OCR job started');

  } catch (error) {
    console.error('Fatal Error starting OCR processing:', error);
    sendError(res, 500, 'Internal server error during processing');
  }
};

export const getUploadJobStatus = async (req: Request, res: Response): Promise<void> => {
  cleanupOcrJobs();
  const { jobId } = req.params as { jobId: string };
  const job = ocrJobs.get(jobId);

  if (!job) {
    sendError(res, 404, 'OCR job not found or expired');
    return;
  }

  if (job.status === 'completed' && job.result) {
    sendSuccess(res, {
      jobId,
      status: job.status,
      result: { imageUrl: job.result.imageUrl, ocrData: job.result.ocrData },
    }, job.result.message);
    return;
  }

  if (job.status === 'failed') {
    sendSuccess(res, { jobId, status: job.status, error: job.error || 'OCR processing failed' }, 'OCR job failed');
    return;
  }

  sendSuccess(res, { jobId, status: job.status }, 'OCR job is still processing');
};

export const uploadNoteImage = async (req: Request, res: Response): Promise<void> => {
  console.log('>>> [BACKEND] Received /upload request');
  try {
    if (!req.file) {
      console.log('>>> [BACKEND] No file found in request');
      sendError(res, 400, 'No file uploaded');
      return;
    }

    const result = await processUploadedReceipt(req.file);
    sendSuccess(res, { imageUrl: result.imageUrl, ocrData: result.ocrData }, result.message);
  } catch (error: any) {
    console.error('Fatal Error during OCR processing:', error);
    sendError(res, error?.statusCode || 500, error?.message || 'Internal server error during processing');
  }
};

export const createNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, buyer_name, requester_name, category_id, total, image_url, items } = req.body;
    const userId = (req as any).user.id;

    if (!date || !buyer_name || !requester_name || !category_id || !items || !Array.isArray(items) || items.length === 0) {
      sendError(res, 400, 'Missing required fields or items are empty');
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      let buyer = await tx.person.findFirst({ where: { name: buyer_name } });
      if (!buyer) buyer = await tx.person.create({ data: { name: buyer_name } });

      let requester = await tx.person.findFirst({ where: { name: requester_name } });
      if (!requester) requester = await tx.person.create({ data: { name: requester_name } });

      const note = await tx.note.create({
        data: {
          date: new Date(date),
          buyer_id: buyer.id,
          requester_id: requester.id,
          category_id,
          total,
          image_url,
          created_by: userId,
          items: {
            create: items.map((item: any) => ({
              item_name: item.item_name,
              qty: item.qty,
              price: item.price,
              subtotal: item.subtotal
            }))
          }
        },
        include: { items: true }
      });

      await tx.noteVersion.create({
        data: {
          note_id: note.id,
          version_number: 1,
          snapshot: createAuditSnapshot(note),
          updated_by: userId
        }
      });

      const user = await tx.user.findUnique({ where: { id: userId } });
      await tx.notification.create({
        data: { message: `New receipt for ${buyer_name} created by ${user?.name || 'Unknown'}` }
      });

      return note;
    });
    syncToN8n(result);

    // Don't send back the huge base64 image_url in response
    const { image_url: _img1, ...lightResult } = result as any;
    sendSuccess(res, lightResult, 'Note created successfully');
  } catch (error) {
    console.error('Error creating note:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string)?.trim() || '';

    const whereCondition: any = { deleted_at: null };

    // Add search filter: search across buyer name, requester name, category name
    if (search) {
      whereCondition.OR = [
        { buyer: { name: { contains: search, mode: 'insensitive' } } },
        { requester: { name: { contains: search, mode: 'insensitive' } } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
        { category: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where: whereCondition,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          buyer_id: true,
          requester_id: true,
          category_id: true,
          total: true,
          created_by: true,
          created_at: true,
          updated_at: true,
          deleted_at: true,
          buyer: { select: { name: true } },
          requester: { select: { name: true } },
          category: { select: { name: true, code: true } },
          user: { select: { name: true } }
        }
      }),
      prisma.note.count({ where: whereCondition })
    ]);

    sendSuccess(res, {
      notes,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, 'Notes retrieved successfully');
  } catch (error) {
    console.error('Error getting notes:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const getNoteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const note = await prisma.note.findFirst({
      where: { id, deleted_at: null },
      include: {
        items: true,
        buyer: { select: { name: true } },
        requester: { select: { name: true } },
        category: true
      }
    });

    if (!note) { sendError(res, 404, 'Note not found'); return; }
    sendSuccess(res, note, 'Note retrieved successfully');
  } catch (error) {
    console.error('Error getting note by id:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const updateNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { date, buyer_name, requester_name, category_id, total, image_url, items } = req.body;
    const userId = (req as any).user.id;

    if (!date || !buyer_name || !requester_name || !category_id || !items || !Array.isArray(items) || items.length === 0) {
      sendError(res, 400, 'Missing required fields or items are empty');
      return;
    }

    const existingNote = await prisma.note.findFirst({ where: { id, deleted_at: null } });
    if (!existingNote) { sendError(res, 404, 'Note not found'); return; }

    const result = await prisma.$transaction(async (tx) => {
      let buyer = await tx.person.findFirst({ where: { name: buyer_name } });
      if (!buyer) buyer = await tx.person.create({ data: { name: buyer_name } });

      let requester = await tx.person.findFirst({ where: { name: requester_name } });
      if (!requester) requester = await tx.person.create({ data: { name: requester_name } });

      await tx.noteItem.deleteMany({ where: { note_id: id } });

      const updatedNote = await tx.note.update({
        where: { id },
        data: {
          date: new Date(date),
          buyer_id: buyer.id,
          requester_id: requester.id,
          category_id,
          total,
          image_url: image_url || existingNote.image_url,
          items: {
            create: items.map((item: any) => ({
              item_name: item.item_name,
              qty: item.qty,
              price: item.price,
              subtotal: item.subtotal
            }))
          }
        },
        include: { items: true, buyer: true, requester: true, category: true }
      });

      const lastVersion = await tx.noteVersion.findFirst({
        where: { note_id: id },
        orderBy: { version_number: 'desc' }
      });
      const nextVersion = lastVersion ? lastVersion.version_number + 1 : 1;

      await tx.noteVersion.create({
        data: {
          note_id: id,
          version_number: nextVersion,
          snapshot: createAuditSnapshot(updatedNote),
          updated_by: userId
        }
      });

      const user = await tx.user.findUnique({ where: { id: userId } });
      await tx.notification.create({
        data: { message: `Receipt for ${buyer_name} updated to v${nextVersion} by ${user?.name || 'Unknown'}` }
      });

      return updatedNote;
    });
    syncToN8n(result);

    // Don't send back the huge base64 image_url in response
    const { image_url: _img2, ...lightResult } = result as any;
    sendSuccess(res, lightResult, 'Note updated successfully');
  } catch (error) {
    console.error('Error updating note:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const deleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const userId = (req as any).user.id;

    const existingNote = await prisma.note.findFirst({
      where: { id, deleted_at: null },
      include: { buyer: true }
    });

    if (!existingNote) {
      sendError(res, 404, 'Note not found');
      return;
    }

    await prisma.note.update({
      where: { id },
      data: { deleted_at: new Date() }
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.notification.create({
      data: { message: `Receipt for ${existingNote.buyer.name} deleted by ${user?.name || 'Unknown'}` }
    });

    sendSuccess(res, null, 'Note deleted successfully');
  } catch (error) {
    console.error('Error deleting note:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const getAllAuditTrails = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;

    const [recentNotes, total] = await Promise.all([
      prisma.note.findMany({
        orderBy: { updated_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          updated_at: true,
          deleted_at: true,
          buyer: { select: { name: true } },
          versions: { orderBy: { version_number: 'desc' } }
        }
      }),
      prisma.note.count()
    ]);

    const userIds = new Set<string>();
    recentNotes.forEach(note => note.versions.forEach(v => userIds.add(v.updated_by)));
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(userIds) } } });
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const groupedResponse = recentNotes.map(note => {
      const versionMap = new Map();
      note.versions.forEach(v => versionMap.set(v.version_number, sanitizeSnapshot(v.snapshot)));
      return {
        note_id: note.id,
        buyer_name: note.buyer?.name || 'Unknown',
        latest_update: note.updated_at,
        deleted_at: note.deleted_at,
        versions: note.versions.map(v => ({
          id: v.id,
          version_number: v.version_number,
          snapshot: sanitizeSnapshot(v.snapshot),
          previous_snapshot: v.version_number > 1 ? (versionMap.get(v.version_number - 1) || null) : null,
          updated_by_name: userMap[v.updated_by] || 'Unknown',
          updated_at: v.updated_at,
          note_id: v.note_id,
          buyer_name: note.buyer?.name || 'Unknown'
        }))
      };
    });

    sendSuccess(res, {
      data: groupedResponse.filter(g => g.versions.length > 0),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }, 'Audit trail retrieved');
  } catch (error) {
    console.error('Error getting global audit trail:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const getNoteAuditTrail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const versions = await prisma.noteVersion.findMany({
      where: { note_id: id },
      orderBy: { version_number: 'asc' }
    });

    const userIds = [...new Set(versions.map(v => v.updated_by))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const formattedVersions = versions.map((v) => ({
      id: v.id,
      version_number: v.version_number,
      snapshot: sanitizeSnapshot(v.snapshot),
      updated_by_name: userMap[v.updated_by] || 'Unknown',
      updated_at: v.updated_at
    }));

    sendSuccess(res, formattedVersions, 'Audit trail retrieved');
  } catch (error) {
    console.error('Error getting audit trail:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const restoreNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const userId = (req as any).user.id;

    const existingNote = await prisma.note.findFirst({
      where: { id, deleted_at: { not: null } },
      include: { buyer: true }
    });

    if (!existingNote) {
      sendError(res, 404, 'Deleted note not found');
      return;
    }

    await prisma.note.update({
      where: { id },
      data: { deleted_at: null }
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.notification.create({
      data: { message: `Receipt for ${existingNote.buyer.name} restored by ${user?.name || 'Unknown'}` }
    });

    sendSuccess(res, null, 'Note restored successfully');
  } catch (error) {
    console.error('Error restoring note:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const permanentDeleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const userId = (req as any).user.id;

    const note = await prisma.note.findFirst({
      where: { id, deleted_at: { not: null } },
      include: { buyer: true }
    });

    if (!note) {
      sendError(res, 404, 'Deleted note not found');
      return;
    }

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete all audit versions
      await tx.noteVersion.deleteMany({ where: { note_id: id } });
      // Delete all items
      await tx.noteItem.deleteMany({ where: { note_id: id } });
      // Delete the note itself
      await tx.note.delete({ where: { id } });
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.notification.create({
      data: { message: `Receipt for ${note.buyer.name} permanently deleted by ${user?.name || 'Unknown'}` }
    });

    sendSuccess(res, null, 'Note permanently deleted');
  } catch (error) {
    console.error('Error permanently deleting note:', error);
    sendError(res, 500, 'Internal server error');
  }
};
