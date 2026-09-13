import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[sensitive-read-redaction] ausente: ${label}`);
    process.exitCode = 1;
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    console.error(`[sensitive-read-redaction] proibido: ${label}`);
    process.exitCode = 1;
  }
}

const app = read("server/src/app.js");
const redaction = read("server/src/sensitive-read-redaction.js");
const authorization = read("server/src/authorization.js");
const exams = read("server/src/routes/exams.js");
const questionBank = read("server/src/routes/question-bank.js");

requireText(app, 'import { enforceSensitiveReadRedaction } from "./sensitive-read-redaction.js";', "middleware importado pela API");
requireText(app, 'app.use("/api", enforceSensitiveReadRedaction);', "middleware aplicado antes dos routers de domínio");

requireText(redaction, 'hasPermission(req.user, "exams.manage")', "gabarito completo restrito a gestão de provas");
requireText(redaction, 'questions: []', "questões administrativas redigidas em leitura compartilhada");
requireText(redaction, 'question_count: numericQuestionCount', "contagem de questões preservada sem expor conteúdo");
requireText(redaction, '"question_bank.manage", "exams.manage"', "respostas do banco disponíveis somente a gestores do domínio");
for (const field of ["correct_index", "correct_answer", "explanation"]) {
  requireText(redaction, `${field}: _`, `remoção de ${field} da leitura compartilhada`);
}
requireText(redaction, 'path === "/api/exams"', "proteção da listagem administrativa de provas");
requireText(redaction, '/^\\/api\\/exams\\/[^/]+\\/?$/.test(path)', "proteção do detalhe administrativo de prova com ou sem barra final");
requireText(redaction, 'path === "/api/question-bank"', "proteção da listagem administrativa do banco de questões");

requireText(authorization, '"dashboard.view"', "leituras gerenciais compartilhadas preservadas");
requireText(exams, "res.json(rows.map((row) => mapExam(row)))", "router continua oferecendo payload completo a gestor autorizado");
requireText(questionBank, "res.json(rows.map(mapAdmin))", "router continua oferecendo payload completo a gestor autorizado");

forbidText(redaction, "password_hash", "redaction não deve tocar credenciais");
forbidText(redaction, "session_epoch", "redaction não deve alterar sessão");

if (process.exitCode) process.exit(process.exitCode);
console.log("SEGEMPAT sensitive administrative read redaction contract: OK");
