import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, User, Eye, EyeOff, ChevronRight, KeyRound, Loader2 } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { activateWithCode, loginWithMatricula, resetPasswordWithCode } from "@/lib/backend/auth-gateway";
import { getCurrentSessionUser } from "@/lib/backend/current-user-gateway";
import { useApiReadiness } from "@/lib/useApiReadiness";
import { isDemoModeAllowed } from "@/lib/demo-mode";
import { loginPasswordSchema, matriculaSchema, passwordSchema } from "@/lib/matricula";
import type { SessionUser } from "@/lib/backend/contracts";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1117d573bbf85981b1abee/8271ac857_IMG_9226.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SEGEMPAT — Gestão, Operações e Desempenho" },
      {
        name: "description",
        content:
          "Acesse o SEGEMPAT com sua matrícula: gestão de operações, treinamentos e desempenho das equipes do Porto de Maceió.",
      },
      { property: "og:title", content: "SEGEMPAT — Gestão, Operações e Desempenho" },
      {
        property: "og:description",
        content:
          "Plataforma de gestão de operações, treinamentos e desempenho das equipes do Porto de Maceió.",
      },
    ],
  }),
  component: AuthScreen,
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "48px",
  borderRadius: "0.75rem",
  border: "1.5px solid var(--border)",
  background: "var(--bg-surface-2)",
  color: "var(--text-1)",
  fontSize: "0.9375rem",
  padding: "0 1rem",
  outline: "none",
  transition: "border-color 0.15s",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #C8102E, #e0142f)",
  color: "#fff",
  boxShadow: "0 2px 12px rgba(200,16,46,0.45)",
};

const labelClass = "text-xs font-semibold uppercase tracking-wider";

type Step = "matricula" | "password" | "signup" | "reset";
type Navigate = ReturnType<typeof useNavigate>;

function navigateHome(navigate: Navigate, user: SessionUser) {
  navigate({ to: user.isAdmin ? "/admin" : "/painel", replace: true });
}

function AuthScreen() {
  const navigate = useNavigate();
  const apiReadiness = useApiReadiness();
  const demoAvailable = isDemoModeAllowed();
  const [matricula, setMatricula] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<Step>("matricula");
  const [loading, setLoading] = useState(false);

  const demoStatus = demoAvailable && apiReadiness === "unavailable";
  const apiUnavailable = apiReadiness === "unavailable" && !demoStatus;
  const apiChecking = apiReadiness === "checking";
  const apiStatusLabel =
    demoStatus || apiReadiness === "demo"
      ? "Modo demonstração"
      : apiUnavailable
        ? "Sistema indisponível"
        : apiChecking
          ? "Verificando sistema"
          : "Sistema online";
  const apiStatusColor =
    demoStatus || apiReadiness === "demo"
      ? "#22c55e"
      : apiUnavailable
        ? "#ef4444"
        : apiChecking
          ? "#f59e0b"
          : "#22c55e";
  const apiStatusTitle =
    demoStatus || apiReadiness === "demo"
      ? "Ambiente de demonstração com dados fictícios; a API corporativa permanece isolada."
      : apiUnavailable
        ? "A API corporativa não passou no readiness"
        : undefined;

  useEffect(() => {
    let active = true;
    getCurrentSessionUser()
      .then((user) => {
        if (active && user) navigateHome(navigate, user);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [navigate]);

  const focusAccent = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--accent)";
  };
  const blurBorder = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
  };

  const clearCredentialFields = () => {
    setPassword("");
    setConfirmPassword("");
    setActivationCode("");
    setResetCode("");
  };

  const handleCheckMatricula = () => {
    const parsed = matriculaSchema.safeParse(matricula);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Matrícula inválida");
      return;
    }
    setStep("password");
  };

  const handleLogin = async () => {
    const pwd = loginPasswordSchema.safeParse(password);
    if (!pwd.success) {
      toast.error(pwd.error.issues[0]?.message ?? "Senha inválida");
      return;
    }
    setLoading(true);
    try {
      const user = await loginWithMatricula(matricula, password);
      toast.success("Bem-vindo ao SEGEMPAT");
      navigateHome(navigate, user);
    } catch {
      toast.error("Matrícula ou senha incorretos");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!/^\d{8}$/.test(activationCode)) {
      toast.error("Informe o código de ativação de 8 dígitos");
      return;
    }
    const pwd = passwordSchema.safeParse(password);
    if (!pwd.success) {
      toast.error(pwd.error.issues[0]?.message ?? "Senha inválida");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    setLoading(true);
    try {
      const user = await activateWithCode({ matricula, activationCode, password });
      toast.success("Acesso criado com sucesso");
      setActivationCode("");
      navigateHome(navigate, user);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      toast.error(
        message.includes("já possui") || message.includes("already")
          ? "Já existe uma senha cadastrada para esta matrícula"
          : "Não foi possível criar o acesso. Verifique matrícula e código de ativação.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!/^\d{8}$/.test(resetCode)) {
      toast.error("Informe o código de recuperação de 8 dígitos");
      return;
    }
    const pwd = passwordSchema.safeParse(password);
    if (!pwd.success) {
      toast.error(pwd.error.issues[0]?.message ?? "Senha inválida");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    setLoading(true);
    try {
      await resetPasswordWithCode({ matricula, resetCode, newPassword: password });
      toast.success("Senha redefinida. Entre com sua nova senha.");
      clearCredentialFields();
      setStep("password");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível redefinir a senha");
    } finally {
      setLoading(false);
    }
  };

  const submitCurrentStep = () => {
    if (step === "signup") return handleSignup();
    if (step === "reset") return handleResetPassword();
    return handleLogin();
  };

  const creatingCredential = step === "signup" || step === "reset";

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="fixed right-4 top-4 z-50">
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div
              className="flex items-center justify-center overflow-hidden rounded-2xl"
              style={{ background: "#ffffff", padding: "14px 20px", boxShadow: "var(--shadow-md)" }}
            >
              <img
                src={LOGO_URL}
                alt="Logotipo EMPAT — Empresa Maceioense de Praticagem e Terminais"
                className="h-28 w-auto object-contain"
              />
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--text-1)" }}>
            SEGEMPAT
          </h1>
          <p
            className="mt-1 text-sm font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-3)" }}
          >
            Gestão • Operações • Desempenho
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5" title={apiStatusTitle}>
            <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: apiStatusColor }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text-4)" }}>
              {apiStatusLabel}
            </span>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: "var(--bg-surface)",
            border: "1.5px solid var(--border)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="h-1 w-full" style={{ background: "var(--accent)" }} />

          <div className="p-6">
            {step === "matricula" ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "var(--text-1)" }}>
                    Bem-vindo
                  </h2>
                  <p className="mt-0.5 text-sm" style={{ color: "var(--text-3)" }}>
                    Informe sua matrícula para continuar
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} style={{ color: "var(--text-3)" }}>
                    Matrícula
                  </label>
                  <div className="relative">
                    <User
                      className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                      style={{ color: "var(--text-4)" }}
                    />
                    <input
                      value={matricula}
                      onChange={(e) => setMatricula(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCheckMatricula()}
                      placeholder="Ex: 001"
                      autoComplete="username"
                      style={{ ...inputStyle, paddingLeft: "2.5rem" }}
                      onFocus={focusAccent}
                      onBlur={blurBorder}
                    />
                  </div>
                </div>
                <button
                  onClick={handleCheckMatricula}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-95"
                  style={primaryButtonStyle}
                >
                  <span>Continuar</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {matricula.trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                      Matrícula {matricula.trim()}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-4)" }}>
                      Porto de Maceió · Operações
                    </p>
                  </div>
                </div>

                {step === "signup" && (
                  <div className="space-y-1.5">
                    <label className={labelClass} style={{ color: "var(--text-3)" }}>
                      Código de ativação
                    </label>
                    <div className="relative">
                      <KeyRound
                        className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                        style={{ color: "var(--text-4)" }}
                      />
                      <input
                        value={activationCode}
                        onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        inputMode="numeric"
                        maxLength={8}
                        autoComplete="one-time-code"
                        placeholder="8 dígitos"
                        style={{ ...inputStyle, paddingLeft: "2.5rem", letterSpacing: ".18em", fontWeight: 700 }}
                        onFocus={focusAccent}
                        onBlur={blurBorder}
                      />
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-4)" }}>
                      Solicite seu código de primeiro acesso à Inspetoria.
                    </p>
                  </div>
                )}

                {step === "reset" && (
                  <div className="space-y-1.5">
                    <label className={labelClass} style={{ color: "var(--text-3)" }}>
                      Código de recuperação
                    </label>
                    <div className="relative">
                      <KeyRound
                        className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                        style={{ color: "var(--text-4)" }}
                      />
                      <input
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        inputMode="numeric"
                        maxLength={8}
                        autoComplete="one-time-code"
                        placeholder="8 dígitos"
                        style={{ ...inputStyle, paddingLeft: "2.5rem", letterSpacing: ".18em", fontWeight: 700 }}
                        onFocus={focusAccent}
                        onBlur={blurBorder}
                      />
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-4)" }}>
                      Solicite à Inspetoria um código temporário de recuperação.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className={labelClass} style={{ color: "var(--text-3)" }}>
                    {creatingCredential ? (step === "reset" ? "Nova senha" : "Criar senha") : "Senha"}
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                      style={{ color: "var(--text-4)" }}
                    />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitCurrentStep()}
                      placeholder={creatingCredential ? "Mínimo 8 caracteres" : "Sua senha"}
                      autoComplete={creatingCredential ? "new-password" : "current-password"}
                      style={{ ...inputStyle, paddingLeft: "2.5rem", paddingRight: "3rem" }}
                      onFocus={focusAccent}
                      onBlur={blurBorder}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--text-4)" }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {creatingCredential && (
                  <div className="space-y-1.5">
                    <label className={labelClass} style={{ color: "var(--text-3)" }}>
                      Confirmar senha
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                        style={{ color: "var(--text-4)" }}
                      />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitCurrentStep()}
                        placeholder="Repita a senha"
                        autoComplete="new-password"
                        style={{ ...inputStyle, paddingLeft: "2.5rem" }}
                        onFocus={focusAccent}
                        onBlur={blurBorder}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={submitCurrentStep}
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-70"
                  style={primaryButtonStyle}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>{step === "signup" ? "Criar acesso" : step === "reset" ? "Redefinir senha" : "Entrar"}</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                {step === "password" && !demoAvailable && (
                  <button
                    onClick={() => {
                      clearCredentialFields();
                      setStep("reset");
                    }}
                    className="w-full text-center text-sm font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    Esqueci minha senha
                  </button>
                )}

                {!demoAvailable && (
                  <button
                    onClick={() => {
                      if (step === "reset") {
                        setStep("password");
                      } else {
                        setStep(step === "signup" ? "password" : "signup");
                      }
                      clearCredentialFields();
                    }}
                    className="w-full text-center text-sm font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {step === "signup" ? "Já tenho senha" : step === "reset" ? "Voltar para entrar" : "Primeiro acesso? Criar senha"}
                  </button>
                )}

                <button
                  onClick={() => {
                    setStep("matricula");
                    clearCredentialFields();
                  }}
                  className="w-full text-center text-sm transition-colors"
                  style={{ color: "var(--text-4)" }}
                >
                  ← Usar outra matrícula
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: "var(--text-4)" }}>
            Porto de Maceió · {new Date().getFullYear()}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>
            Desenvolvido por{" "}
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>YGOR SOUZA</span>
          </p>
        </div>
      </div>
    </div>
  );
}
