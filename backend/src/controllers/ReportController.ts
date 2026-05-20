import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendError } from '../utils/responseHandler';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// ─── Summary (Charts Data) ──────────────────────────────────────
export const getReportSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter: any = { deleted_at: null };
    if (startDate && endDate) {
      dateFilter.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    // Spending by Category
    const categorySpending = await prisma.note.groupBy({
      by: ['category_id'],
      where: dateFilter,
      _sum: { total: true },
      _count: true,
    });

    // Enrich with category names
    const categories = await prisma.category.findMany();
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

    const spendingByCategory = categorySpending.map(item => ({
      category_id: item.category_id,
      category_name: categoryMap[item.category_id]?.name ?? 'Unknown',
      category_code: categoryMap[item.category_id]?.code ?? '???',
      total: Number(item._sum.total ?? 0),
      count: item._count,
    }));

    // ─── FIX: Tentukan mode grouping berdasarkan rentang period ───
    // Hitung selisih hari antara startDate dan endDate
    let trendGroupMode: 'daily' | 'monthly' = 'monthly';
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      // Jika rentangnya <= 60 hari → tampilkan per hari, sisanya per bulan
      if (diffDays <= 60) {
        trendGroupMode = 'daily';
      }
    }

    // ─── FIX: Bangun WHERE clause untuk raw SQL dari dateFilter ───
    let whereClause = `WHERE deleted_at IS NULL`;
    const sqlParams: any[] = [];

    if (startDate && endDate) {
      sqlParams.push(new Date(startDate as string));
      sqlParams.push(new Date(endDate as string));
      whereClause += ` AND date >= $1 AND date <= $2`;
    }

    // ─── FIX: Query trends dengan dateFilter + grouping dinamis ───
    let monthlyTrends: Array<{ month: string; total: number }>;

    if (trendGroupMode === 'daily') {
      // Group per hari → field: 'date' (YYYY-MM-DD)
      if (sqlParams.length > 0) {
        monthlyTrends = await prisma.$queryRaw<Array<{ month: string; total: number }>>`
          SELECT TO_CHAR(date, 'YYYY-MM-DD') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
            AND date >= ${sqlParams[0]} AND date <= ${sqlParams[1]}
          GROUP BY TO_CHAR(date, 'YYYY-MM-DD')
          ORDER BY month ASC
        `;
      } else {
        monthlyTrends = await prisma.$queryRaw<Array<{ month: string; total: number }>>`
          SELECT TO_CHAR(date, 'YYYY-MM-DD') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
          GROUP BY TO_CHAR(date, 'YYYY-MM-DD')
          ORDER BY month ASC
        `;
      }
    } else {
      // Group per bulan → field: 'month' (YYYY-MM)
      if (sqlParams.length > 0) {
        monthlyTrends = await prisma.$queryRaw<Array<{ month: string; total: number }>>`
          SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
            AND date >= ${sqlParams[0]} AND date <= ${sqlParams[1]}
          GROUP BY TO_CHAR(date, 'YYYY-MM')
          ORDER BY month ASC
        `;
      } else {
        // All Time: tidak ada filter tanggal
        monthlyTrends = await prisma.$queryRaw<Array<{ month: string; total: number }>>`
          SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
          GROUP BY TO_CHAR(date, 'YYYY-MM')
          ORDER BY month ASC
        `;
      }
    }

    // Grand totals — tetap pakai dateFilter Prisma (sudah benar sejak awal)
    const totals = await prisma.note.aggregate({
      where: dateFilter,
      _sum: { total: true },
      _count: true,
    });

    sendSuccess(res, {
      spendingByCategory,
      monthlyTrends,
      // ─── BARU: Kirim mode ke frontend agar xAxisDataKey bisa otomatis ───
      trendGroupMode,
      totalSpend: Number(totals._sum.total ?? 0),
      noteCount: totals._count,
    }, 'Report summary retrieved');
  } catch (error) {
    console.error('Error getting report summary:', error);
    sendError(res, 500, 'Internal server error');
  }
};

// ─── Dashboard Stats ────────────────────────────────────────────
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = { deleted_at: null };
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;
    
    const totals = await prisma.note.aggregate({
      where,
      _sum: { total: true },
      _count: true,
    });

    const activeUsersCount = await prisma.user.count({
      where: { is_active: true }
    });

    const totalRecent = await prisma.note.count({ where });
    const recentReceipts = await prisma.note.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        date: true,
        total: true,
        created_at: true,
        buyer: { select: { name: true } },
        requester: { select: { name: true } },
        category: { select: { name: true } },
        user: { select: { name: true } },
      }
    });

    sendSuccess(res, {
      totalReceipts: totals._count,
      totalAmount: Number(totals._sum.total ?? 0),
      activeUsers: activeUsersCount,
      recentReceipts: recentReceipts.map(n => ({
        ...n,
        total: Number(n.total),
      })),
      recentPagination: {
        page,
        limit,
        total: totalRecent,
        totalPages: Math.ceil(totalRecent / limit),
      }
    }, 'Dashboard stats retrieved');
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    sendError(res, 500, 'Internal server error');
  }
};

// ─── Transaction list (Table) ───────────────────────────────────
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const { startDate, endDate, category_id } = req.query;

    const where: any = { deleted_at: null };
    if (startDate && endDate) {
      where.date = { gte: new Date(startDate as string), lte: new Date(endDate as string) };
    }
    if (category_id) where.category_id = category_id;

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          total: true,
          created_at: true,
          buyer: { select: { name: true } },
          requester: { select: { name: true } },
          category: { select: { name: true, code: true } },
          user: { select: { name: true } },
        }
      }),
      prisma.note.count({ where }),
    ]);

    sendSuccess(res, {
      notes: notes.map(n => ({
        ...n,
        total: Number(n.total),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    }, 'Transactions retrieved');
  } catch (error) {
    console.error('Error getting transactions:', error);
    sendError(res, 500, 'Internal server error');
  }
};

// ─── Export Excel ───────────────────────────────────────────────
export const exportExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, category_id } = req.query;
    const where: any = { deleted_at: null };
    if (startDate && endDate) {
      where.date = { gte: new Date(startDate as string), lte: new Date(endDate as string) };
    }
    if (category_id) where.category_id = category_id;

    const notes = await prisma.note.findMany({
      where,
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        total: true,
        buyer: { select: { name: true } },
        requester: { select: { name: true } },
        category: { select: { name: true } },
        user: { select: { name: true } },
        items: {
          select: {
            item_name: true,
            qty: true,
            price: true,
            subtotal: true,
          }
        },
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Intek Solution';
    
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Buyer', key: 'buyer', width: 20 },
      { header: 'Requester', key: 'requester', width: 20 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Total (Rp)', key: 'total', width: 18 },
      { header: 'Created By', key: 'createdBy', width: 18 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' }
    };
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const note of notes) {
      summarySheet.addRow({
        date: new Date(note.date).toLocaleDateString('id-ID'),
        buyer: note.buyer.name,
        requester: note.requester.name,
        category: note.category.name,
        total: Number(note.total),
        createdBy: note.user.name,
      });
    }

    const detailSheet = workbook.addWorksheet('Detail Items');
    detailSheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Buyer', key: 'buyer', width: 20 },
      { header: 'Item Name', key: 'itemName', width: 30 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Price (Rp)', key: 'price', width: 15 },
      { header: 'Subtotal (Rp)', key: 'subtotal', width: 15 },
    ];
    detailSheet.getRow(1).font = { bold: true };
    detailSheet.getRow(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' }
    };
    detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const note of notes) {
      for (const item of note.items) {
        detailSheet.addRow({
          date: new Date(note.date).toLocaleDateString('id-ID'),
          buyer: note.buyer.name,
          itemName: item.item_name,
          qty: item.qty,
          price: Number(item.price),
          subtotal: Number(item.subtotal),
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting Excel:', error);
    sendError(res, 500, 'Internal server error');
  }
};

// ─── Export PDF ─────────────────────────────────────────────────
export const exportPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, category_id } = req.query;
    const where: any = { deleted_at: null };
    if (startDate && endDate) {
      where.date = { gte: new Date(startDate as string), lte: new Date(endDate as string) };
    }
    if (category_id) where.category_id = category_id;

    const notes = await prisma.note.findMany({
      where,
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        total: true,
        buyer: { select: { name: true } },
        requester: { select: { name: true } },
        category: { select: { name: true } },
        user: { select: { name: true } },
      }
    });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Transaction Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`Generated: ${new Date().toLocaleDateString('id-ID')}`, { align: 'center' });
    doc.moveDown(1.5);

    const tableTop = doc.y;
    const colWidths = [80, 110, 100, 80, 90];
    const headers = ['Date', 'Buyer', 'Requester', 'Category', 'Total (Rp)'];

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e40af');
    headers.forEach((h, i) => {
      const x = 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(h, x, tableTop, { width: colWidths[i] });
    });

    doc.moveTo(50, tableTop + 15).lineTo(50 + colWidths.reduce((a, b) => a + b, 0), tableTop + 15)
      .strokeColor('#1e40af').lineWidth(1).stroke();

    let y = tableTop + 22;
    doc.font('Helvetica').fillColor('#333').fontSize(8);

    for (const note of notes) {
      if (y > 750) { doc.addPage(); y = 50; }
      const rowData = [
        new Date(note.date).toLocaleDateString('id-ID'),
        note.buyer.name,
        note.requester.name,
        note.category.name,
        `Rp ${Number(note.total).toLocaleString('id-ID')}`,
      ];
      rowData.forEach((cell, i) => {
        const x = 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(cell, x, y, { width: colWidths[i] });
      });
      y += 18;
    }

    const grandTotal = notes.reduce((sum, n) => sum + Number(n.total), 0);
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e40af')
      .text(`Grand Total: Rp ${grandTotal.toLocaleString('id-ID')}`, { align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    sendError(res, 500, 'Internal server error');
  }
};
