import { useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { Logo } from "../components/Logo";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth, AccessDeniedError } from "../auth/AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError(undefined);
    setPasswordError(undefined);

    if (!EMAIL_RE.test(email)) {
      setEmailError(
        "Пожалуйста, введите действительный адрес электронной почты.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        setPasswordError(
          "Доступ только для администрации. Обратитесь к администратору.",
        );
      } else if (err instanceof FirebaseError) {
        if (
          err.code === "auth/invalid-credential" ||
          err.code === "auth/wrong-password" ||
          err.code === "auth/user-not-found"
        ) {
          setPasswordError(
            "Ваш пароль неверен. Пожалуйста, попробуйте еще раз.",
          );
        } else if (err.code === "auth/invalid-email") {
          setEmailError(
            "Пожалуйста, введите действительный адрес электронной почты.",
          );
        } else if (err.code === "auth/too-many-requests") {
          setPasswordError(
            "Слишком много попыток. Попробуйте позже.",
          );
        } else {
          setPasswordError("Не удалось войти. Попробуйте позже.");
        }
      } else {
        setPasswordError("Не удалось войти. Попробуйте позже.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background gap-8 p-4">
      <Logo />
      <form
        onSubmit={handleSubmit}
        className="flex w-[332px] flex-col rounded-[12px] overflow-hidden bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]"
      >
        <div className="flex h-[44px] items-center bg-grey-lighter px-4">
          <h1 className="text-[16px] font-semibold text-grey-dark">Вход</h1>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <Input
            label="Адрес электронной почты"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onClear={() => setEmail("")}
            error={emailError}
          />
          <Input
            label="Пароль"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onClear={() => setPassword("")}
            error={passwordError}
          />
        </div>
        <div className="p-4">
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Вход…" : "Войти"}
          </Button>
        </div>
      </form>
    </div>
  );
}
