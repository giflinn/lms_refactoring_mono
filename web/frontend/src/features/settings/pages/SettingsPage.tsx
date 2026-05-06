import { useState } from "react";
import clsx from "clsx";
import { TelegramBotSection } from "../components/TelegramBotSection";
import { TelegramGroupsSection } from "../components/TelegramGroupsSection";

// Admin-only settings. Tab bar groups by category so adding new sections
// later (support contacts, payments, etc.) doesn't pile sections on a single
// scroll. Page is gated by RequireAdmin in App.tsx.
type Tab = {
  id: string;
  label: string;
};

const TABS: Tab[] = [
  { id: "telegram", label: "Telegram" },
];

export function SettingsPage() {
  const [active, setActive] = useState<string>(TABS[0].id);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex border-b border-[#EAECF0]">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={active === t.id}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </TabButton>
        ))}
      </div>
      {active === "telegram" && (
        <div className="flex flex-col gap-6">
          <TelegramBotSection />
          <TelegramGroupsSection />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-4 py-3 text-[14px] font-medium border-b-2 -mb-px transition-colors cursor-pointer",
        active
          ? "border-purple-primary text-purple-primary"
          : "border-transparent text-grey-medium hover:text-grey-dark",
      )}
    >
      {children}
    </button>
  );
}
