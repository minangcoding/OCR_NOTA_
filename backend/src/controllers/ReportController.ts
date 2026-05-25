import { Request, Response } from "express";
import prisma from "../config/prisma";
import { sendSuccess, sendError } from "../utils/responseHandler";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// ─── Summary (Charts Data) ──────────────────────────────────────
export const getReportSummary = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
      by: ["category_id"],
      where: dateFilter,
      _sum: { total: true },
      _count: true,
    });

    // Enrich with category names
    const categories = await prisma.category.findMany();
    const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

    const spendingByCategory = categorySpending.map((item) => ({
      category_id: item.category_id,
      category_name: categoryMap[item.category_id]?.name ?? "Unknown",
      category_code: categoryMap[item.category_id]?.code ?? "???",
      total: Number(item._sum.total ?? 0),
      count: item._count,
    }));

    // Tentukan mode grouping berdasarkan rentang period
    let trendGroupMode: "daily" | "monthly" = "monthly";

    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const diffDays = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays <= 60) {
        trendGroupMode = "daily";
      }
    }

    const sqlParams: any[] = [];

    if (startDate && endDate) {
      sqlParams.push(new Date(startDate as string));
      sqlParams.push(new Date(endDate as string));
    }

    let monthlyTrends: Array<{ month: string; total: number }>;

    if (trendGroupMode === "daily") {
      if (sqlParams.length > 0) {
        monthlyTrends = await prisma.$queryRaw<
          Array<{ month: string; total: number }>
        >`
          SELECT TO_CHAR(date, 'YYYY-MM-DD') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
            AND date >= ${sqlParams[0]} AND date <= ${sqlParams[1]}
          GROUP BY TO_CHAR(date, 'YYYY-MM-DD')
          ORDER BY month ASC
        `;
      } else {
        monthlyTrends = await prisma.$queryRaw<
          Array<{ month: string; total: number }>
        >`
          SELECT TO_CHAR(date, 'YYYY-MM-DD') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
          GROUP BY TO_CHAR(date, 'YYYY-MM-DD')
          ORDER BY month ASC
        `;
      }
    } else {
      if (sqlParams.length > 0) {
        monthlyTrends = await prisma.$queryRaw<
          Array<{ month: string; total: number }>
        >`
          SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
            AND date >= ${sqlParams[0]} AND date <= ${sqlParams[1]}
          GROUP BY TO_CHAR(date, 'YYYY-MM')
          ORDER BY month ASC
        `;
      } else {
        monthlyTrends = await prisma.$queryRaw<
          Array<{ month: string; total: number }>
        >`
          SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(total)::float as total
          FROM "Note"
          WHERE deleted_at IS NULL
          GROUP BY TO_CHAR(date, 'YYYY-MM')
          ORDER BY month ASC
        `;
      }
    }

    const totals = await prisma.note.aggregate({
      where: dateFilter,
      _sum: { total: true },
      _count: true,
    });

    sendSuccess(
      res,
      {
        spendingByCategory,
        monthlyTrends,
        trendGroupMode,
        totalSpend: Number(totals._sum.total ?? 0),
        noteCount: totals._count,
      },
      "Report summary retrieved",
    );
  } catch (error) {
    console.error("Error getting report summary:", error);
    sendError(res, 500, "Internal server error");
  }
};

// ─── Dashboard Stats ────────────────────────────────────────────
export const getDashboardStats = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
      where: { is_active: true },
    });

    const totalRecent = await prisma.note.count({ where });

    const recentReceipts = await prisma.note.findMany({
      where,
      orderBy: { created_at: "desc" },
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
      },
    });

    sendSuccess(
      res,
      {
        totalReceipts: totals._count,
        totalAmount: Number(totals._sum.total ?? 0),
        activeUsers: activeUsersCount,
        recentReceipts: recentReceipts.map((n) => ({
          ...n,
          total: Number(n.total),
        })),
        recentPagination: {
          page,
          limit,
          total: totalRecent,
          totalPages: Math.ceil(totalRecent / limit),
        },
      },
      "Dashboard stats retrieved",
    );
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    sendError(res, 500, "Internal server error");
  }
};

// ─── Transaction list (Table) ───────────────────────────────────
export const getTransactions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const { startDate, endDate, category_id } = req.query;

    const where: any = { deleted_at: null };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    if (category_id) {
      where.category_id = category_id;
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          total: true,
          created_at: true,
          buyer: { select: { name: true } },
          requester: { select: { name: true } },
          category: { select: { name: true, code: true } },
          user: { select: { name: true } },
        },
      }),
      prisma.note.count({ where }),
    ]);

    sendSuccess(
      res,
      {
        notes: notes.map((n) => ({
          ...n,
          total: Number(n.total),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Transactions retrieved",
    );
  } catch (error) {
    console.error("Error getting transactions:", error);
    sendError(res, 500, "Internal server error");
  }
};

// ─── Export Excel ───────────────────────────────────────────────
export const exportExcel = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { startDate, endDate, category_id, periodLabel } = req.query;

    const fileName = periodLabel ? `Report ${periodLabel}.xlsx` : "Report.xlsx";

    const where: any = { deleted_at: null };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    if (category_id) {
      where.category_id = category_id;
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { date: "desc" },
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
          },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Intek Solution";

    const summarySheet = workbook.addWorksheet("Summary");

    summarySheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Buyer", key: "buyer", width: 20 },
      { header: "Requester", key: "requester", width: 20 },
      { header: "Category", key: "category", width: 18 },
      { header: "Total (Rp)", key: "total", width: 18 },
      { header: "Created By", key: "createdBy", width: 18 },
    ];

    summarySheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E40AF" },
    };

    summarySheet.getRow(1).font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };

    for (const note of notes) {
      summarySheet.addRow({
        date: new Date(note.date).toLocaleDateString("id-ID"),
        buyer: note.buyer.name,
        requester: note.requester.name,
        category: note.category.name,
        total: Number(note.total),
        createdBy: note.user.name,
      });
    }

    const detailSheet = workbook.addWorksheet("Detail Items");

    detailSheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Buyer", key: "buyer", width: 20 },
      { header: "Item Name", key: "itemName", width: 30 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "Price (Rp)", key: "price", width: 15 },
      { header: "Subtotal (Rp)", key: "subtotal", width: 15 },
    ];

    detailSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E40AF" },
    };

    detailSheet.getRow(1).font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };

    for (const note of notes) {
      for (const item of note.items) {
        detailSheet.addRow({
          date: new Date(note.date).toLocaleDateString("id-ID"),
          buyer: note.buyer.name,
          itemName: item.item_name,
          qty: item.qty,
          price: Number(item.price),
          subtotal: Number(item.subtotal),
        });
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting Excel:", error);
    sendError(res, 500, "Internal server error");
  }
};

// ─── Export PDF ─────────────────────────────────────────────────
export const exportPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, category_id, periodLabel } = req.query;

    const fileName = periodLabel ? `Report ${periodLabel}.pdf` : "Report.pdf";

    const where: any = { deleted_at: null };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    if (category_id) {
      where.category_id = category_id;
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        total: true,
        buyer: { select: { name: true } },
        requester: { select: { name: true } },
        category: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    doc.pipe(res);

    // ─── TITLE ──────────────────────────────────────────────────
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("Transaction Report", {
        align: "center",
      });

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#666666")
      .text(`Generated: ${new Date().toLocaleDateString("id-ID")}`, {
        align: "center",
      });

    doc.moveDown(1.5);

    // ─── TABLE CONFIG ───────────────────────────────────────────
    const tableLeft = 50;
    const tableTop = doc.y;

    const colWidths = [70, 110, 90, 140, 85];
    const headers = ["Date", "Buyer", "Requester", "Category", "Total (Rp)"];

    const paddingX = 5;
    const headerHeight = 24;
    const totalTableWidth = colWidths.reduce((a, b) => a + b, 0);

    const blueColor = "#1e40af";
    const textColor = "#333333";

    // ─── HELPER: DRAW TABLE HEADER ──────────────────────────────
    const drawTableHeader = (yPosition: number): void => {
      doc.strokeColor(blueColor).lineWidth(0.5);

      // Border atas header
      doc
        .moveTo(tableLeft, yPosition)
        .lineTo(tableLeft + totalTableWidth, yPosition)
        .stroke();

      // Border bawah header
      doc
        .moveTo(tableLeft, yPosition + headerHeight)
        .lineTo(tableLeft + totalTableWidth, yPosition + headerHeight)
        .stroke();

      // Border vertikal header
      let headerX = tableLeft;

      // Garis kiri header
      doc
        .moveTo(headerX, yPosition)
        .lineTo(headerX, yPosition + headerHeight)
        .stroke();

      // Garis antar kolom header dan garis kanan header
      headers.forEach((_, i) => {
        headerX += colWidths[i];

        doc
          .moveTo(headerX, yPosition)
          .lineTo(headerX, yPosition + headerHeight)
          .stroke();
      });

      // Text header
      doc.fontSize(9).font("Helvetica-Bold").fillColor(blueColor);

      headers.forEach((header, i) => {
        const x = tableLeft + colWidths.slice(0, i).reduce((a, b) => a + b, 0);

        doc.text(header, x + paddingX, yPosition + 7, {
          width: colWidths[i] - paddingX * 2,
        });
      });
    };

    // Gambar header pertama
    drawTableHeader(tableTop);

    // Body mulai tepat di bawah header supaya border nyambung
    let y = tableTop + headerHeight;

    doc.font("Helvetica").fillColor(textColor).fontSize(8);

    // ─── TABLE BODY ─────────────────────────────────────────────
    for (const note of notes) {
      const rowData = [
        new Date(note.date).toLocaleDateString("id-ID"),
        note.buyer.name,
        note.requester.name,
        note.category.name,
        `Rp ${Number(note.total).toLocaleString("id-ID")}`,
      ];

      // Hitung tinggi row otomatis berdasarkan isi text terpanjang
      let maxRowHeight = 0;

      rowData.forEach((cell, i) => {
        const cellHeight = doc.heightOfString(cell, {
          width: colWidths[i] - paddingX * 2,
        });

        if (cellHeight > maxRowHeight) {
          maxRowHeight = cellHeight;
        }
      });

      const paddingTop = 6;
      const paddingBottom = 6;
      const rowHeight = maxRowHeight + paddingTop + paddingBottom;

      const pageBottom = doc.page.height - doc.page.margins.bottom;

      // Kalau row tidak cukup di halaman sekarang, pindah halaman
      if (y + rowHeight > pageBottom) {
        doc.addPage();

        y = doc.page.margins.top;

        drawTableHeader(y);

        y += headerHeight;

        doc.font("Helvetica").fillColor(textColor).fontSize(8);
      }

      // Text isi row
      rowData.forEach((cell, i) => {
        const x = tableLeft + colWidths.slice(0, i).reduce((a, b) => a + b, 0);

        doc.text(cell, x + paddingX, y + paddingTop, {
          width: colWidths[i] - paddingX * 2,
        });
      });

      // Border vertikal body
      doc.strokeColor(blueColor).lineWidth(0.5);

      let xPosBaris = tableLeft;

      // Garis kiri row
      doc
        .moveTo(xPosBaris, y)
        .lineTo(xPosBaris, y + rowHeight)
        .stroke();

      // Garis antar kolom dan garis kanan row
      rowData.forEach((_, i) => {
        xPosBaris += colWidths[i];

        doc
          .moveTo(xPosBaris, y)
          .lineTo(xPosBaris, y + rowHeight)
          .stroke();
      });

      // Border bawah row
      const lineY = y + rowHeight;

      doc
        .moveTo(tableLeft, lineY)
        .lineTo(tableLeft + totalTableWidth, lineY)
        .strokeColor(blueColor)
        .lineWidth(0.5)
        .stroke();

      y += rowHeight;
    }

    // ─── GRAND TOTAL RESPONSIVE ─────────────────────────────────
    const grandTotal = notes.reduce((sum, n) => sum + Number(n.total), 0);

    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const grandTotalHeight = 40;
    const grandTotalGap = 12;

    if (y + grandTotalGap + grandTotalHeight > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    const grandTotalBoxWidth = 180;
    const grandTotalX = tableLeft + totalTableWidth - grandTotalBoxWidth;
    const grandTotalY = y + grandTotalGap;

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(blueColor)
      .text("Grand Total:", grandTotalX, grandTotalY, {
        width: grandTotalBoxWidth,
        align: "right",
      });

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(blueColor)
      .text(
        `Rp ${grandTotal.toLocaleString("id-ID")}`,
        grandTotalX,
        grandTotalY + 14,
        {
          width: grandTotalBoxWidth,
          align: "right",
        },
      );

    doc.end();
  } catch (error) {
    console.error("Error exporting PDF:", error);
    sendError(res, 500, "Internal server error");
  }
};
