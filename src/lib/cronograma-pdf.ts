import type { CronogramaEntry } from "@/lib/cronograma";
import type { Employee } from "@/lib/employees";

const TZ = "America/Maceio";

function monthLabel(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  return new Date(year, (rawMonth || 1) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).toUpperCase();
}

function brDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export async function exportCronogramaDetailedPdf(entries: CronogramaEntry[], employees: Employee[], month: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const issuedAt = new Date().toLocaleDateString("pt-BR", { timeZone: TZ });
  const columns = [
    { label: "Nº", width: 9, align: "center" as const },
    { label: "Colaborador", width: 38, align: "left" as const },
    { label: "Matrícula", width: 18, align: "center" as const },
    { label: "Data", width: 18, align: "center" as const },
    { label: "Tema / Avaliação", width: 46, align: "left" as const },
    { label: "Status", width: 22, align: "center" as const },
    { label: "Justificativa", width: 39, align: "left" as const },
  ];
  const startX = margin;
  const rowHeight = 8;
  const headerHeight = 8;
  const padding = 2;

  const activeOperators = employees
    .filter((employee) => employee.access_profile !== "Inspetor" && employee.status === "Ativo")
    .sort((a, b) => a.sector.localeCompare(b.sector) || a.full_name.localeCompare(b.full_name));
  const byEmployee = new Map<string, CronogramaEntry[]>();
  entries.forEach((entry) => byEmployee.set(entry.employee_id, [...(byEmployee.get(entry.employee_id) ?? []), entry]));

  const rows: Array<{ sector: string; name: string; matricula: string; date: string; theme: string; status: string; justification: string }> = [];
  activeOperators.forEach((employee) => {
    const employeeEntries = byEmployee.get(employee.id) ?? [];
    if (!employeeEntries.length) {
      rows.push({ sector: employee.sector, name: employee.full_name, matricula: employee.matricula, date: "—", theme: "—", status: "Pendente", justification: "" });
      return;
    }
    employeeEntries.forEach((entry) => rows.push({
      sector: employee.sector,
      name: employee.full_name,
      matricula: employee.matricula,
      date: brDate(entry.planned_date || entry.completion_date),
      theme: entry.theme || "—",
      status: entry.status || "Pendente",
      justification: entry.justification || entry.notes || "",
    }));
  });

  const drawBorders = (y: number, height: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(startX, y, 190, height);
    let x = startX;
    columns.forEach((column, index) => {
      if (index > 0) doc.line(x, y, x, y + height);
      x += column.width;
    });
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(220, 220, 220);
    doc.rect(startX, y, 190, headerHeight, "F");
    let x = startX;
    columns.forEach((column) => {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      if (column.align === "center") doc.text(column.label.toUpperCase(), x + column.width / 2, y + 5.5, { align: "center" });
      else doc.text(column.label.toUpperCase(), x + padding, y + 5.5);
      x += column.width;
    });
    drawBorders(y, headerHeight);
    return y + headerHeight;
  };

  const drawPageHeader = () => {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("CRONOGRAMA DE TREINAMENTOS E AVALIAÇÕES", pageWidth / 2, 14, { align: "center" });
    doc.setLineWidth(0.5);
    doc.line(margin, 17, pageWidth - margin, 17);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Unidade de Segurança Portuária", pageWidth / 2, 22, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text(monthLabel(month), pageWidth / 2, 28, { align: "center" });
    return 33;
  };

  const drawSectorHeader = (sector: string, y: number) => {
    doc.setFillColor(238, 238, 238);
    doc.rect(startX, y, 190, 7, "F");
    doc.setDrawColor(0, 0, 0);
    doc.rect(startX, y, 190, 7);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`SETOR: ${sector || "N/D"}`, startX + padding, y + 5);
    return y + 7;
  };

  let y = drawTableHeader(drawPageHeader());
  let rowNumber = 0;
  let lastSector: string | null = null;

  rows.forEach((row) => {
    if (row.sector !== lastSector) {
      if (y + 7 > pageHeight - 14) {
        doc.addPage();
        y = drawTableHeader(drawPageHeader());
      }
      y = drawSectorHeader(row.sector, y);
      lastSector = row.sector;
    }
    if (y + rowHeight > pageHeight - 14) {
      doc.addPage();
      y = drawTableHeader(drawPageHeader());
      y = drawSectorHeader(row.sector, y);
      lastSector = row.sector;
    }
    rowNumber += 1;
    if (rowNumber % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(startX, y, 190, rowHeight, "F");
    }
    const cells = [String(rowNumber), row.name, row.matricula, row.date, row.theme, row.status, row.justification || "—"];
    let x = startX;
    cells.forEach((text, index) => {
      const column = columns[index];
      const maxWidth = column.width - padding * 2;
      const lines = doc.splitTextToSize(String(text), maxWidth) as string[];
      const clipped = lines[0] + (lines.length > 1 ? "…" : "");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      if (column.align === "center") doc.text(clipped, x + column.width / 2, y + 5.5, { align: "center" });
      else doc.text(clipped, x + padding, y + 5.5);
      x += column.width;
    });
    drawBorders(y, rowHeight);
    y += rowHeight;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Documento Operacional", margin, pageHeight - 7);
    doc.text("Cronograma Mensal", pageWidth / 2, pageHeight - 7, { align: "center" });
    doc.text(`Emitido em: ${issuedAt} · Pág. ${page}/${pageCount}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  }
  doc.save(`cronograma-${month}.pdf`);
}

export async function exportCronogramaAttendancePdf(entries: CronogramaEntry[], month: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const issuedAt = new Date().toLocaleDateString("pt-BR", { timeZone: TZ });
  const columns = [
    { label: "☐", width: 10, align: "center" as const },
    { label: "Colaborador", width: 48, align: "left" as const },
    { label: "Matrícula", width: 22, align: "center" as const },
    { label: "Data Prev.", width: 22, align: "center" as const },
    { label: "Tema", width: 50, align: "left" as const },
    { label: "Status", width: 38, align: "center" as const },
  ];
  const rowHeight = 9;
  const headerHeight = 8;
  const padding = 2;

  const sorted = [...entries].sort((a, b) => a.employee_sector.localeCompare(b.employee_sector) || a.employee_name.localeCompare(b.employee_name));

  const drawBorders = (y: number, height: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, 190, height);
    let x = margin;
    columns.forEach((column, index) => {
      if (index > 0) doc.line(x, y, x, y + height);
      x += column.width;
    });
  };
  const drawTableHeader = (y: number) => {
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, y, 190, headerHeight, "F");
    let x = margin;
    columns.forEach((column) => {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      if (column.align === "center") doc.text(column.label.toUpperCase(), x + column.width / 2, y + 5.5, { align: "center" });
      else doc.text(column.label.toUpperCase(), x + padding, y + 5.5);
      x += column.width;
    });
    drawBorders(y, headerHeight);
    return y + headerHeight;
  };
  const drawPageHeader = () => {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("LISTA DE PRESENÇA – TREINAMENTOS", pageWidth / 2, 14, { align: "center" });
    doc.line(margin, 17, pageWidth - margin, 17);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Unidade de Segurança Portuária", pageWidth / 2, 22, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text(monthLabel(month), pageWidth / 2, 28, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Responsável: ___________________________", margin, 35);
    doc.text("Data: ___/___/______", margin + 100, 35);
    doc.text("Assinatura: ___________________________", margin, 41);
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, 44, pageWidth - margin, 44);
    return 47;
  };
  const drawSectorHeader = (sector: string, y: number) => {
    doc.setFillColor(238, 238, 238);
    doc.rect(margin, y, 190, 7, "F");
    doc.setDrawColor(0, 0, 0);
    doc.rect(margin, y, 190, 7);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`SETOR: ${sector}`, margin + padding, y + 5);
    return y + 7;
  };

  let y = drawTableHeader(drawPageHeader());
  let rowIndex = 0;
  let lastSector: string | null = null;
  sorted.forEach((entry) => {
    const sector = entry.employee_sector || "Sem setor";
    if (sector !== lastSector) {
      if (y + 7 > pageHeight - 14) {
        doc.addPage();
        y = drawTableHeader(drawPageHeader());
      }
      y = drawSectorHeader(sector, y);
      lastSector = sector;
    }
    if (y + rowHeight > pageHeight - 14) {
      doc.addPage();
      y = drawTableHeader(drawPageHeader());
      y = drawSectorHeader(sector, y);
      lastSector = sector;
    }
    rowIndex += 1;
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y, 190, rowHeight, "F");
    }
    const cells = ["", entry.employee_name || "—", entry.employee_matricula || "—", brDate(entry.planned_date), entry.theme || "—", entry.status || "Pendente"];
    let x = margin;
    cells.forEach((text, index) => {
      const column = columns[index];
      if (index === 0) {
        const size = 5;
        doc.setDrawColor(0, 0, 0);
        doc.rect(x + column.width / 2 - size / 2, y + rowHeight / 2 - size / 2, size, size);
      } else {
        const maxWidth = column.width - padding * 2;
        const lines = doc.splitTextToSize(String(text), maxWidth) as string[];
        const clipped = lines[0] + (lines.length > 1 ? "…" : "");
        doc.setFontSize(8);
        doc.setFont("helvetica", index === 1 ? "bold" : "normal");
        if (column.align === "center") doc.text(clipped, x + column.width / 2, y + 6, { align: "center" });
        else doc.text(clipped, x + padding, y + 6);
      }
      x += column.width;
    });
    drawBorders(y, rowHeight);
    y += rowHeight;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Documento Operacional", margin, pageHeight - 7);
    doc.text("Cronograma Mensal", pageWidth / 2, pageHeight - 7, { align: "center" });
    doc.text(`Emitido em: ${issuedAt} · Pág. ${page}/${pageCount}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  }
  doc.save(`lista-presenca-${month}.pdf`);
}