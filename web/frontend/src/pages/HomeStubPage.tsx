import { Logo } from "../components/Logo";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  admin: "Администратор",
};

export function HomeStubPage() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background gap-8 p-4">
      <Logo />
      <div className="flex w-[332px] flex-col rounded-[12px] overflow-hidden bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
        <div className="flex h-[54px] items-center bg-grey-lighter px-4">
          <h1 className="text-[18px] font-semibold text-grey-dark">
            Добро пожаловать
          </h1>
        </div>
        <div className="flex flex-col gap-2 p-4 text-[14px] text-grey-dark">
          <div>
            <span className="text-grey-medium">Email:</span>{" "}
            <span className="font-medium">{user.email}</span>
          </div>
          <div>
            <span className="text-grey-medium">Роль:</span>{" "}
            <span className="font-medium text-purple-dark">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </div>
        <div className="p-4">
          <Button type="button" onClick={() => signOut()}>
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}
