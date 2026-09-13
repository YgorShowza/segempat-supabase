import { AlertTriangle, Award, Database, FileCheck2, KeyRound, LockKeyhole, Network, Printer, ShieldCheck, UserCog } from "lucide-react";

const LOGO_URL = "https://media.base44.com/images/public/6a1117d573bbf85981b1abee/8271ac857_IMG_9226.png";

const SECTIONS = [
  {
    icon: KeyRound,
    title: "Autenticação e sessão",
    status: "Implementado no código",
    tone: "ok",
    items: [
      "Autenticação centralizada pela API SEGEMPAT, com matrícula e senha validadas no backend.",
      "Rotas internas validam a sessão antes de montar o ambiente autenticado.",
      "A sessão é mantida por cookie HTTP-only, evitando expor credenciais ao JavaScript do navegador.",
      "O logout encerra a sessão na API, cancela consultas em andamento e limpa o cache da aplicação.",
    ],
  },
  {
    icon: UserCog,
    title: "Perfis e autorização",
    status: "Implementado no código",
    tone: "ok",
    items: [
      "Perfis administrativos e operacionais são resolvidos no backend a partir do cadastro interno.",
      "A API diferencia Inspetoria e Operador antes de executar ações administrativas ou consultar dados restritos.",
      "Menus e telas administrativas continuam condicionados ao perfil do usuário.",
      "A autorização de dados não depende apenas da interface: os endpoints aplicam regras de acesso no servidor.",
    ],
  },
  {
    icon: Database,
    title: "Isolamento de dados no MySQL",
    status: "Implementado no código",
    tone: "ok",
    items: [
      "O frontend não se conecta diretamente ao MySQL; toda operação passa pela API SEGEMPAT.",
      "Consultas de Operador são filtradas pela sessão e matrícula do usuário autenticado.",
      "Operações administrativas são protegidas por middleware de autorização da Inspetoria.",
      "Módulos como provas, cronograma, treinamento, ocorrências e certificados seguem essa fronteira de acesso.",
    ],
  },
  {
    icon: FileCheck2,
    title: "Auditoria e rastreabilidade",
    status: "Implementado no código",
    tone: "ok",
    items: [
      "A aplicação mantém trilha de auditoria persistida em audit_logs no MySQL.",
      "A tela de Auditoria é restrita ao ambiente administrativo.",
      "Alterações operacionais relevantes registram usuário, ação, entidade e contexto no backend.",
    ],
  },
  {
    icon: Award,
    title: "Certificados verificáveis",
    status: "Parcial / em homologação",
    tone: "warn",
    items: [
      "Cada aprovação pode receber certificate_code único persistido no banco.",
      "A emissão formal exige aprovação, assinatura eletrônica e registro correspondente na tabela de certificados.",
      "A validação administrativa diferencia certificado válido, pendente e revogado; certificado revogado não pode ser apresentado como vigente.",
      "A visualização institucional de duas páginas está implementada, mas o salvamento/compartilhamento do PDF em iPhone continua em ajuste e não é considerado homologado.",
    ],
  },
  {
    icon: LockKeyhole,
    title: "Minimização e isolamento de dados",
    status: "Implementado no código",
    tone: "ok",
    items: [
      "O fluxo operacional trabalha principalmente com nome, matrícula, setor, perfil e dados de desempenho.",
      "O Operador recebe somente os dados necessários ao próprio contexto operacional.",
      "A administração concentra operações de cadastro, avaliação, cronograma, treinamento e auditoria.",
    ],
  },
  {
    icon: Network,
    title: "Rede corporativa, IP e VPN",
    status: "Requer infraestrutura",
    tone: "warn",
    items: [
      "A API SEGEMPAT deverá ser hospedada em ambiente definido pela empresa e conectada ao MySQL pela rede interna.",
      "Restrições por IP, VPN, firewall, proxy reverso ou WAF devem ser aplicadas na infraestrutura de publicação.",
      "A configuração final depende das regras de rede e segurança definidas pela TI responsável pela implantação.",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Pontos de homologação",
    status: "Requer validação",
    tone: "warn",
    items: [
      "Homologar login, primeiro acesso, logout e recuperação de sessão com Inspetor e Operador em fluxo real.",
      "Validar a API publicada contra o MySQL da empresa antes da implantação corporativa definitiva.",
      "Revisar retenção, backup, recuperação, logs e política de armazenamento das assinaturas com a TI.",
      "Concluir e validar o fluxo de exportação/compartilhamento do certificado nos navegadores móveis utilizados pela operação.",
      "Definir requisitos corporativos adicionais, como VPN, IP permitido, SSO ou MFA, antes da publicação definitiva.",
    ],
  },
] as const;

export function SecurityDocumentWorkspace() {
  const implemented = SECTIONS.filter((section) => section.tone === "ok").length;
  const pending = SECTIONS.length - implemented;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-10 print:max-w-none print:pb-0">
      <div className="flex items-center justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white"
          style={{ background: "#C8102E" }}
        >
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </button>
      </div>

      <header className="rounded-2xl p-5 md:p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="w-fit rounded-xl bg-white p-2.5">
            <img src={LOGO_URL} alt="EMPAT" className="h-12 w-auto object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "#C8102E" }}>
              <ShieldCheck className="h-4 w-4" /> Arquitetura de segurança
            </div>
            <h1 className="mt-1 text-2xl font-black" style={{ color: "var(--text-1)" }}>Documento de Segurança da Informação</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-4)" }}>SEGEMPAT · arquitetura alvo baseada em API própria, sessão no backend e MySQL corporativo.</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Controles no código" value={String(implemented)} />
          <Stat label="Itens de homologação" value={String(pending)} warn />
          <Stat label="Autenticação" value="API própria" />
          <Stat label="Banco alvo" value="MySQL" />
        </div>
      </header>

      <section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <p className="text-sm leading-6" style={{ color: "var(--text-2)" }}>
          Este documento acompanha a implantação do SEGEMPAT na arquitetura corporativa MySQL. O navegador se comunica com a API SEGEMPAT, e somente essa API acessa o banco interno. O frontend atual não possui fallback de backend; o modo demonstração permanece isolado e é desabilitado quando a API corporativa é configurada ou exigida. A indicação “implementado no código” descreve controles presentes no repositório e não substitui a homologação final no ambiente real da empresa.
        </p>
      </section>

      <div className="space-y-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const warn = section.tone === "warn";
          return (
            <section key={section.title} className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: `1px solid ${warn ? "rgba(245,158,11,.30)" : "var(--border)"}` }}>
              <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: warn ? "rgba(245,158,11,.10)" : "rgba(200,16,46,.08)" }}>
                  <Icon className="h-5 w-5" style={{ color: warn ? "#f59e0b" : "#C8102E" }} />
                </div>
                <h2 className="min-w-0 flex-1 text-sm font-black sm:text-base" style={{ color: "var(--text-1)" }}>{section.title}</h2>
                <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: warn ? "rgba(245,158,11,.10)" : "rgba(16,185,129,.10)", color: warn ? "#f59e0b" : "#10b981" }}>{section.status}</span>
              </div>
              <ul className="space-y-2 p-4">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-5" style={{ color: "var(--text-2)" }}>
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: warn ? "#f59e0b" : "#C8102E" }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="rounded-2xl p-4 text-xs" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
        Documento técnico gerado a partir da arquitetura atual do projeto SEGEMPAT. Data de referência: {new Date().toLocaleDateString("pt-BR", { timeZone: "America/Maceio" })}. A homologação corporativa depende do ambiente MySQL e da infraestrutura fornecida pela TI.
      </footer>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}>
      <p className="text-lg font-black" style={{ color: warn ? "#f59e0b" : "var(--text-1)" }}>{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{label}</p>
    </div>
  );
}
