import { Moon, PlayCircle, SlidersHorizontal, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { enableDemoMode, isDemoModeAllowed, isDemoModeEnabled } from "@/lib/demo-mode";

const options = [
  { value: "light" as const, icon: Sun },
  { value: "dark" as const, icon: Moon },
  { value: "auto" as const, icon: SlidersHorizontal },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const showDemo = isDemoModeAllowed() && !isDemoModeEnabled();

  const enterDemo = () => {
    enableDemoMode();
    window.location.assign("/admin");
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div
        className="flex items-center gap-0.5 rounded-xl p-1"
        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
      >
        {options.map(({ value, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={value}
            aria-label={`Tema ${value}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
            style={{
              background: theme === value ? "var(--accent)" : "transparent",
              color: theme === value ? "#fff" : "var(--text-4)",
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {showDemo && (
        <button
          type="button"
          onClick={enterDemo}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide shadow-sm transition-all active:scale-95"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
          }}
          title="Abrir o SEGEMPAT com dados fictícios de demonstração"
        >
          <PlayCircle className="h-3.5 w-3.5" />
          Entrar em demonstração
        </button>
      )}
    </div>
  );
}
