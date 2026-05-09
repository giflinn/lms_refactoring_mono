import { useState } from "react";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
import { TelegramBotSection } from "../components/TelegramBotSection";
import { TelegramGroupsSection } from "../components/TelegramGroupsSection";
import { ChatsSection } from "../components/ChatsSection";
import { LmsCoursesSection } from "../../lms/components/LmsCoursesSection";
import { LegalDocumentsSection } from "../../legal/components/LegalDocumentsSection";

type TabId = "telegram" | "lms" | "chats" | "legal";

const TABS: { id: TabId; label: string }[] = [
  { id: "telegram", label: "Telegram" },
  { id: "lms", label: "LMS" },
  { id: "chats", label: "Чаты" },
  { id: "legal", label: "Документы" },
];

export function SettingsPage() {
  const [active, setActive] = useState<TabId>("telegram");

  return (
    <div className="flex flex-col gap-6 pt-2">
      <SegmentedTabs<TabId>
        tabs={TABS}
        value={active}
        onChange={setActive}
        className="self-start"
      />
      {active === "telegram" && (
        <div className="flex flex-col gap-6">
          <TelegramBotSection />
          <TelegramGroupsSection />
        </div>
      )}
      {active === "lms" && (
        <div className="flex flex-col gap-6">
          <LmsCoursesSection />
        </div>
      )}
      {active === "chats" && (
        <div className="flex flex-col gap-6">
          <ChatsSection />
        </div>
      )}
      {active === "legal" && (
        <div className="flex flex-col gap-6">
          <LegalDocumentsSection />
        </div>
      )}
    </div>
  );
}
