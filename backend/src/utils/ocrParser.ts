export interface OcrResult {
  date: string;
  buyer_name: string;
  requester_name: string;
  total: number;
  items: Array<{
    item_name: string;
    qty: number;
    price: number;
    subtotal: number;
  }>;
}

export function parseReceiptText(text: string): OcrResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let buyer_name = 'Unknown Store';
  let date = new Date().toISOString().split('T')[0];
  let total = 0;
  const items: OcrResult['items'] = [];

  const cleanNumber = (str: string) => parseInt(str.replace(/[^\d]/g, ''), 10);

  // 1. Buyer Name
  for (const line of lines) {
    if (/pt\.|cv\.|toko|tokopedia|shopee|indomaret|alfamart|superindo/i.test(line)) {
      buyer_name = line;
      break;
    }
  }
  if (buyer_name === 'Unknown Store' && lines.length > 0) {
    const validLines = lines.filter(l => l.length > 3 && /[a-zA-Z]/.test(l));
    if (validLines.length > 0) buyer_name = validLines[0];
  }

  // 2. Date
  const dateRegexNumeric = /(\d{2})[\/\-.]\s*(\d{2})[\/\-.]\s*(\d{2,4})|(\d{4})[\/\-.]\s*(\d{2})[\/\-.]\s*(\d{2})/;
  const dateRegexText = /(\d{1,2})\s+(jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)[a-z]*\s+(\d{4})/i;
  const monthMap: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', jun: '06', jul: '07', agu: '08', sep: '09', okt: '10', nov: '11', des: '12' };

  for (const line of lines) {
    const textMatch = line.match(dateRegexText);
    if (textMatch) {
      const d = textMatch[1].padStart(2, '0');
      const m = monthMap[textMatch[2].toLowerCase().substring(0, 3)] || '01';
      const y = textMatch[3];
      date = `${y}-${m}-${d}`;
      break;
    }
    const match = line.match(dateRegexNumeric);
    if (match) {
      if (match[1]) {
        const y = match[3].length === 2 ? `20${match[3]}` : match[3];
        date = `${y}-${match[2]}-${match[1]}`;
        break;
      } else if (match[4]) {
        date = `${match[4]}-${match[5]}-${match[6]}`;
        break;
      }
    }
  }

  // 3. Cari Total
  const bottomLines = lines.slice(-20); 
  const explicitTotalRegex = /(?:total|grand total|tagihan|amount)\s*[:=]?\s*(?:rp\.?)?\s*([0-9.,]+)/i;
  
  for (let i = bottomLines.length - 1; i >= 0; i--) {
     const match = bottomLines[i].match(explicitTotalRegex);
     if (match) {
         const parsed = cleanNumber(match[1]);
         if (parsed > 0) {
             total = parsed;
             break;
         }
     }
  }
  if (total === 0) {
      const potentialTotals: number[] = [];
      for (const line of bottomLines) {
          if (/\d{4}-\d{2}-\d{2}|\+\d{2}/.test(line)) continue;
          const match = line.match(/rp\s*[.,]?\s*(\d[0-9.,]*)/i);
          if (match) {
              const num = cleanNumber(match[1]);
              if (num > 1000) potentialTotals.push(num);
          }
      }
      if (potentialTotals.length > 0) total = Math.max(...potentialTotals);
  }

  // 4. Items (SUPER HYBRID)
  const itemPrices: number[] = [];
  const itemNames: string[] = [];
  let tempNameBlock = '';
  let isInSummaryZone = false;
  let tableStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
      if (/produk|jumlah|harga|satuan|item|deskripsi|qty|nama barang/i.test(lines[i])) {
          tableStartIndex = i + 1;
          break;
      }
  }
  if (tableStartIndex === 0 && lines.length > 3) tableStartIndex = 3;

  for (let i = tableStartIndex; i < lines.length; i++) {
    const line = lines[i];

    // RADAR KETAT: Begitu ketemu Ongkos, Biaya, Subtotal, langsung tutup tabel!
    if (/subtotal|ongkos|biaya|total\s*:|total belanja|total tagihan|layanan|jasa|tunai|cash|kembali|metode|admin|anda hemat/i.test(line)) {
        isInSummaryZone = true;
        // Simpan sisa nama barang sebelum zona ini jika ada
        if (tempNameBlock) {
            itemNames.push(tempNameBlock.trim());
            tempNameBlock = '';
        }
    }
    if (isInSummaryZone) continue;
    if (/diskon|discount/i.test(line)) continue;

    // STRATEGI THERMAL (Cari baris lurus Indomaret)
    const thermalMatch = line.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+([0-9.,]{3,})\s+([0-9.,]{4,})/);
    if (thermalMatch && !/rp/i.test(line)) {
        if (tempNameBlock) {
            itemNames.push(tempNameBlock.trim());
            tempNameBlock = '';
        }
        const name = thermalMatch[1].trim();
        const qty = parseFloat(thermalMatch[2].replace(',', '.'));
        const price = cleanNumber(thermalMatch[3]);
        const subtotal = cleanNumber(thermalMatch[4]);
        
        if (name.length > 2 && subtotal >= 100) {
            items.push({ item_name: name, qty, price, subtotal });
        }
        continue;
    }

    // STRATEGI ZIP (Tampung teks dan harga Tokopedia)
    const priceMatch = line.match(/rp\s*[.,]?\s*(\d[0-9.,]*)/i) || line.match(/^([0-9]{1,3}(?:[.,][0-9]{3})+)$/);
    if (priceMatch) {
        const parsedPrice = cleanNumber(priceMatch[1]);
        if (parsedPrice >= 100 && parsedPrice !== total) {
            itemPrices.push(parsedPrice);
            // Begitu nemu harga, masukkan tampungan teks sebelumnya jadi nama barang
            if (tempNameBlock) {
                itemNames.push(tempNameBlock.trim());
                tempNameBlock = '';
            }
        }
    } else {
        // Abaikan teks sampah, sisanya gabungkan ke nama barang
        if (line.length > 3 && !/tokopedia|invoice|tanggal|alamat|produk|jumlah|harga|beli|diterbitkan|pembeli|penjual/i.test(line) && !/^\d+$/.test(line)) {
            tempNameBlock += (tempNameBlock ? ' ' : '') + line;
        }
    }
  }

  // Jika ada sisa nama belum dipasangkan
  if (tempNameBlock) {
      itemNames.push(tempNameBlock.trim());
  }

  // Pasangkan array Harga dan array Nama untuk struk lebar
  if (itemPrices.length > 0 || itemNames.length > 0) {
      const maxItems = Math.max(itemPrices.length, itemNames.length);
      for (let i = 0; i < maxItems; i++) {
          const price = itemPrices[i] || itemPrices[itemPrices.length - 1] || 0;
          const name = itemNames[i] || itemNames[itemNames.length - 1] || 'Unrecognized Item';
          items.push({ item_name: name, qty: 1, price: price, subtotal: price });
      }
  }

  if (items.length === 0) {
    items.push({
      item_name: 'Unrecognized Items', qty: 1, price: total > 0 ? total : 0, subtotal: total > 0 ? total : 0
    });
  }

  return { date, buyer_name, requester_name: '', total, items };
}