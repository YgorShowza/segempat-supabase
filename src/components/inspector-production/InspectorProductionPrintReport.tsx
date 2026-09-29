import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { InspectorProductionSummary } from "@/lib/inspector-production";

const EMPAT_PRINT_LOGO_DATA_URL = "data:image/png;base64,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";

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
