import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  BellRing,
  BookOpen,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  History,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  ShieldCheck,
  Sun,
  Target,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useTheme } from "@/components/ThemeProvider";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useApiReadiness } from "@/lib/useApiReadiness";
import { logoutSession } from "@/lib/backend/auth-gateway";
import { canAccessAdminPath } from "@/lib/access-control";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const LOGO_URL = "/empat-logo-report.png";
const SIDEBAR_COLLAPSED_KEY = "segempat_sidebar_collapsed";

type MenuItem = { path: string; label: string; icon: LucideIcon };
type MenuSection = { section: string; description: string; icon: LucideIcon; items: MenuItem[] };

const adminPriorityMenu: MenuItem[] = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/atencao", label: "Central de Atenção", icon: BellRing },
  { path: "/producao-inspetoria", label: "Produção da Inspetoria", icon: ClipboardList },
];

const adminSections: MenuSection[] = [
  { section: "Operação", description: "Rotinas e registros do dia a dia", icon: Activity, items: [
    { path: "/ocorrencias", label: "Ocorrências", icon: AlertTriangle },
    { path: "/cronograma", label: "Cronograma", icon: CalendarDays },
    { path: "/avaliacao-pratica", label: "Avaliação Prática", icon: ClipboardCheck },
  ] },
  { section: "Equipe & Desempenho", description: "Pessoas, acompanhamento e evolução", icon: Users, items: [
    { path: "/equipe", label: "Equipe", icon: Users },
    { path: "/individual", label: "Análise Individual", icon: FileBarChart },
    { path: "/risco", label: "Zona de Risco", icon: Target },
  ] },
  { section: "Capacitação & Avaliação", description: "Formação, provas e certificações", icon: GraduationCap, items: [
    { path: "/provas-criar", label: "Criar Prova", icon: PlusCircle },
    { path: "/provas", label: "Provas", icon: FileText },
    { path: "/banco-questoes", label: "Banco de Questões", icon: BookOpenCheck },
    { path: "/modulos-treinamento", label: "Módulos", icon: Layers3 },
    { path: "/ciclos-treinamento", label: "Ciclos e Vencimentos", icon: CalendarClock },
    { path: "/conteudos", label: "Conteúdos", icon: BookOpen },
    { path: "/assinaturas-provas", label: "Certificados e Assinaturas", icon: ClipboardCheck },
    { path: "/validar-certificados", label: "Validar Certificados", icon: Award },
  ] },
  { section: "Análise & Relatórios", description: "Indicadores, consultas e documentos", icon: BarChart3, items: [
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/relatorios", label: "Central de Relatórios", icon: FileSpreadsheet },
    { path: "/ia-base", label: "IA Base", icon: BookOpenCheck },
  ] },
  { section: "Administração & Governança", description: "Acessos, auditoria e controles", icon: ShieldCheck, items: [
    { path: "/acessos", label: "Acessos", icon: ClipboardList },
    { path: "/auditoria", label: "Auditoria", icon: History },
    { path: "/documento-seguranca", label: "Documento de Segurança", icon: FileText },
  ] },
];

const operatorPriorityMenu: MenuItem[] = [
  { path: "/painel", label: "Início", icon: LayoutDashboard },
  { path: "/pendencias", label: "Pendências", icon: ClipboardList },
  { path: "/minhas-ocorrencias", label: "Ocorrências", icon: AlertTriangle },
];

const operatorSections: MenuSection[] = [
  { section: "Capacitação", description: "Aprendizado, provas e prática", icon: GraduationCap, items: [
    { path: "/treinamentos", label: "Academia SEGEMPAT", icon: GraduationCap },
    { path: "/provas", label: "Provas", icon: FileText },
    { path: "/conteudos", label: "Base de Conhecimento", icon: BookOpen },
    { path: "/pratico", label: "Avaliação Prática", icon: ClipboardCheck },
  ] },
  { section: "Desempenho", description: "Progresso e certificados", icon: TrendingUp, items: [
    { path: "/progresso", label: "Progresso", icon: TrendingUp },
    { path: "/certificados", label: "Certificados", icon: Award },
  ] },
  { section: "Conta", description: "Dados e identidade profissional", icon: UserRound, items: [
    { path: "/meu-perfil", label: "Meu Perfil", icon: UserRound },
  ] },
];

const operatorMenu: MenuItem[] = [
  ...operatorPriorityMenu,
  ...operatorSections.flatMap((section) => section.items),
];

const operatorQuickMenu = operatorMenu.filter((item) =>
  ["/painel", "/pendencias", "/minhas-ocorrencias", "/treinamentos", "/progresso"].includes(item.path),
);

function routeMatches(pathname: string, itemPath: string) {
  if (itemPath === "/admin" || itemPath === "/painel") return pathname === itemPath;
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function currentLocation(pathname: string, isAdmin: boolean) {
  if (routeMatches(pathname, "/meu-perfil")) return { section: "Conta", label: "Meu Perfil", icon: UserRound };
  if (isAdmin) {
    const priorityItem = adminPriorityMenu.find((candidate) => routeMatches(pathname, candidate.path));
    if (priorityItem) return { section: "Principal", label: priorityItem.label, icon: priorityItem.icon };
    for (const section of adminSections) {
      const item = section.items.find((candidate) => routeMatches(pathname, candidate.path));
      if (item) return { section: section.section, label: item.label, icon: item.icon };
    }
    return { section: "SEGEMPAT", label: "Gestão Operacional", icon: Activity };
  }
  const priorityItem = operatorPriorityMenu.find((candidate) => routeMatches(pathname, candidate.path));
  if (priorityItem) return { section: "Principal", label: priorityItem.label, icon: priorityItem.icon };
  for (const section of operatorSections) {
    const item = section.items.find((candidate) => routeMatches(pathname, candidate.path));
    if (item) return { section: section.section, label: item.label, icon: item.icon };
  }
  return { section: "SEGEMPAT", label: "Área Operacional", icon: Activity };
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light" as const, icon: Sun, label: "Claro" },
    { value: "dark" as const, icon: Moon, label: "Escuro" },
    { value: "auto" as const, icon: Monitor, label: "Auto" },
  ];
  return <div className="segempat-theme-toggle grid grid-cols-3 gap-1">{options.map((option) => { const Icon = option.icon; const active = theme === option.value; return <motion.button key={option.value} type="button" data-active={active ? "true" : "false"} onClick={() => setTheme(option.value)} whileTap={{ scale: 0.98 }} className="segempat-theme-option flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors duration-150" aria-label={`Tema ${option.label}`} title={`Tema ${option.label}`}><Icon className="h-3.5 w-3.5" /><span className="text-[10px] font-bold">{option.label}</span></motion.button>; })}</div>;
}

function MenuLink({ item, collapsed = false }: { item: MenuItem; collapsed?: boolean }) {
  const Icon = item.icon;
  return <Link to={item.path} className="block" activeOptions={{ exact: item.path === "/admin" || item.path === "/painel" }} title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined}>{({ isActive }) => <div className={`segempat-sidebar-link relative flex items-center transition-all duration-200 ${collapsed ? "segempat-sidebar-link--collapsed justify-center" : "gap-3 rounded-xl px-3.5 py-2.5"}`} data-active={isActive ? "true" : "false"} data-collapsed={collapsed ? "true" : "false"}><Icon className="segempat-sidebar-link-icon h-[17px] w-[17px] shrink-0" />{!collapsed && <span className="segempat-sidebar-link-label text-[13px] font-semibold">{item.label}</span>}</div>}</Link>;
}

function MobileNavLink({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  const shortLabel = item.path === "/treinamentos" ? "Academia" : item.label;
  return <Link to={item.path} className="min-w-0 flex-1" activeOptions={{ exact: true }}>{({ isActive }) => <div className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors duration-150" style={isActive ? { background: "var(--accent-soft)" } : {}} title={item.label}><Icon className="h-5 w-5" style={{ color: isActive ? "var(--accent)" : "var(--text-4)" }} /><span className="max-w-full truncate px-1 text-[10px] font-medium" style={{ color: isActive ? "var(--accent)" : "var(--text-4)" }}>{shortLabel}</span></div>}</Link>;
}

function AdminNavItems({ pathname, user }: { pathname: string; user: ReturnType<typeof useCurrentUser>["data"] }) {
  const visiblePriorityItems = user ? adminPriorityMenu.filter((item) => canAccessAdminPath(user, item.path)) : [];
  const visibleSections = user
    ? adminSections
        .map((section) => ({ ...section, items: section.items.filter((item) => canAccessAdminPath(user, item.path)) }))
        .filter((section) => section.items.length > 0)
    : [];
  const activeSection = visibleSections.find((section) => section.items.some((item) => routeMatches(pathname, item.path)))?.section;
  const priorityRouteActive = visiblePriorityItems.some((item) => routeMatches(pathname, item.path));
  const defaultSection = priorityRouteActive ? null : activeSection ?? visibleSections[0]?.section ?? null;
  const [openSection, setOpenSection] = useState<string | null>(defaultSection);
  useEffect(() => {
    if (priorityRouteActive) {
      setOpenSection(null);
      return;
    }
    if (activeSection) setOpenSection(activeSection);
  }, [activeSection, priorityRouteActive]);

  return <div className="space-y-3">
    {visiblePriorityItems.length > 0 && <div className="segempat-sidebar-priority space-y-1.5">
      <p className="px-2 text-[9px] font-black uppercase tracking-[.15em]" style={{ color: "var(--text-4)" }}>Principal</p>
      <div className="space-y-1">{visiblePriorityItems.map((item) => <MenuLink key={item.path} item={item} />)}</div>
    </div>}
    <div className="space-y-2">{visibleSections.map((section) => { const SectionIcon = section.icon; const isOpen = openSection === section.section; const isActive = activeSection === section.section; return <div key={section.section} className="segempat-sidebar-section-card overflow-hidden rounded-2xl transition-colors" data-active={isActive ? "true" : "false"} style={{ background: isActive ? "var(--accent-soft)" : "transparent", border: isActive ? "1px solid rgba(200,16,46,.20)" : "1px solid transparent" }}><button type="button" onClick={() => setOpenSection((current) => current === section.section ? null : section.section)} className="segempat-sidebar-section flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors" aria-expanded={isOpen}><div className="segempat-sidebar-section-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: isActive ? "var(--accent-soft2)" : "var(--bg-surface-2)" }}><SectionIcon className="h-3.5 w-3.5" style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }} /></div><div className="min-w-0 flex-1"><p className="segempat-sidebar-section-title truncate text-[10px] font-black uppercase tracking-[.13em]" style={{ color: isActive ? "var(--accent)" : "var(--text-2)" }}>{section.section}</p><p className="segempat-sidebar-section-count mt-0.5 truncate text-[9px]" style={{ color: "var(--text-4)" }}>{section.description}</p></div>{isOpen ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-4)" }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-4)" }} />}</button>{isOpen && <div className="space-y-1 px-1.5 pb-2">{section.items.map((item) => <MenuLink key={item.path} item={item} />)}</div>}</div>; })}</div>
  </div>;
}

function OperatorNavItems({ pathname }: { pathname: string }) {
  const activeSection = operatorSections.find((section) => section.items.some((item) => routeMatches(pathname, item.path)))?.section;
  const priorityRouteActive = operatorPriorityMenu.some((item) => routeMatches(pathname, item.path));
  const defaultSection = priorityRouteActive ? null : activeSection ?? operatorSections[0]?.section ?? null;
  const [openSection, setOpenSection] = useState<string | null>(defaultSection);

  useEffect(() => {
    if (priorityRouteActive) {
      setOpenSection(null);
      return;
    }
    if (activeSection) setOpenSection(activeSection);
  }, [activeSection, priorityRouteActive]);

  return <div className="space-y-3">
    <div className="segempat-sidebar-priority space-y-1.5">
      <p className="px-2 text-[9px] font-black uppercase tracking-[.15em]" style={{ color: "var(--text-4)" }}>Principal</p>
      <div className="space-y-1">{operatorPriorityMenu.map((item) => <MenuLink key={item.path} item={item} />)}</div>
    </div>
    <div className="space-y-2">{operatorSections.map((section) => { const SectionIcon = section.icon; const isOpen = openSection === section.section; const isActive = activeSection === section.section; return <div key={section.section} className="segempat-sidebar-section-card overflow-hidden rounded-2xl transition-colors" data-active={isActive ? "true" : "false"} style={{ background: isActive ? "var(--accent-soft)" : "transparent", border: isActive ? "1px solid rgba(200,16,46,.20)" : "1px solid transparent" }}><button type="button" onClick={() => setOpenSection((current) => current === section.section ? null : section.section)} className="segempat-sidebar-section flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors" aria-expanded={isOpen}><div className="segempat-sidebar-section-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: isActive ? "var(--accent-soft2)" : "var(--bg-surface-2)" }}><SectionIcon className="h-3.5 w-3.5" style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }} /></div><div className="min-w-0 flex-1"><p className="segempat-sidebar-section-title truncate text-[10px] font-black uppercase tracking-[.13em]" style={{ color: isActive ? "var(--accent)" : "var(--text-2)" }}>{section.section}</p><p className="segempat-sidebar-section-count mt-0.5 truncate text-[9px]" style={{ color: "var(--text-4)" }}>{section.description}</p></div>{isOpen ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-4)" }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-4)" }} />}</button>{isOpen && <div className="space-y-1 px-1.5 pb-2">{section.items.map((item) => <MenuLink key={item.path} item={item} />)}</div>}</div>; })}</div>
  </div>;
}

function NavItems({ isAdmin, pathname, user }: { isAdmin: boolean; pathname: string; user: ReturnType<typeof useCurrentUser>["data"] }) {
  if (!isAdmin) return <OperatorNavItems pathname={pathname} />;
  return <AdminNavItems pathname={pathname} user={user} />;
}

function CollapsedNavItems({ isAdmin, user }: { isAdmin: boolean; user: ReturnType<typeof useCurrentUser>["data"] }) {
  const groups = isAdmin
    ? [
        user ? adminPriorityMenu.filter((item) => canAccessAdminPath(user, item.path)) : [],
        ...(user ? adminSections.map((section) => section.items.filter((item) => canAccessAdminPath(user, item.path))) : []),
      ]
    : [operatorPriorityMenu, ...operatorSections.map((section) => section.items)];

  return <div className="segempat-sidebar-rail">{groups.filter((group) => group.length > 0).map((group, index) => <div key={index} className="segempat-sidebar-rail-group">{group.map((item) => <MenuLink key={item.path} item={item} collapsed />)}</div>)}</div>;
}

function HeaderClock() {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => { const interval = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(interval); }, []);
  const time = currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Maceio" });
  const date = currentTime.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Maceio" });
  return <div className="text-right"><p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{time}</p><p className="text-[11px] capitalize" style={{ color: "var(--text-4)" }}>{date}</p></div>;
}

function SidebarIdentity({ user, isAdmin }: { user: ReturnType<typeof useCurrentUser>["data"]; isAdmin: boolean }) {
  const initial = user?.nome?.trim()?.charAt(0)?.toUpperCase() || "S";
  const accessLabel = user?.accessLevelLabel || (isAdmin ? "Inspetor" : "Operador");
  return <div className="segempat-sidebar-identity">
    <Link to="/meu-perfil" aria-label="Abrir Meu Perfil" className="segempat-sidebar-profile group">
      <div className="segempat-sidebar-avatar">{initial}</div>
      <div className="min-w-0 flex-1">
        <p className="segempat-sidebar-profile-name">{user?.nome ?? "SEGEMPAT"}</p>
        <p className="segempat-sidebar-profile-matricula">Mat. {user?.matricula ?? "—"}</p>
      </div>
      <ChevronRight className="segempat-sidebar-profile-chevron h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
    <div className="segempat-sidebar-profile-meta">
      <span className="segempat-sidebar-access-pill"><span className="segempat-sidebar-access-dot" />{accessLabel}</span>
      {user?.setor && <span className="segempat-sidebar-sector" title={user.setor}>{user.setor}</span>}
    </div>
  </div>;
}

function SidebarFooter({ loggingOut, onLogout }: { loggingOut: boolean; onLogout: () => void }) {
  return <div className="segempat-sidebar-footer">
    <div>
      <div className="segempat-sidebar-theme-label"><Palette className="h-3.5 w-3.5" /><span>Tema</span></div>
      <ThemeToggle />
    </div>
    <button disabled={loggingOut} onClick={onLogout} className="segempat-sidebar-logout disabled:opacity-50"><LogOut className="h-[17px] w-[17px]" /><span>{loggingOut ? "Saindo..." : "Sair do sistema"}</span></button>
  </div>;
}

export function AppLayoutV2({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const readiness = useApiReadiness();
  const isAdmin = user?.isAdmin ?? false;
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const location = currentLocation(pathname, isAdmin);
  const LocationIcon = location.icon;
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  const apiUnavailable = readiness === "unavailable";
  const apiChecking = readiness === "checking";
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

  return <div className="segempat-app-shell min-h-screen overflow-x-clip" data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"} style={{ background: "var(--bg-base)" }}>
    <aside aria-label="Navegação principal" className="segempat-app-sidebar fixed bottom-0 left-0 top-0 z-40 hidden flex-col lg:flex" data-collapsed={sidebarCollapsed ? "true" : "false"}>
      <div className="segempat-sidebar-brand" data-collapsed={sidebarCollapsed ? "true" : "false"}>
        {sidebarCollapsed ? <div className="segempat-sidebar-brand-collapsed" title="SEGEMPAT"><ShieldCheck className="h-6 w-6" /></div> : <div className="segempat-sidebar-brand-inner"><div className="segempat-sidebar-logo-shell"><img src={LOGO_URL} alt="EMPAT" className="segempat-sidebar-logo-image" /></div><div className="segempat-sidebar-brand-copy"><p className="segempat-sidebar-wordmark"><span>SEG</span><span>EMPAT</span></p><p className="segempat-sidebar-tagline">Gestão de Segurança Portuária</p></div></div>}
        <button type="button" className="segempat-sidebar-collapse-button" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? "Expandir barra lateral" : "Recolher barra lateral"} title={sidebarCollapsed ? "Expandir barra lateral" : "Recolher barra lateral"}>{sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</button>
      </div>
      {sidebarCollapsed ? <div className="segempat-sidebar-collapsed-identity"><Link to="/meu-perfil" title={user?.nome ?? "Meu Perfil"} aria-label="Abrir Meu Perfil"><div>{user?.nome?.trim()?.charAt(0)?.toUpperCase() || "S"}</div></Link></div> : <SidebarIdentity user={user} isAdmin={isAdmin} />}
      <nav aria-label="Módulos do SEGEMPAT" className="flex-1 overflow-y-auto">{sidebarCollapsed ? <CollapsedNavItems isAdmin={isAdmin} user={user} /> : <NavItems isAdmin={isAdmin} pathname={pathname} user={user} />}</nav>
      {sidebarCollapsed ? <div className="segempat-sidebar-collapsed-footer"><button disabled={loggingOut} onClick={handleLogout} aria-label="Sair do sistema" title="Sair do sistema"><LogOut className="h-[17px] w-[17px]" /></button></div> : <SidebarFooter loggingOut={loggingOut} onLogout={handleLogout} />}
    </aside>

    <div className="segempat-app-stage flex min-h-screen min-w-0 flex-col">
      <header className="segempat-app-header sticky top-0 z-30 px-4 py-3 md:px-6 xl:px-8" style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)", backdropFilter: "blur(12px)" }}>
        <div className="segempat-app-header-frame mx-auto grid w-full max-w-[1680px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(170px,1fr)_minmax(200px,520px)_auto] lg:justify-between xl:grid-cols-[minmax(210px,1fr)_minmax(280px,680px)_auto] xl:gap-6">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild><button className="shrink-0 rounded-lg p-2 lg:hidden" style={{ color: "var(--text-2)", border: "1px solid var(--border)", background: "var(--bg-surface)" }} aria-label="Abrir menu"><Menu className="h-5 w-5" /></button></SheetTrigger>
              <SheetContent side="left" className="segempat-sidebar-sheet w-[86vw] max-w-[340px] border-0 p-0 sm:max-w-[340px]" style={{ background: "var(--header-bg)", color: "var(--text-1)" }}><SheetTitle className="sr-only">Menu</SheetTitle><div className="flex h-full flex-col" style={{ background: "var(--header-bg)" }}><div className="px-4 pb-4 pt-5" style={{ borderBottom: "1px solid var(--border)" }}><div className="flex items-center justify-center"><div className="overflow-hidden rounded-xl bg-white p-1.5" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}><img src={LOGO_URL} alt="EMPAT" className="h-10 w-auto object-contain" /></div></div></div><SidebarIdentity user={user} isAdmin={isAdmin} /><nav aria-label="Módulos do SEGEMPAT" className="flex-1 overflow-y-auto px-3 py-3"><NavItems isAdmin={isAdmin} pathname={pathname} user={user} /></nav><SidebarFooter loggingOut={loggingOut} onLogout={handleLogout} /></div></SheetContent>
            </Sheet>
            <div className="shrink-0 overflow-hidden rounded-lg bg-white p-1 lg:hidden" style={{ border: "1px solid var(--border)" }}><img src={LOGO_URL} alt="EMPAT" className="h-8 w-auto object-contain" /></div>
            <Link to="/meu-perfil" aria-label="Abrir Meu Perfil" className="min-w-0 max-w-[9rem] rounded-lg sm:max-w-none lg:hidden"><p className="truncate text-sm font-bold" style={{ color: "var(--text-1)" }}>{user?.nome ?? "…"}</p><p className="truncate text-[11px] font-mono" style={{ color: "var(--text-4)" }}>Mat. {user?.matricula ?? "—"}</p></Link>
            <div className="hidden min-w-0 items-center gap-3 lg:flex"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", border: "1px solid rgba(200,16,46,.18)" }}><LocationIcon className="h-4 w-4" style={{ color: "var(--accent)" }} /></div><div className="min-w-0"><p className="truncate text-[10px] font-black uppercase tracking-[.13em]" style={{ color: "var(--text-4)" }}>{location.section}</p><p className="truncate text-sm font-black" style={{ color: "var(--text-1)" }}>{location.label}</p></div></div>
          </div>

          <div className="min-w-0 lg:flex lg:justify-center"><GlobalSearch /></div>

          <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3 md:gap-4">
            <div className="hidden items-center gap-2 sm:flex" title={`API corporativa: ${apiStatusLabel}`}><div className="relative flex h-2 w-2">{!apiUnavailable && !apiChecking && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: apiStatusColor }} />}<span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: apiStatusColor }} /></div><span className="hidden text-xs font-medium 2xl:inline" style={{ color: "var(--text-3)" }}>{apiStatusLabel}</span></div>
            <div className="hidden sm:block"><HeaderClock /></div>
            <button disabled={loggingOut} onClick={handleLogout} className="rounded-lg p-2 transition-colors disabled:opacity-50 lg:hidden" style={{ color: "var(--text-3)" }} aria-label="Sair"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main className="segempat-app-main min-w-0 flex-1 p-4 pb-24 md:p-6 md:pb-24 lg:p-7 lg:pb-8 xl:p-8 2xl:px-10"><div className="segempat-app-content mx-auto w-full max-w-[1680px]">{children}</div></main>

      {!isAdmin && <nav aria-label="Navegação rápida" className="fixed bottom-0 left-0 right-0 z-40 px-2 py-1.5 lg:hidden" style={{ background: "var(--header-bg)", borderTop: "1px solid var(--border)", backdropFilter: "blur(12px)", paddingBottom: "max(.375rem, env(safe-area-inset-bottom))" }}><div className="mx-auto flex w-full max-w-xl items-center justify-around gap-1">{operatorQuickMenu.map((item) => <MobileNavLink key={item.path} item={item} />)}</div></nav>}
    </div>
  </div>;
}