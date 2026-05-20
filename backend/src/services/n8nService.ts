import axios from 'axios';
import prisma from '../config/prisma';

export const syncToN8n = async (noteData: any) => {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    // Kita "jemput" data lengkap (nama buyer & requester) di sini
    const enrichedNote = await prisma.note.findUnique({
      where: { id: noteData.id },
      include: {
        items: true,
        buyer: true,
        requester: true,
      }
    });

    if (!enrichedNote) return;

    // Kirim data yang sudah lengkap ke n8n
    axios.post(webhookUrl, enrichedNote, { timeout: 5000 })
      .then(() => console.log(`[n8n Sync] Sukses: ${enrichedNote.id}`))
      .catch((err) => console.error(`[n8n Sync] Gagal: ${err.message}`));
  } catch (error) {
    console.error('[n8n Sync] Error:', error);
  }
};