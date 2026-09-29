import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { InspectorProductionSummary } from "@/lib/inspector-production";
import { EMPAT_PRINT_LOGO_DATA_URL } from "./empatPrintLogo";

function displayDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function periodLabel(from: string, to: string) {
  const date = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  return `${date(from)} a ${date(to)}`;
}

function comparisonLabel(current: number, previous: number, percentage: number | null) {
  const absolute = current - previous;
  if (previous === 0 && current > 0) return "Sem base anterior";
  if (absolute > 0) return percentage === null ? `+${absolute}` : `+${percentage}%`;
  if (absolute < 0) return percentage === null ? String(absolute) : `${percentage}%`;
  return "0%";
}

function categoryConcentrationLabel(level: "base_forming" | "shared" | "moderate" | "high") {
  if (level === "shared") return "Distribuição compartilhada";
  if (level === "moderate") return "Concentração moderada";
  if (level === "high") return "Concentração elevada";
  return "Base em formação";
}

export function InspectorProductionPrintReport({
  dashboard,
  inspectorRows,
  issuedAt,
}: {
  dashboard: InspectorProductionSummary;
  inspectorRows: InspectorProductionSummary["ranking"];
  issuedAt: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const comparison = comparisonLabel(
    dashboard.comparison.current_total,
    dashboard.comparison.previous_total,
    dashboard.comparison.percentage_change,
  );

  const printStyles = `
    .inspector-production-print-report { display: none; }

    @media print {
      @page { size: A4 portrait; margin: 0; }

      html,
      body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }

      body > *:not(.inspector-production-print-report):not(style):not(script) {
        display: none !important;
      }

      .inspector-production-print-report {
        display: block !important;
        position: static !important;
        width: 210mm !important;
        background: #ffffff !important;
        color: #111827 !important;
        font-family: Arial, Helvetica, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .segempat-print-page {
        box-sizing: border-box;
        position: relative;
        width: 210mm;
        min-height: 297mm;
        padding: 13mm 14mm 18mm;
        background: #ffffff;
        page-break-after: always;
      }

      .segempat-print-page:last-child {
        page-break-after: auto;
      }

      .segempat-print-header {
        display: grid;
        grid-template-columns: 43mm 1fr auto;
        align-items: center;
        gap: 8mm;
        padding: 2mm 0 5mm;
        border-bottom: 1.5px solid #c8102e;
      }

      .segempat-print-logo-wrap {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        height: 23mm;
      }

      .segempat-print-logo {
        display: block;
        width: 42mm;
        height: auto;
        object-fit: contain;
      }

      .segempat-print-kicker {
        margin: 0 0 1.1mm;
        color: #6b7280;
        font-size: 7pt;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .segempat-print-unit {
        margin: 0;
        color: #111827;
        font-size: 11pt;
        font-weight: 850;
      }

      .segempat-print-institution {
        margin: 1mm 0 0;
        color: #6b7280;
        font-size: 7.1pt;
        font-weight: 700;
      }

      .segempat-print-doc-type {
        padding: 2.6mm 3.2mm;
        border: 1px solid #d6dae1;
        border-radius: 2.2mm;
        background: #fbfcfe;
        text-align: right;
        color: #374151;
        font-size: 7.1pt;
        font-weight: 900;
        line-height: 1.35;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }

      .segempat-print-title {
        margin: 6mm 0 1.4mm;
        color: #111827;
        font-size: 20pt;
        font-weight: 900;
        letter-spacing: -0.025em;
      }

      .segempat-print-subtitle {
        margin: 0;
        color: #4b5563;
        font-size: 9pt;
        line-height: 1.45;
      }

      .segempat-print-meta {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 3mm;
        margin-top: 5mm;
      }

      .segempat-print-meta-card,
      .segempat-print-metric {
        border: 1px solid #d1d5db;
        border-radius: 2.5mm;
        background: #ffffff;
      }

      .segempat-print-meta-card {
        position: relative;
        overflow: hidden;
        padding: 3.2mm 3.4mm;
        background: #fbfcfe;
      }

      .segempat-print-meta-card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 0.8mm;
        background: #c8102e;
      }

      .segempat-print-label {
        color: #6b7280;
        font-size: 6.8pt;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .segempat-print-meta-value {
        margin-top: 1.2mm;
        color: #111827;
        font-size: 8.5pt;
        font-weight: 800;
      }

      .segempat-print-section {
        margin-top: 6mm;
      }

      .segempat-print-section-title {
        display: flex;
        align-items: center;
        gap: 2.5mm;
        margin: 0 0 3mm;
        color: #111827;
        font-size: 10pt;
        font-weight: 900;
      }

      .segempat-print-section-title::before {
        content: "";
        display: block;
        width: 1.2mm;
        height: 4.2mm;
        border-radius: 1mm;
        background: #c8102e;
      }

      .segempat-print-summary {
        display: grid;
        gap: 2mm;
      }

      .segempat-print-summary-item {
        padding: 2.5mm 3.2mm;
        border: 1px solid #e3e6eb;
        border-left: 1.1mm solid #c8102e;
        border-radius: 1.5mm;
        background: #fbfcfe;
        color: #374151;
        font-size: 8.2pt;
        line-height: 1.45;
      }

      .segempat-print-metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2.5mm;
      }

      .segempat-print-metric {
        position: relative;
        overflow: hidden;
        padding: 3.2mm;
        background: #ffffff;
      }

      .segempat-print-metric::before {
        content: "";
        position: absolute;
        inset: 0 0 auto;
        height: 0.7mm;
        background: #c8102e;
      }

      .segempat-print-metric-value {
        margin-top: 1mm;
        color: #111827;
        font-size: 16pt;
        font-weight: 900;
      }

      .segempat-print-metric-detail {
        margin-top: 0.8mm;
        color: #6b7280;
        font-size: 6.8pt;
        line-height: 1.35;
      }

      .segempat-print-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4mm;
      }

      .segempat-print-panel {
        border: 1px solid #d1d5db;
        border-radius: 2.5mm;
        padding: 3.5mm;
        background: #ffffff;
      }

      .segempat-print-panel h3 {
        margin: 0;
        color: #111827;
        font-size: 8.5pt;
        font-weight: 900;
      }

      .segempat-print-panel p {
        margin: 1.2mm 0 0;
        color: #4b5563;
        font-size: 7.4pt;
        line-height: 1.4;
      }

      .segempat-print-outcomes {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2.5mm;
      }

      .segempat-print-outcome {
        border: 1px solid #d1d5db;
        border-radius: 2.5mm;
        padding: 3.2mm;
        background: #fbfcfe;
      }

      .segempat-print-outcome strong {
        display: block;
        color: #111827;
        font-size: 14pt;
      }

      .segempat-print-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .segempat-print-table th {
        padding: 2.2mm 2mm;
        border-bottom: 1.5px solid #9ca3af;
        color: #4b5563;
        font-size: 6.5pt;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-align: left;
        text-transform: uppercase;
      }

      .segempat-print-table td {
        padding: 2.4mm 2mm;
        border-bottom: 1px solid #e5e7eb;
        color: #1f2937;
        font-size: 7.4pt;
        line-height: 1.35;
        vertical-align: top;
      }

      .segempat-print-table .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .segempat-print-note {
        margin-top: 3mm;
        padding: 3mm;
        border: 1px solid #dde1e7;
        border-radius: 2.5mm;
        background: #fbfcfe;
        color: #4b5563;
        font-size: 7.2pt;
        line-height: 1.45;
      }

      .segempat-print-empty {
        padding: 7mm 5mm;
        border: 1px dashed #cfd5de;
        border-radius: 2.5mm;
        background: #fbfcfe;
        color: #6b7280;
        font-size: 8pt;
        line-height: 1.45;
        text-align: center;
      }

      .segempat-print-empty strong {
        display: block;
        margin-bottom: 1mm;
        color: #374151;
        font-size: 8.5pt;
      }

      .segempat-print-footer {
        position: absolute;
        left: 14mm;
        right: 14mm;
        bottom: 7mm;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5mm;
        padding-top: 2.5mm;
        border-top: 1px solid #d1d5db;
        color: #6b7280;
        font-size: 6.5pt;
      }

      .segempat-print-confidential {
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
    }
  `;

  const PrintHeader = ({ page }: { page: number }) => (
    <>
      <div className="segempat-print-header">
        <div className="segempat-print-logo-wrap">
          <img className="segempat-print-logo" src={EMPAT_PRINT_LOGO_DATA_URL} alt="EMPAT - Empresa Alagoana de Terminais" loading="eager" decoding="sync" />
        </div>
        <div>
          <p className="segempat-print-kicker">SEGEMPAT · Produção da Inspetoria</p>
          <p className="segempat-print-unit">Unidade de Segurança Portuária</p>
          <p className="segempat-print-institution">Empresa Alagoana de Terminais</p>
        </div>
        <div className="segempat-print-doc-type">Relatório gerencial<br />executivo<br /><span style={{ color: "#9ca3af", fontSize: "6pt", letterSpacing: ".04em" }}>uso gerencial</span></div>
      </div>
      {page === 1 && (
        <>
          <h1 className="segempat-print-title">Produção da Inspetoria</h1>
          <p className="segempat-print-subtitle">
            Consolidação executiva dos registros preservados no SEGEMPAT, com leitura quantitativa e rastreável do período selecionado.
          </p>
          <div className="segempat-print-meta">
            <div className="segempat-print-meta-card">
              <div className="segempat-print-label">Período analisado</div>
              <div className="segempat-print-meta-value">{periodLabel(dashboard.period.from, dashboard.period.to)}</div>
            </div>
            <div className="segempat-print-meta-card">
              <div className="segempat-print-label">Emissão</div>
              <div className="segempat-print-meta-value">{displayDateTime(issuedAt)}</div>
            </div>
            <div className="segempat-print-meta-card">
              <div className="segempat-print-label">Fonte</div>
              <div className="segempat-print-meta-value">SEGEMPAT · registros preservados</div>
            </div>
          </div>
        </>
      )}
    </>
  );

  const PrintFooter = ({ page }: { page: number }) => (
    <div className="segempat-print-footer">
      <span className="segempat-print-confidential">EMPAT · Unidade de Segurança Portuária</span>
      <span>Documento gerado eletronicamente pelo SEGEMPAT</span>
      <span>Página {page} de 3</span>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      <style>{printStyles}</style>
      <div id="inspector-production-print-report" className="inspector-production-print-report" aria-hidden="true">
        <section className="segempat-print-page">
          <PrintHeader page={1} />

          <div className="segempat-print-section">
            <h2 className="segempat-print-section-title">Resumo executivo</h2>
            <div className="segempat-print-summary">
              {dashboard.executive_summary.statements.map((statement, index) => (
                <div key={index} className="segempat-print-summary-item">{statement}</div>
              ))}
            </div>
          </div>

          <div className="segempat-print-section">
            <h2 className="segempat-print-section-title">Indicadores principais</h2>
            <div className="segempat-print-metrics">
              <div className="segempat-print-metric">
                <div className="segempat-print-label">Execuções válidas</div>
                <div className="segempat-print-metric-value">{dashboard.totals.executions}</div>
                <div className="segempat-print-metric-detail">Registros ativos do período.</div>
              </div>
              <div className="segempat-print-metric">
                <div className="segempat-print-label">Registros cancelados</div>
                <div className="segempat-print-metric-value">{dashboard.totals.canceled}</div>
                <div className="segempat-print-metric-detail">Preservados para rastreabilidade.</div>
              </div>
              <div className="segempat-print-metric">
                <div className="segempat-print-label">Equipe configurada</div>
                <div className="segempat-print-metric-value">{dashboard.totals.configured_inspectors}</div>
                <div className="segempat-print-metric-detail">{dashboard.totals.participating_inspectors} com registros no período.</div>
              </div>
              <div className="segempat-print-metric">
                <div className="segempat-print-label">Com evidência</div>
                <div className="segempat-print-metric-value">{dashboard.totals.with_evidence}</div>
                <div className="segempat-print-metric-detail">{dashboard.totals.evidence_rate}% das execuções ativas.</div>
              </div>
              <div className="segempat-print-metric">
                <div className="segempat-print-label">Sem evidência</div>
                <div className="segempat-print-metric-value">{dashboard.totals.without_evidence}</div>
                <div className="segempat-print-metric-detail">Indicador informativo; não implica irregularidade.</div>
              </div>
              <div className="segempat-print-metric">
                <div className="segempat-print-label">Média por inspetor</div>
                <div className="segempat-print-metric-value">{dashboard.totals.average_per_inspector}</div>
                <div className="segempat-print-metric-detail">Média sobre a equipe configurada.</div>
              </div>
            </div>
          </div>

          <PrintFooter page={1} />
        </section>

        <section className="segempat-print-page">
          <PrintHeader page={2} />

          <div className="segempat-print-section">
            <h2 className="segempat-print-section-title">Desfecho das atribuições</h2>
            <div className="segempat-print-outcomes">
              {dashboard.outcomes.map((row) => (
                <div key={row.result_status} className="segempat-print-outcome">
                  <div className="segempat-print-label">{row.result_status}</div>
                  <strong>{row.total}</strong>
                  <p>{row.share}% do volume ativo registrado.</p>
                </div>
              ))}
            </div>
          </div>

          <div className="segempat-print-section">
            <h2 className="segempat-print-section-title">Comparativo de volume</h2>
            <div className="segempat-print-grid-2">
              <div className="segempat-print-panel">
                <h3>Período atual</h3>
                <p><strong>{dashboard.comparison.current_total}</strong> execução(ões) ativas entre {periodLabel(dashboard.period.from, dashboard.period.to)}.</p>
              </div>
              <div className="segempat-print-panel">
                <h3>Período anterior equivalente</h3>
                <p><strong>{dashboard.comparison.previous_total}</strong> execução(ões) entre {periodLabel(dashboard.previous_period.from, dashboard.previous_period.to)}. Leitura: {comparison}.</p>
              </div>
            </div>
            <div className="segempat-print-note">
              Comparação realizada em janelas de igual duração. Variação de volume não representa, isoladamente, qualidade, esforço ou mérito profissional.
            </div>
          </div>

          <div className="segempat-print-section">
            <h2 className="segempat-print-section-title">Participação por inspetor</h2>
            <table className="segempat-print-table">
              <thead>
                <tr>
                  <th style={{ width: "37%" }}>Inspetor</th>
                  <th style={{ width: "13%" }} className="num">Execuções</th>
                  <th style={{ width: "15%" }} className="num">Participação</th>
                  <th style={{ width: "17%" }} className="num">Com evidência</th>
                  <th style={{ width: "18%" }} className="num">Sem evidência</th>
                </tr>
              </thead>
              <tbody>
                {inspectorRows.map((row) => (
                  <tr key={row.employee_id}>
                    <td>{row.name}{row.is_leader ? " · Líder" : ""}<br /><span style={{ color: "#6b7280" }}>Mat. {row.matricula}</span></td>
                    <td className="num">{row.total}</td>
                    <td className="num">{row.share}%</td>
                    <td className="num">{row.with_evidence}</td>
                    <td className="num">{row.without_evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="segempat-print-note">
              A ordem segue a configuração institucional da equipe. Os valores são descritivos e não constituem classificação, premiação ou avaliação profissional.
            </div>
          </div>

          <PrintFooter page={2} />
        </section>

        <section className="segempat-print-page">
          <PrintHeader page={3} />

          <div className="segempat-print-section">
            <h2 className="segempat-print-section-title">Distribuição por categoria</h2>
            {dashboard.categories.length > 0 ? (
              <table className="segempat-print-table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th style={{ width: "18%" }} className="num">Execuções</th>
                    <th style={{ width: "18%" }} className="num">Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.categories.map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td className="num">{row.total}</td>
                      <td className="num">{row.share}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="segempat-print-empty">
                <strong>Sem distribuição por categoria no período</strong>
                Não há execuções ativas registradas para compor esta leitura.
              </div>
            )}
          </div>

          <div className="segempat-print-section">
            <h2 className="segempat-print-section-title">Distribuição por categoria e inspetor</h2>
            {dashboard.category_concentration.length > 0 ? (
              <table className="segempat-print-table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Categoria</th>
                    <th style={{ width: "12%" }} className="num">Total</th>
                    <th style={{ width: "28%" }}>Maior participação registrada</th>
                    <th style={{ width: "14%" }} className="num">Participação</th>
                    <th style={{ width: "16%" }}>Leitura</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.category_concentration.map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td className="num">{row.total}</td>
                      <td>{row.dominant_name || "—"}</td>
                      <td className="num">{row.dominant_share}%</td>
                      <td>{categoryConcentrationLabel(row.concentration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="segempat-print-empty">
                <strong>Sem base para distribuição por categoria e inspetor</strong>
                A leitura será apresentada automaticamente quando houver execuções ativas categorizadas no período.
              </div>
            )}
          </div>

          <div className="segempat-print-section segempat-print-grid-2">
            <div className="segempat-print-panel">
              <h3>Critérios de confiabilidade</h3>
              <p>Identidade derivada da sessão autenticada; data/hora definida pelo servidor; conteúdo imutável após gravação; cancelamentos preservados com motivo e autor; evidências privadas; operações críticas registradas na auditoria do SEGEMPAT.</p>
            </div>
            <div className="segempat-print-panel">
              <h3>Escopo e metodologia</h3>
              <p>{dashboard.executive_summary.methodology}</p>
              <p>{dashboard.executive_summary.scope_note}</p>
            </div>
          </div>

          <PrintFooter page={3} />
        </section>
      </div>
    </>,
    document.body,
  );
}
