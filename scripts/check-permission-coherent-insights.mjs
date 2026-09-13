import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[permission-coherent-insights] ausente: ${label}`);
    process.exitCode = 1;
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    console.error(`[permission-coherent-insights] proibido: ${label}`);
    process.exitCode = 1;
  }
}

const app = read("server/src/app.js");
const route = read("server/src/routes/insights.js");
const insights = read("src/lib/insights.ts");
const attention = read("src/lib/attention-center.ts");
const gateway = read("src/lib/backend/insights-gateway.ts");
const individual = read("src/lib/individual-analysis.ts");
const authorization = read("server/src/authorization.js");

requireText(app, 'import { insightsRouter } from "./routes/insights.js";', "router de insights importado");
requireText(app, 'app.use("/api/insights", insightsRouter);', "router de insights montado");

for (const permission of ["dashboard.view", "attention.view", "risk.view", "analytics.view", "reports.view"]) {
  requireText(route, `"${permission}"`, `visão gerencial reconhece ${permission}`);
}
requireText(route, '"/operational-snapshot"', "snapshot operacional read-only");
requireText(route, 'questions: []', "snapshot não transporta conteúdo/gabarito de provas");
requireText(route, 'JSON_LENGTH(questions) AS question_count', "snapshot preserva apenas contagem de questões");
requireText(route, '"/attention-support"', "projeção segura da Central de Atenção");
requireText(route, 'has_signature: asBool(row.has_signature)', "Central recebe apenas presença da assinatura");
requireText(route, '"/exam-attempts/:attemptId/evidence"', "evidência analítica dedicada");
requireText(route, 'requireAnyInsightPermission(["analytics.view"])', "evidência analítica exige analytics.view");
forbidText(route, "correct_answer:", "endpoint analítico não pode devolver gabarito de prova");

requireText(insights, "/api/insights/operational-snapshot?year=", "frontend corporativo usa snapshot dedicado");
forbidText(insights, "syncCronogramaWithExamAttempts", "consulta gerencial não pode executar sincronização mutável");
requireText(insights, "if (isSegempatApiConfigured())", "cutover corporativo preservado");
requireText(insights, "listAdminAttemptsByYear(year)", "composição demonstrativa preservada fora da API corporativa");

requireText(gateway, "/api/insights/attention-support", "gateway da Central usa projeção segura");
requireText(gateway, "/api/insights/exam-attempts/", "gateway de evidência usa API analítica");
requireText(attention, "getAttentionSupport", "Central usa suporte dedicado na API corporativa");
requireText(attention, "has_signature", "Central não depende de caminho físico da assinatura na API corporativa");
requireText(attention, "listCertificateRecords", "modo demonstração mantém fonte existente de certificados");
requireText(attention, "listTrainingSchedules", "modo demonstração mantém fonte existente de treinamentos");

requireText(individual, "getInsightExamAttemptEvidence", "Análise Individual não depende de certificates.manage");
forbidText(individual, "getAdminExamAttemptEvidence", "Análise Individual não deve usar endpoint administrativo de certificados");
requireText(individual, "Resposta de referência restrita ao gestor de provas", "gabarito permanece protegido na análise read-only");

requireText(authorization, 'if (path.startsWith("/api/admin/training"))', "gestão de treinamentos continua separada");
requireText(authorization, 'return requireForRequest(req, next, "training.manage")', "training.manage continua obrigatório na gestão");
requireText(authorization, 'if (path.startsWith("/api/admin"))', "área administrativa de certificados continua separada");
requireText(authorization, 'return requireForRequest(req, next, "certificates.manage")', "certificates.manage continua obrigatório na gestão");

if (process.exitCode) process.exit(process.exitCode);
console.log("SEGEMPAT permission-coherent management insights contract: OK");
