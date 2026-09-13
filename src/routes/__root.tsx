import "@/lib/browser-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import contrastCss from "../theme-contrast-fixes.css?url";
import operationalDesktopCss from "../operational-desktop.css?url";
import analyticalDesktopCss from "../analytical-desktop.css?url";
import governanceDesktopCss from "../governance-desktop.css?url";
import trainingManagementDesktopCss from "../training-management-desktop.css?url";
import operatorDesktopCss from "../operator-desktop.css?url";
import inspectorDesktopCss from "../inspector-desktop.css?url";
import finalExperienceCss from "../final-experience.css?url";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

const THEME_BOOTSTRAP = `(function(){try{var mode=localStorage.getItem('empat_theme')||'light';var resolved=mode==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;if(resolved!=='dark'&&resolved!=='light')resolved='light';var root=document.documentElement;root.setAttribute('data-theme',resolved);root.classList.toggle('dark',resolved==='dark');root.style.colorScheme=resolved;}catch(e){}})();`;
const CHUNK_RECOVERY_KEY = "segempat_chunk_recovery_at";

function isStaleDeploymentChunk(error: Error) {
  const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return [
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "failed to load module script",
    "chunkloaderror",
    "loading chunk",
  ].some((token) => text.includes(token));
}

function RecoveryShell({
  code,
  title,
  description,
  children,
}: {
  code?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10" style={{ background: "var(--bg-base)" }}>
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="h-1 w-full" style={{ background: "var(--accent)" }} />
        <div className="p-7 text-center md:p-8">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {code ?? "!"}
          </div>
          <p className="mt-4 text-[10px] font-black uppercase tracking-[.2em]" style={{ color: "var(--text-4)" }}>
            SEGEMPAT · Sistema operacional
          </p>
          <h1 className="mt-2 text-xl font-black" style={{ color: "var(--text-1)" }}>
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-3)" }}>
            {description}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">{children}</div>
          <p className="mt-5 text-[11px]" style={{ color: "var(--text-4)" }}>
            Se o problema continuar após uma nova tentativa, informe a Inspetoria.
          </p>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <RecoveryShell
      code="404"
      title="Página não encontrada"
      description="O endereço acessado não existe, foi movido ou não está mais disponível nesta versão do sistema."
    >
      <Link
        to="/"
        className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-white"
        style={{ background: "var(--accent)" }}
      >
        Voltar ao SEGEMPAT
      </Link>
    </RecoveryShell>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const staleDeploymentChunk = isStaleDeploymentChunk(error);

  useEffect(() => {
    if (!staleDeploymentChunk || typeof window === "undefined") return;
    try {
      const now = Date.now();
      const lastRecovery = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0);
      if (!Number.isFinite(lastRecovery) || now - lastRecovery > 30_000) {
        window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [staleDeploymentChunk]);

  return (
    <RecoveryShell
      title={staleDeploymentChunk ? "Atualizando o SEGEMPAT" : "Não foi possível carregar esta página"}
      description={staleDeploymentChunk
        ? "Uma nova versão do sistema foi detectada. O SEGEMPAT está recarregando os arquivos atualizados automaticamente."
        : "O SEGEMPAT encontrou uma falha inesperada ao abrir esta área. Seus dados não foram apagados. Tente recarregar o módulo."}
    >
      <button
        onClick={() => {
          if (staleDeploymentChunk) {
            window.location.reload();
            return;
          }
          router.invalidate();
          reset();
        }}
        className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-white"
        style={{ background: "var(--accent)" }}
      >
        {staleDeploymentChunk ? "Recarregar agora" : "Tentar novamente"}
      </button>
      <a
        href="/"
        className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold"
        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
      >
        Ir para o início
      </a>
    </RecoveryShell>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
      { name: "googlebot", content: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
      { title: "SEGEMPAT — Gestão, Operações e Desempenho" },
      {
        name: "description",
        content:
          "Plataforma de gestão de operações, treinamentos e desempenho das equipes do Porto de Maceió.",
      },
      { name: "author", content: "Ygor Souza" },
      { property: "og:title", content: "SEGEMPAT — Gestão, Operações e Desempenho" },
      {
        property: "og:description",
        content:
          "Plataforma de gestão de operações, treinamentos e desempenho das equipes do Porto de Maceió.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: contrastCss },
      { rel: "stylesheet", href: operationalDesktopCss },
      { rel: "stylesheet", href: analyticalDesktopCss },
      { rel: "stylesheet", href: governanceDesktopCss },
      { rel: "stylesheet", href: trainingManagementDesktopCss },
      { rel: "stylesheet", href: operatorDesktopCss },
      { rel: "stylesheet", href: inspectorDesktopCss },
      { rel: "stylesheet", href: finalExperienceCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Sora:wght@400;600;700;800&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
