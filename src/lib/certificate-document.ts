import type { ExamAttemptEvidence } from "@/lib/exams";

const LOGO_URL = "https://media.base44.com/images/public/6a1117d573bbf85981b1abee/8271ac857_IMG_9226.png";

export type CertificateDocumentOptions = {
  autoPrint?: boolean;
  preview?: boolean;
};

function esc(value: unknown) {
  return String(value ?? "—").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char,
  );
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    timeZone: "America/Maceio",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtDateTime(value?: string | null) {
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

function programHtml(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) {
    return `<p class="program-empty">Descrição do conteúdo programático não cadastrada para esta atividade. O certificado não inventa ementa, carga horária, questões ou respostas.</p>`;
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return `<p>${esc(text)}</p>`;
  return `<ul>${lines.map((line) => `<li>${esc(line.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>`;
}

function densityClass(evidence: ExamAttemptEvidence) {
  const program = String(evidence.exam_description ?? "").trim();
  const lines = program.split(/\r?\n/).filter((line) => line.trim()).length;
  if (program.length > 2200 || lines > 24) return "density-dense";
  if (program.length > 1200 || lines > 14) return "density-compact";
  return "density-standard";
}

function nameClass(name: string) {
  const size = name.trim().length;
  if (size > 58) return "name-xlong";
  if (size > 42) return "name-long";
  return "";
}

function activityClass(title: string) {
  const size = title.trim().length;
  if (size > 105) return "activity-xlong";
  if (size > 72) return "activity-long";
  return "";
}

function assertCertificateEvidence(evidence: ExamAttemptEvidence) {
  if (!evidence.passed || !evidence.certificate_code || !evidence.signed_at) {
    throw new Error("O certificado formal só pode ser emitido para aprovação assinada e com código de validação.");
  }
}

export function buildAptitudeCertificateHtml(
  evidence: ExamAttemptEvidence,
  options: CertificateDocumentOptions = {},
) {
  assertCertificateEvidence(evidence);
  const minApproval = Number(evidence.min_approval_pct ?? 70);
  const examType = evidence.exam_type || "Avaliação teórica";
  const signer = evidence.signature_name || evidence.employee_name;
  const autoPrint = Boolean(options.autoPrint);
  const preview = Boolean(options.preview);
  const density = densityClass(evidence);
  const employeeNameClass = nameClass(evidence.employee_name);
  const examTitleClass = activityClass(evidence.exam_title);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificado de Capacitação · SEGEMPAT</title>
<style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#e4e5e8;font-family:Arial,Helvetica,sans-serif;color:#171A1F}
body{min-width:210mm}
.document-stage{width:210mm;margin:0 auto;padding:8mm 0}
.page{position:relative;width:210mm;height:297mm;margin:0 auto 8mm;background:#fff;padding:16mm 18mm 20mm;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,.14);break-after:page;page-break-after:always}
.page:last-of-type{margin-bottom:0;break-after:auto;page-break-after:auto}
.page:before{content:"";position:absolute;inset:9mm;border:1px solid #d6d8dc;pointer-events:none}
.page:after{content:"";position:absolute;inset:12mm;border:1.5px solid #C8102E;pointer-events:none}
.topbar{position:absolute;left:0;right:0;top:0;height:6mm;background:#C8102E}
.watermark{position:absolute;right:-7mm;bottom:34mm;font-family:Georgia,'Times New Roman',serif;font-weight:900;font-size:82px;letter-spacing:-5px;color:rgba(23,26,31,.035);transform:rotate(-90deg);transform-origin:center;pointer-events:none}
.content{position:relative;z-index:1}
.brand{text-align:center;padding-bottom:6mm}
.brand img{display:block;height:21mm;max-width:58mm;object-fit:contain;margin:0 auto 2mm}
.company{font-size:10px;font-weight:900;letter-spacing:.55px}
.unit{margin-top:2px;font-size:8px;color:#60656F;letter-spacing:.6px;text-transform:uppercase}
.eyebrow{margin-top:2mm;color:#C8102E;font-size:8px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase}
.title{text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:29px;letter-spacing:1.2px;margin:4mm 0 2mm}
.goldline{width:56mm;height:1px;background:#A68549;margin:0 auto 5mm}
.lead{max-width:157mm;margin:0 auto;text-align:center;color:#51565f;font-size:10.5px;line-height:1.58}
.person{text-align:center;margin:6mm auto 5mm;padding:0 4mm}
.person-name{font-size:21px;font-weight:900;line-height:1.12;overflow-wrap:anywhere}
.person-name.name-long{font-size:18px}.person-name.name-xlong{font-size:15.5px}
.person-meta{margin-top:2mm;color:#C8102E;font-size:8.5px;font-weight:900;letter-spacing:.45px;overflow-wrap:anywhere}
.activity{text-align:center;margin:5mm auto 6mm;padding:0 5mm}
.label{font-size:7px;color:#747982;font-weight:900;letter-spacing:1px;text-transform:uppercase}
.activity-title{margin-top:2mm;font-size:13.5px;font-weight:900;line-height:1.25;overflow-wrap:anywhere}
.activity-title.activity-long{font-size:12px}.activity-title.activity-xlong{font-size:10.5px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:5mm 10mm;margin:6mm 7mm 0}
.field{min-width:0;padding-bottom:2.5mm;border-bottom:1px solid #E7E9ED}
.value{margin-top:1.7mm;font-size:9.5px;font-weight:900;line-height:1.3;overflow-wrap:anywhere}
.conclusion{margin:7mm 7mm 0;background:#F6F7F9;border:1px solid #ECEDEF;border-radius:4mm;padding:4.5mm 6mm;display:flex;justify-content:space-between;align-items:center;gap:8mm;break-inside:avoid}
.approved{font-size:17px;font-weight:900;color:#C8102E;margin-top:1.5mm}
.criterion{text-align:right;color:#60656F;font-size:8px;line-height:1.4}.criterion strong{display:block;color:#171A1F;font-size:9.5px;margin-top:1mm}
.validation{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin:8mm 7mm 0;padding-top:5mm;border-top:1px solid #E7E9ED;break-inside:avoid}
.validation-block{min-height:29mm;min-width:0}.validation-line{height:14mm;border-bottom:1px solid #A68549;margin-bottom:2mm}
.institution{font-size:8.5px;font-weight:900;text-align:center}.institution-sub{text-align:center;color:#60656F;font-size:7px;line-height:1.35}
.code-box{min-height:29mm;border:1px dashed #C8102E;border-radius:3mm;padding:3.5mm;background:#fffafa}
.code{font-family:'Courier New',monospace;font-weight:900;font-size:9.5px;color:#C8102E;overflow-wrap:anywhere;word-break:break-word;margin:1.5mm 0}
.code-help{font-size:6.8px;color:#60656F;line-height:1.4}
.footer{position:absolute;z-index:2;left:18mm;right:18mm;bottom:14mm;text-align:center;color:#737780;font-size:6.5px}.footer strong{color:#171A1F}
.annex-title{text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:23px;margin:3mm 0 1mm}
.annex-sub{text-align:center;color:#C8102E;font-size:7.5px;font-weight:900;letter-spacing:1.1px;text-transform:uppercase;margin:0 auto 6mm;max-width:160mm;overflow-wrap:anywhere}
.identity{display:grid;grid-template-columns:1.35fr .85fr 1fr;gap:4mm;background:#F6F7F9;border-radius:3mm;padding:4mm 5mm;margin:0 4mm 6mm;break-inside:avoid}
.identity .field,.record .field{border-bottom:0;padding:0}.identity .value,.record .value{font-size:9px}
.section{margin:0 4mm 6mm}.section-head{font-size:8px;color:#C8102E;font-weight:900;letter-spacing:1px;text-transform:uppercase;padding-bottom:2.2mm;border-bottom:1px solid #C8102E}
.program{margin-top:3.5mm;color:#343840;font-size:9.5px;line-height:1.48;padding:0 2mm;overflow-wrap:anywhere}
.program p{margin:0}.program ul{margin:0;padding-left:5mm}.program li{margin:0 0 1.5mm}.program-empty{color:#60656F;font-style:italic}
.density-compact .program{font-size:8.5px;line-height:1.38}.density-compact .program li{margin-bottom:1mm}.density-compact .section{margin-bottom:5mm}
.density-dense .brand{padding-bottom:4mm}.density-dense .brand img{height:17mm}.density-dense .annex-title{font-size:20px;margin-top:2mm}.density-dense .annex-sub{margin-bottom:4mm}.density-dense .identity{padding:3mm 4mm;margin-bottom:4mm}.density-dense .section{margin-bottom:4mm}.density-dense .program{margin-top:2.5mm;font-size:7.4px;line-height:1.3}.density-dense .program li{margin-bottom:.6mm}.density-dense .metrics{margin-top:2.5mm}.density-dense .metric{padding:2.5mm}.density-dense .record{margin-top:2.5mm}.density-dense .evidence-note{margin-top:3mm}
.no-answer-key{margin:3mm 2mm 0;color:#737780;font-size:6.8px;line-height:1.35}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:3.5mm;margin-top:3.5mm;break-inside:avoid}.metric{min-width:0;background:#F6F7F9;border-radius:2.5mm;padding:3mm}.metric .value{font-size:9.5px}.metric.approved-metric .value{color:#C8102E}
.record{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm 8mm;margin-top:3.5mm;break-inside:avoid}.record-item{min-width:0;padding-bottom:2mm;border-bottom:1px solid #E7E9ED}
.evidence-note{margin-top:4mm;border-left:3px solid #A68549;padding:2mm 0 2mm 4mm;color:#60656F;font-size:7px;line-height:1.4;break-inside:avoid}
.layout-warning{display:none;position:fixed;z-index:9999;left:50%;top:18px;transform:translateX(-50%);width:min(720px,calc(100vw - 32px));padding:14px 16px;border:1px solid #b42318;border-radius:12px;background:#fff4f2;color:#7a271a;font-size:13px;font-weight:700;line-height:1.45;box-shadow:0 10px 30px rgba(0,0,0,.18)}
body.certificate-layout-error .layout-warning{display:block}
${preview ? ".document-stage{padding-top:0}.page{box-shadow:0 10px 28px rgba(0,0,0,.12)}" : ""}
@media print{html,body{width:210mm;background:#fff}.document-stage{padding:0}.page{margin:0;box-shadow:none}.layout-warning{display:none!important}}
</style>
</head>
<body class="${density}">
<div class="layout-warning" role="alert">A diagramação excedeu a área segura de uma das páginas A4. A impressão foi bloqueada para evitar certificado cortado ou desalinhado. Revise principalmente o título e o conteúdo programático da atividade.</div>
<main class="document-stage" aria-label="Certificado oficial SEGEMPAT">
<section class="page certificate-cover" data-certificate-page="1">
<div class="topbar"></div><div class="watermark">EMPAT</div>
<div class="content"><header class="brand"><img data-required-asset="logo" src="${LOGO_URL}" alt="EMPAT"><div class="company">EMPRESA ALAGOANA DE TERMINAIS</div><div class="unit">Unidade de Segurança Portuária · Porto de Maceió - Alagoas</div><div class="eyebrow">Certificado de Capacitação Interna</div></header>
<h1 class="title">CERTIFICADO</h1><div class="goldline"></div>
<p class="lead">A Empresa Alagoana de Terminais, por meio da Unidade de Segurança Portuária, certifica que o profissional abaixo identificado concluiu com aproveitamento a atividade de capacitação interna registrada no Sistema SEGEMPAT.</p>
<div class="person"><div class="person-name ${employeeNameClass}">${esc(evidence.employee_name)}</div><div class="person-meta">MATRÍCULA ${esc(evidence.matricula)} · SETOR ${esc(evidence.sector)}</div></div>
<div class="activity"><div class="label">Atividade de capacitação</div><div class="activity-title ${examTitleClass}">${esc(evidence.exam_title)}</div></div>
<div class="fields"><div class="field"><div class="label">Modalidade</div><div class="value">${esc(examType)}</div></div><div class="field"><div class="label">Data de conclusão</div><div class="value">${esc(fmtDate(evidence.finished_at))}</div></div><div class="field"><div class="label">Unidade emissora</div><div class="value">Unidade de Segurança Portuária</div></div><div class="field"><div class="label">Registro</div><div class="value">SEGEMPAT · Porto de Maceió</div></div></div>
<div class="conclusion"><div><div class="label">Conclusão</div><div class="approved">APROVADO</div></div><div class="criterion">Critério mínimo de aprovação<strong>${minApproval}% de aproveitamento</strong></div></div>
<div class="validation"><div class="validation-block"><div class="label">Validação institucional</div><div class="validation-line"></div><div class="institution">UNIDADE DE SEGURANÇA PORTUÁRIA</div><div class="institution-sub">Registro eletrônico emitido pelo SEGEMPAT</div></div><div class="validation-block"><div class="label">Autenticidade eletrônica</div><div class="code-box"><div class="code">${esc(evidence.certificate_code)}</div><div class="code-help">Código verificável na área interna de Validação de Certificados do SEGEMPAT. A validade depende de aprovação, assinatura eletrônica, registro formal correspondente e ausência de revogação.</div></div></div></div></div>
<div class="footer"><strong>SEGEMPAT</strong> · Gestão • Operações • Desempenho · Documento 1 de 2</div>
</section>
<section class="page certificate-annex" data-certificate-page="2">
<div class="topbar"></div><div class="watermark">SEGEMPAT</div>
<div class="content"><header class="brand"><img data-required-asset="logo" src="${LOGO_URL}" alt="EMPAT"><div class="company">EMPRESA ALAGOANA DE TERMINAIS</div><div class="unit">Unidade de Segurança Portuária · Porto de Maceió - Alagoas</div><div class="eyebrow">Anexo Técnico ao Certificado</div></header>
<h2 class="annex-title">CONTEÚDO PROGRAMÁTICO</h2><div class="annex-sub">Anexo integrante do certificado ${esc(evidence.certificate_code)}</div>
<div class="identity"><div class="field"><div class="label">Profissional</div><div class="value">${esc(evidence.employee_name)}</div></div><div class="field"><div class="label">Matrícula / setor</div><div class="value">${esc(evidence.matricula)} · ${esc(evidence.sector)}</div></div><div class="field"><div class="label">Atividade</div><div class="value">${esc(evidence.exam_title)}</div></div></div>
<section class="section"><div class="section-head">01 · Conteúdo da atividade</div><div class="program">${programHtml(evidence.exam_description)}</div><div class="no-answer-key">O anexo técnico não reproduz gabarito, banco de questões nem respostas individuais do avaliado.</div></section>
<section class="section"><div class="section-head">02 · Critérios e registro de aproveitamento</div><div class="metrics"><div class="metric"><div class="label">Modalidade</div><div class="value">${esc(examType)}</div></div><div class="metric"><div class="label">Resultado final</div><div class="value">${Number(evidence.score).toFixed(1)} / 10,0</div></div><div class="metric"><div class="label">Mínimo exigido</div><div class="value">${minApproval}%</div></div><div class="metric approved-metric"><div class="label">Situação</div><div class="value">APROVADO</div></div><div class="metric"><div class="label">Conclusão</div><div class="value">${esc(fmtDate(evidence.finished_at))}</div></div><div class="metric"><div class="label">Aproveitamento</div><div class="value">${esc(String(evidence.accuracy_pct))}%</div></div></div></section>
<section class="section"><div class="section-head">03 · Registro da capacitação</div><div class="record"><div class="record-item"><div class="label">Unidade emissora</div><div class="value">Unidade de Segurança Portuária</div></div><div class="record-item"><div class="label">Código do certificado</div><div class="value code">${esc(evidence.certificate_code)}</div></div><div class="record-item"><div class="label">Assinatura eletrônica do avaliado</div><div class="value">${esc(signer)}</div></div><div class="record-item"><div class="label">Registro da assinatura</div><div class="value">${esc(fmtDateTime(evidence.signed_at))}</div></div></div><div class="evidence-note"><strong>Validade documental:</strong> este anexo integra o certificado identificado pelo mesmo código único. A situação vigente deve ser consultada no SEGEMPAT para identificar eventual revogação.</div></section></div>
<div class="footer"><strong>SEGEMPAT</strong> · Gestão • Operações • Desempenho · Documento 2 de 2</div>
</section>
</main>
<script>
(function(){
  var AUTO_PRINT=${autoPrint ? "true" : "false"};
  function notify(status, detail){
    var payload={type:"segempat-certificate-layout",status:status,detail:detail||null};
    try{if(window.parent&&window.parent!==window)window.parent.postMessage(payload,"*");}catch(_error){}
    try{if(window.opener)window.opener.postMessage(payload,"*");}catch(_error){}
  }
  function waitForAssets(){
    var images=Array.prototype.slice.call(document.querySelectorAll("img[data-required-asset]"));
    return Promise.all(images.map(function(img){
      if(img.complete) return img.naturalWidth>0 ? Promise.resolve() : Promise.reject(new Error("logo"));
      return new Promise(function(resolve,reject){img.addEventListener("load",resolve,{once:true});img.addEventListener("error",function(){reject(new Error("logo"));},{once:true});});
    }));
  }
  function waitForFonts(){return document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();}
  function nextPaint(){return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});}
  function fitsPage(page){
    var content=page.querySelector(".content");
    var footer=page.querySelector(".footer");
    if(!content||!footer)return false;
    var pageRect=page.getBoundingClientRect();
    var contentRect=content.getBoundingClientRect();
    var footerRect=footer.getBoundingClientRect();
    var verticalSafe=contentRect.bottom<=footerRect.top-8;
    var horizontalSafe=contentRect.left>=pageRect.left+50&&contentRect.right<=pageRect.right-50;
    return verticalSafe&&horizontalSafe;
  }
  function validateLayout(){
    var pages=Array.prototype.slice.call(document.querySelectorAll("[data-certificate-page]"));
    return pages.length===2&&pages.every(fitsPage);
  }
  async function prepare(){
    notify("preparing");
    try{
      await Promise.all([waitForAssets(),waitForFonts()]);
      await nextPaint();
      var fit=validateLayout();
      window.__SEGEMPAT_CERTIFICATE_READY__=true;
      window.__SEGEMPAT_CERTIFICATE_FIT__=fit;
      document.body.classList.toggle("certificate-layout-error",!fit);
      if(!fit){notify("layout-error","overflow");return;}
      document.body.classList.add("certificate-ready");
      notify("ready");
      if(AUTO_PRINT)window.print();
    }catch(_error){
      window.__SEGEMPAT_CERTIFICATE_READY__=true;
      window.__SEGEMPAT_CERTIFICATE_FIT__=false;
      document.body.classList.add("certificate-layout-error");
      notify("asset-error","logo");
    }
  }
  if(document.readyState==="complete")prepare();else window.addEventListener("load",prepare,{once:true});
})();
</script>
</body></html>`;
}

export function openAptitudeCertificate(evidence: ExamAttemptEvidence, existingPopup?: Window | null) {
  assertCertificateEvidence(evidence);
  const popup = existingPopup && !existingPopup.closed ? existingPopup : window.open("", "_blank", "width=980,height=900");
  if (!popup) throw new Error("O navegador bloqueou a abertura do certificado. Autorize pop-ups para imprimir ou salvar em PDF.");
  popup.document.open();
  popup.document.write(buildAptitudeCertificateHtml(evidence, { autoPrint: true }));
  popup.document.close();
}
