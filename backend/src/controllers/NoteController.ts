import { Request, Response } from 'express';
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
  'gemini-2.0-flash',               // Fallback stabil
  'gemini-2.0-flash-lite',          // Quota lebih longgar, last resort
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

const buildPrompt = () => `
Analisa gambar struk/invoice ini dengan teliti.
Ekstrak data dan kembalikan HANYA dalam format JSON mentah tanpa markdown, komentar, atau teks tambahan apapun.

FORMAT JSON YANG HARUS DIKEMBALIKAN:
{
  "date": "YYYY-MM-DD",
  "buyer_name": "Nama Pembeli / Nama Toko Penjual",
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

export const uploadNoteImage = async (req: Request, res: Response): Promise<void> => {
  console.log('>>> [BACKEND] Received /upload request');
  try {
    if (!req.file) {
      console.log('>>> [BACKEND] No file found in request');
      sendError(res, 400, 'No file uploaded');
      return;
    }

    console.log(`>>> [BACKEND] File received: ${req.file.originalname}, Size: ${req.file.size} bytes, Mime: ${req.file.mimetype}`);
    const imageBase64 = req.file.buffer.toString('base64');
    const imageDataUri = `data:${req.file.mimetype};base64,${imageBase64}`;
    const prompt = buildPrompt();

    // ==========================================
    // LAYER 1: GEMINI API
    // Strategi: Key luar x Model dalam
    // Kalau satu model kena quota -> langsung skip ke model berikutnya (bukan retry)
    // Urutan: Key1+Flash -> Key1+FlashLite -> Key1+1.5Flash -> Key2+Flash -> dst
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
              { inlineData: { data: imageBase64, mimeType: req.file!.mimetype } }
            ]
          });

          const rawResponse = response.text || "{}";
          const cleanJsonString = rawResponse.replace(/```json|```/gi, "").trim();
          const ocrData = JSON.parse(cleanJsonString);

          console.log(`=== GEMINI SUKSES: Key ${keyIdx + 1}, Model "${model}" ===`);
          sendSuccess(res, { imageUrl: imageDataUri, ocrData }, `Processed by Gemini (${model})`);
          return;

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
          sendSuccess(res, { imageUrl: imageDataUri, ocrData }, `Processed by Groq Vision (${model})`);
          return;

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
          sendSuccess(res, { imageUrl: imageDataUri, ocrData }, `Processed by Mistral AI (${model})`);
          return;

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
          sendSuccess(res, { imageUrl: imageDataUri, ocrData }, `Processed by OpenRouter (${model})`);
          return;

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
      const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'ind+eng');

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
      sendSuccess(res, { imageUrl: imageDataUri, ocrData }, 'Processed by Tesseract + Groq Text');
      return;

    } catch (finalError: any) {
      console.error('❌ Groq Text juga gagal. Fallback ke Regex lokal murni...', finalError?.message);
      const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'ind+eng');
      const ocrData = parseReceiptText(text);
      sendSuccess(res, { imageUrl: imageDataUri, ocrData }, 'Processed by pure Tesseract regex fallback');
    }

  } catch (error) {
    console.error('Fatal Error during OCR processing:', error);
    sendError(res, 500, 'Internal server error during processing');
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
          snapshot: JSON.parse(JSON.stringify(note)),
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
        include: {
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
          snapshot: JSON.parse(JSON.stringify(updatedNote)),
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

    const note = await prisma.note.update({
      where: { id },
      data: { deleted_at: new Date() },
      include: { buyer: true }
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.notification.create({
      data: { message: `Receipt for ${note.buyer.name} deleted by ${user?.name || 'Unknown'}` }
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
        include: {
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
      note.versions.forEach(v => versionMap.set(v.version_number, v.snapshot));
      return {
        note_id: note.id,
        buyer_name: note.buyer?.name || 'Unknown',
        latest_update: note.updated_at,
        deleted_at: note.deleted_at,
        versions: note.versions.map(v => ({
          id: v.id,
          version_number: v.version_number,
          snapshot: v.snapshot,
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
      snapshot: v.snapshot,
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

    const note = await prisma.note.update({
      where: { id },
      data: { deleted_at: null },
      include: { buyer: true }
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.notification.create({
      data: { message: `Receipt for ${note.buyer.name} restored by ${user?.name || 'Unknown'}` }
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

    const note = await prisma.note.findUnique({
      where: { id },
      include: { buyer: true }
    });

    if (!note) {
      sendError(res, 404, 'Note not found');
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