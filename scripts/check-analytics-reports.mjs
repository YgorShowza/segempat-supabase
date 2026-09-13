import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`${label}: conteúdo obrigatório ausente: ${text}`);
}

function forbidText(source, text, label) {
  if (source.includes(text)) throw new Error(`${label}: conteúdo legado incompatível presente: ${text}`);
}

const analytics = read("src/routes/_authenticated/analytics.tsx");
const reports = read("src/routes/_authenticated/relatorios.tsx");
const monthly = read("src/components/reports/MonthlyReportWorkspace.tsx");
const model = read("src/lib/reporting-insights.ts");

requireText(analytics, "Percentuais sem base são exibidos como “—”", "Analytics");
requireText(analytics, "Escopo analítico", "Analytics");
requireText(analytics, "Evolução mensal", "Analytics");
requireText(analytics, "Desempenho por setor", "Analytics");
requireText(analytics, "Avaliações no período", "Analytics");
requireText(analytics, "Critérios de leitura e rastreabilidade", "Analytics");
requireText(analytics, "reportingSummary(data, sector)", "Analytics");
requireText(analytics, "monthlyReporting(data, year, sector)", "Analytics");
forbidText(analytics, "snapshotMetrics(", "Analytics");
forbidText(analytics, "sectorMetrics(", "Analytics");

requireText(reports, "Central de Relatórios", "Relatórios");
requireText(reports, "Visão Executiva", "Relatórios");
requireText(reports, "Fechamento Mensal", "Relatórios");
requireText(reports, "<MonthlyReportWorkspace embedded />", "Relatórios");
requireText(reports, "Rastreabilidade do relatório", "Relatórios");
requireText(reports, "downloadCsv", "Relatórios");
requireText(reports, "Imprimir / salvar PDF", "Relatórios");
requireText(reports, "SEM BASE", "Relatórios");
requireText(reports, "@page { size:A4 portrait", "Relatórios");
forbidText(reports, "snapshotMetrics(", "Relatórios");
forbidText(reports, "sectorMetrics(", "Relatórios");

requireText(monthly, "embedded = false", "Relatório mensal");
requireText(monthly, "hasPermission(user, \"reports.view\")", "Relatório mensal");
requireText(monthly, "Imprimir visão atual", "Relatório mensal");
requireText(monthly, "const scopedRows", "Relatório mensal");
requireText(monthly, "const visibleRows", "Relatório mensal");
requireText(monthly, "Em atraso", "Relatório mensal");
requireText(monthly, "Nenhum resultado para os filtros", "Relatório mensal");
requireText(monthly, "aria-expanded={open}", "Relatório mensal");
requireText(monthly, "não alteram o consolidado mensal", "Relatório mensal");

requireText(model, "normalizeReportingText", "Modelo analítico compartilhado");
requireText(model, "normalizeReportingMatricula", "Modelo analítico compartilhado");
requireText(model, "return denominator > 0 ? Math.round", "Modelo analítico compartilhado");
requireText(model, "reportingScope", "Modelo analítico compartilhado");
requireText(model, "monthlyReporting", "Modelo analítico compartilhado");
requireText(model, "sectorReporting", "Modelo analítico compartilhado");
requireText(model, "examReporting", "Modelo analítico compartilhado");
requireText(model, "monthlyEmployeeRows", "Modelo analítico compartilhado");
requireText(model, "entry.employee_id === employee.id || normalizeReportingMatricula", "Modelo analítico compartilhado");

console.log("SEGEMPAT analytics and reports coherence contract: OK");
