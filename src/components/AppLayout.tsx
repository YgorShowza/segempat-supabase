import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  LayoutDashboard,
  ClipboardList,
  TrendingUp,
  Award,
  ClipboardCheck,
  Users,
  BarChart3,
  FileText,
  BookOpen,
  BookOpenCheck,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Target,
  FileBarChart,
  History,
  AlertTriangle,
  BellRing,
  FileSpreadsheet,
  PlusCircle,
  Menu,
  CalendarDays,
  Layers3,
  CalendarClock,
  GraduationCap,
  Activity,
  BrainCircuit,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useTheme } from "@/components/ThemeProvider";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useApiReadiness } from "@/lib/useApiReadiness";
import { logoutSession } from "@/lib/backend/auth-gateway";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1117d573bbf85981b1abee/8271ac857_IMG_9226.png";

type MenuItem = { path: string; label: string; icon: LucideIcon };
type MenuSection = { section: string; icon: LucideIcon; items: MenuItem[] };

const adminSections: MenuSection[] = [
  {
    section: "Comando Operacional",
    icon: Activity,
    items: [
      { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { path: "/atencao", label: "Central de Atenção", icon: BellRing },
      { path: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    section: "Equipe & Desempenho",
    icon: Users,
    items: [
      { path: "/equipe", label: "Equipe", icon: Users },
      { path: "/risco", label: "Zona de Risco", icon: Target },
      { path: "/individual", label: "Análise Individual", icon: FileBarChart },
    ],
  },
  {
    section: "Operação",
    icon: ClipboardCheck,
    items: [
      { path: "/cronograma", label: "Cronograma", icon: CalendarDays },
      { path: "/ocorrencias", label: "Ocorrências", icon: AlertTriangle },
      { path: "/avaliacao-pratica", label: "Avaliação Prática", icon: ClipboardCheck },
    ],
  },
  {
    section: "Capacitação",
    icon: GraduationCap,
    items: [
      { path: "/provas-criar", label: "Criar Prova", icon: PlusCircle },
      { path: "/provas", label: "Provas", icon: FileText },
      { path: "/banco-questoes", label: "Banco de Questões", icon: BookOpenCheck },
      { path: "/modulos-treinamento", label: "Módulos", icon: Layers3 },
      { path: "/ciclos-treinamento", label: "Ciclos e Vencimentos", icon: CalendarClock },
      { path: "/conteudos", label: "Conteúdos", icon: BookOpen },
      { path: "/assinaturas-provas", label: "Certificados e Assinaturas", icon: ClipboardCheck },
      { path: "/validar-certificados", label: "Validar Certificados", icon: Award },
    ],
  },
  {
    section: "Relatórios & Inteligência",
    icon: BrainCircuit,
    items: [
      { path: "/relatorios", label: "Central de Relatórios", icon: FileSpreadsheet },
      { path: "/ia-base", label: "IA Base", icon: BookOpenCheck },
    ],
  },
  {
    section: "Governança",
    icon: ShieldCheck,
    items: [
      { path: "/acessos", label: "Acessos", icon: ClipboardList },
      { path: "/auditoria", label: "Auditoria", icon: History },
      { path: "/documento-seguranca", label: "Documento de Segurança", icon: FileText },
    ],
  },
];

const operadorMenu: MenuItem[] = [
  { path: "/painel", label: "Início", icon: LayoutDashboard },
  { path: "/pendencias", label: "Pendências", icon: ClipboardList },
  { path: "/progresso", label: "Progresso", icon: TrendingUp },
  { path: "/certificados", label: "Certificados", icon: Award },
  { path: "/treinamentos", label: "Academia SEGEMPAT", icon: GraduationCap },
  { path: "/conteudos", label: "Base de Conhecimento", icon: BookOpen },
  { path: "/meu-perfil", label: "Meu Perfil", icon: Users },
  { path: "/pratico", label: "Avaliação Prática", icon: ClipboardCheck },
  { path: "/minhas-ocorrencias", label: "Ocorrências", icon: AlertTriangle },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light" as const, icon: Sun, label: "Claro" },
    { value: "dark" as const, icon: Moon, label: "Escuro" },
    { value: "auto" as const, icon: Monitor, label: "Auto" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <motion.button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors duration-150"
            style={active
              ? { background: "#C8102E", color: "#fff", boxShadow: "0 3px 12px rgba(200,16,46,.20)" }
              : { color: "var(--text-3)" }}
            aria-label={`Tema ${opt.label}`}
            title={`Tema ${opt.label}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden text-[10px] font-bold 2xl:inline">{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function MenuLink({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  return (
    <Link to={item.path} className="block" activeOptions={{ exact: item.path === "/admin" || item.path === "/painel" }}>
      {({ isActive }) => (
        <div
          className="segempat-sidebar-link relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-150"
          data-active={isActive ? "true" : "false"}
          style={isActive
            ? { background: "linear-gradient(135deg,#e0142f,#C8102E)", border: "1px solid rgba(255,84,112,.34)", boxShadow: "0 8px 20px rgba(200,16,46,.18)" }
            : { border: "1px solid transparent" }}
        >
          <Icon className="h-[17px] w-[17px] shrink-0" style={{ color: isActive ? "#fff" : "var(--text-3)" }} />
          <span className="text-[13px] font-semibold tracking-wide" style={{ color: isActive ? "#fff" : "var(--text-2)" }}>{item.label}</span>
        </div>
      )}
    </Link>
  );
}

function MobileNavLink({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  const shortLabel = item.path === "/treinamentos" ? "Academia" : item.label;
  return <Link to={item.path} className="flex-1" activeOptions={{ exact: true }}>{({ isActive }) => <div className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors duration-150" style={isActive ? { background: "var(--accent-soft)" } : {}}><Icon className="h-5 w-5" style={{ color: isActive ? "var(--accent)" : "var(--text-4)" }} /><span className="text-[10px] font-medium" style={{ color: isActive ? "var(--accent)" : "var(--text-4)" }}>{shortLabel}</span></div>}</Link>;
}

function routeMatches(pathname: string, itemPath: string) {
  if (itemPath === "/admin") return pathname === itemPath;
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function AdminNavItems({ pathname }: { pathname: string }) {
  const activeSection = adminSections.find((section) => section.items.some((item) => routeMatches(pathname, item.path)))?.section;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => Object.fromEntries(
    adminSections.map((section) => [section.section, section.section === "Comando Operacional" || section.section === activeSection]),
  ));

  useEffect(() => {
    if (!activeSection) return;
    setOpenSections((current) => current[activeSection] ? current : { ...current, [activeSection]: true });
  }, [activeSection]);

  return (
    <div className="space-y-2">
      {adminSections.map((section) => {
        const SectionIcon = section.icon;
        const isOpen = Boolean(openSections[section.section]);
        const isActive = activeSection === section.section;
        return (
          <div
            key={section.section}
            className="overflow-hidden rounded-2xl transition-colors"
            style={{
              background: isActive ? "var(--accent-soft)" : "transparent",
              border: isActive ? "1px solid rgba(200,16,46,.20)" : "1px solid transparent",
            }}
          >
            <button
              type="button"
              onClick={() => setOpenSections((current) => ({ ...current, [section.section]: !current[section.section] }))}
              className="segempat-sidebar-section flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors"
              aria-expanded={isOpen}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: isActive ? "var(--accent-soft2)" : "var(--bg-surface-2)" }}>
                <SectionIcon className="h-3.5 w-3.5" style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-black uppercase tracking-[.13em]" style={{ color: isActive ? "var(--accent)" : "var(--text-2)" }}>{section.section}</p>
                <p className="mt-0.5 text-[9px]" style={{ color: "var(--text-4)" }}>{section.items.length} funções</p>
              </div>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-4)" }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-4)" }} />}
            </button>
            {isOpen && <div className="space-y-1 px-1.5 pb-2">{section.items.map((item) => <MenuLink key={item.path} item={item} />)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function NavItems({ isAdmin, pathname }: { isAdmin: boolean; pathname: string }) {
  if (!isAdmin) return <div className="space-y-1.5">{operadorMenu.map((item) => <MenuLink key={item.path} item={item} />)}</div>;
  return <AdminNavItems pathname={pathname} />;
}

function HeaderClock() {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => { const interval = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(interval); }, []);
  const timeStr = currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Maceio" });
  const dateStr = currentTime.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Maceio" });
  return <div className="text-right"><p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{timeStr}</p><p className="text-[11px] capitalize" style={{ color: "var(--text-4)" }}>{dateStr}</p></div>;
}

function SidebarIdentity({ user, isAdmin }: { user: ReturnType<typeof useCurrentUser>["data"]; isAdmin: boolean }) {
  const initial = user?.nome?.trim()?.charAt(0)?.toUpperCase() || "S";
  return (
    <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white" style={{ background: "linear-gradient(135deg,#e0142f,#C8102E)", boxShadow: "0 8px 18px rgba(200,16,46,.20)" }}>{initial}</div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-black" style={{ color: "var(--text-1)" }}>{user?.nome ?? "SEGEMPAT"}</p>
          <p className="mt-0.5 text-[10px] font-mono" style={{ color: "var(--text-4)" }}>Mat. {user?.matricula ?? "—"}</p>
        </div>
      </div>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-black" style={{ background: "var(--accent-soft)", border: "1px solid rgba(200,16,46,.28)", color: "var(--accent)" }}>
        <span className="h-1.5 w-1.5 rounded-full bg-[#C8102E]" />
        {isAdmin ? "Inspetor" : "Operador"}{user?.setor ? ` · ${user.setor}` : ""}
      </div>
    </div>
  );
}

function SidebarFooter({ loggingOut, onLogout }: { loggingOut: boolean; onLogout: () => void }) {
  return (
    <div className="space-y-3 px-3 pb-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 px-1">
          <Palette className="h-3.5 w-3.5" style={{ color: "var(--text-4)" }} />
          <span className="text-[9px] font-black uppercase tracking-[.14em]" style={{ color: "var(--text-4)" }}>Tema da interface</span>
        </div>
        <ThemeToggle />
      </div>
      <button
        disabled={loggingOut}
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-150 disabled:opacity-50"
        style={{ border: "1px solid rgba(200,16,46,.26)", background: "var(--accent-soft)" }}
      >
        <LogOut className="h-[17px] w-[17px]" style={{ color: "var(--accent)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>{loggingOut ? "Saindo..." : "Sair do sistema"}</span>
      </button>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const apiReadiness = useApiReadiness();
  const isAdmin = user?.isAdmin ?? false;
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const apiUnavailable = apiReadiness === "unavailable";
  const apiChecking = apiReadiness === "checking";
  const apiStatusLabel = apiUnavailable ? "Indisponível" : apiChecking ? "Verificando" : "Online";
  const apiStatusColor = apiUnavailable ? "#ef4444" : apiChecking ? "#f59e0b" : "#22c55e";

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutSession();
      await queryClient.cancelQueries();
      queryClient.clear();
      navigate({ to: "/", replace: true });
    } catch (error) {
      console.error("Falha ao encerrar sessão", error);
      toast.error("Não foi possível encerrar a sessão. Tente novamente.");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <aside
        className="fixed bottom-0 left-0 top-0 z-40 hidden w-72 flex-col lg:flex"
        style={{ background: "var(--header-bg)", borderRight: "1px solid var(--border)", boxShadow: "8px 0 24px rgba(15,23,42,.035)" }}
      >
        <div className="px-4 pb-4 pt-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center justify-center">
            <div className="overflow-hidden rounded-xl bg-white p-1.5" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
              <img src={LOGO_URL} alt="EMPAT" className="h-12 w-auto object-contain" />
            </div>
          </div>
        </div>
        <SidebarIdentity user={user} isAdmin={isAdmin} />
        <nav className="flex-1 overflow-y-auto px-3 py-3"><NavItems isAdmin={isAdmin} pathname={pathname} /></nav>
        <SidebarFooter loggingOut={loggingOut} onLogout={handleLogout} />
      </aside>

      <div className="flex min-h-screen flex-col lg:ml-72">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 md:px-6" style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)", backdropFilter: "blur(12px)" }}>
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild><button className="shrink-0 rounded-lg p-2 lg:hidden" style={{ color: "var(--text-2)", border: "1px solid var(--border)", background: "var(--bg-surface)" }} aria-label="Abrir menu"><Menu className="h-5 w-5" /></button></SheetTrigger>
              <SheetContent
                side="left"
                className="segempat-sidebar-sheet w-[86vw] max-w-[340px] border-0 p-0 sm:max-w-[340px]"
                style={{ background: "var(--header-bg)", color: "var(--text-1)" }}
              >
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex h-full flex-col" style={{ background: "var(--header-bg)" }}>
                  <div className="px-4 pb-4 pt-5" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-center">
                      <div className="overflow-hidden rounded-xl bg-white p-1.5" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
                        <img src={LOGO_URL} alt="EMPAT" className="h-10 w-auto object-contain" />
                      </div>
                    </div>
                  </div>
                  <SidebarIdentity user={user} isAdmin={isAdmin} />
                  <nav className="flex-1 overflow-y-auto px-3 py-3"><NavItems isAdmin={isAdmin} pathname={pathname} /></nav>
                  <SidebarFooter loggingOut={loggingOut} onLogout={handleLogout} />
                </div>
              </SheetContent>
            </Sheet>
            <div className="shrink-0 overflow-hidden rounded-lg bg-white p-1 lg:hidden" style={{ border: "1px solid var(--border)" }}><img src={LOGO_URL} alt="EMPAT" className="h-8 w-auto object-contain" /></div>
            <div className="min-w-0"><p className="truncate text-sm font-bold" style={{ color: "var(--text-1)" }}>{user?.nome ?? "…"}</p><p className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>Mat. {user?.matricula ?? "—"}</p></div>
          </div>

          <div className="min-w-0 flex-1 px-1 md:flex md:justify-center"><GlobalSearch /></div>

          <div className="flex shrink-0 items-center gap-3 md:gap-4">
            <div className="hidden items-center gap-2 sm:flex" title={apiUnavailable ? "A API corporativa não passou no readiness" : undefined}><div className="relative flex h-2 w-2">{!apiUnavailable && !apiChecking && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: apiStatusColor }} />}<span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: apiStatusColor }} /></div><span className="hidden text-xs font-medium xl:inline" style={{ color: "var(--text-3)" }}>{apiStatusLabel}</span></div>
            <HeaderClock />
            <button disabled={loggingOut} onClick={handleLogout} className="rounded-lg p-2 transition-colors disabled:opacity-50 lg:hidden" style={{ color: "var(--text-3)" }} aria-label="Sair"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-24 lg:p-7 lg:pb-8 xl:p-8">{children}</main>

        {!isAdmin && <nav className="fixed bottom-0 left-0 right-0 z-40 px-2 py-1.5 lg:hidden" style={{ background: "var(--header-bg)", borderTop: "1px solid var(--border)", backdropFilter: "blur(12px)", paddingBottom: "max(.375rem, env(safe-area-inset-bottom))" }}><div className="flex items-center justify-around gap-1">{operadorMenu.slice(0, 5).map((item) => <MobileNavLink key={item.path} item={item} />)}</div></nav>}
      </div>
    </div>
  );
}
