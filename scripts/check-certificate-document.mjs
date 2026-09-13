import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`${label}: conteúdo obrigatório ausente: ${text}`);
}

function forbidText(source, text, label) {
  if (source.includes(text)) throw new Error(`${label}: conteúdo proibido presente: ${text}`);
}

const documentSource = read("src/lib/certificate-document.ts");
const previewSource = read("src/routes/_authenticated/certificado.$attemptId.tsx");
const operatorSource = read("src/routes/_authenticated/certificados.tsx");
const signaturesSource = read("src/components/certificates/ExamSignaturesWorkspace.tsx");
const validationSource = read("src/components/certificates/CertificateValidationWorkspace.tsx");
const evidenceSource = read("server/src/routes/exam-evidence.js");
const examTypesSource = read("src/lib/exams.ts");

requireText(documentSource, "buildAptitudeCertificateHtml", "fonte única do certificado");
requireText(documentSource, "Certificado de Capacitação Interna", "documento imprimível");
requireText(documentSource, "CONTEÚDO PROGRAMÁTICO", "documento imprimível");
requireText(documentSource, "!evidence.passed || !evidence.certificate_code || !evidence.signed_at", "bloqueio defensivo");
requireText(documentSource, "height:297mm", "geometria A4 fixa");
requireText(documentSource, "print-color-adjust:exact", "fidelidade de impressão");
requireText(documentSource, "waitForAssets", "espera de ativos obrigatórios");
requireText(documentSource, "waitForFonts", "espera de fontes");
requireText(documentSource, "validateLayout", "validação de enquadramento");
requireText(documentSource, "certificate-layout-error", "bloqueio contra corte");
requireText(documentSource, "if(AUTO_PRINT)window.print()", "impressão condicionada à validação");
requireText(documentSource, "não reproduz gabarito, banco de questões nem respostas individuais", "privacidade do certificado");
forbidText(documentSource, "setTimeout(()=>window.print(),300)", "impressão prematura");
forbidText(documentSource, "EVIDÊNCIA DA AVALIAÇÃO", "documento imprimível");
forbidText(documentSource, "Resposta registrada", "documento imprimível");
forbidText(documentSource, "evidence.questions.map", "documento imprimível");
forbidText(documentSource, "NÃO APTO", "documento imprimível");

requireText(previewSource, "buildAptitudeCertificateHtml(ev, { preview: true })", "preview idêntica ao documento");
requireText(previewSource, "hasPermission(user, \"certificates.manage\")", "permissão granular da emissão");
requireText(previewSource, "layoutStatus", "estado de validação da diagramação");
requireText(previewSource, "Imprimir / salvar PDF", "emissão do documento");
requireText(previewSource, "A prévia e a impressão usam o mesmo modelo", "fonte visual única");
forbidText(previewSource, "window.alert", "erro de impressão refinado");
forbidText(previewSource, "ev.questions.map", "preview do certificado");
forbidText(previewSource, "Resposta registrada", "preview do certificado");

requireText(signaturesSource, "hasPermission(user, \"certificates.manage\")", "permissão granular das assinaturas");
requireText(signaturesSource, "FORMALIZAÇÃO PENDENTE", "estado documental preciso");
requireText(signaturesSource, "ASSINATURA PENDENTE", "estado de assinatura preciso");
requireText(signaturesSource, "CERTIFICADO VÁLIDO", "estado vigente preciso");
requireText(validationSource, "hasPermission(user, \"certificates.manage\")", "permissão granular da validação");
requireText(validationSource, "Formalização administrativa pendente", "validação sem falso status de assinatura");
requireText(operatorSource, "EM FORMALIZAÇÃO", "status do operador");
requireText(operatorSource, "ASSINATURA PENDENTE", "pendência do operador");

requireText(evidenceSource, "e.description AS exam_description", "metadados da ementa");
requireText(evidenceSource, "e.min_approval_pct", "critério de aprovação");
requireText(evidenceSource, "exam_type: attempt.exam_type", "modalidade da atividade");
requireText(examTypesSource, "exam_description?: string | null", "contrato frontend");
requireText(examTypesSource, "min_approval_pct?: number", "contrato frontend");

console.log("SEGEMPAT official certificate document contract: OK");
