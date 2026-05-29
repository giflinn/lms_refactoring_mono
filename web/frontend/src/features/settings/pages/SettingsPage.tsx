import { useState } from "react";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
import { TelegramBotSection } from "../components/TelegramBotSection";
import { TelegramGroupsSection } from "../components/TelegramGroupsSection";
import { ChatsSection } from "../components/ChatsSection";
import { ManagerAssignmentSection } from "../components/ManagerAssignmentSection";
import { KaspiSection } from "../components/KaspiSection";
import { BccSection } from "../components/BccSection";
import { LmsCoursesSection } from "../../lms/components/LmsCoursesSection";
import { LegalDocumentsSection } from "../../legal/components/LegalDocumentsSection";

type TabId =
  | "telegram"
  | "lms"
  | "chats"
  | "assignment"
  | "kaspi"
  | "bcc"
  | "legal";

const TABS: { id: TabId; label: string }[] = [
  { id: "telegram", label: "Telegram" },
  { id: "lms", label: "LMS" },
  { id: "chats", label: "Чаты" },
  { id: "assignment", label: "Назначение" },
  { id: "kaspi", label: "Kaspi" },
  { id: "bcc", label: "BCC" },
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
      {active === "assignment" && (
        <div className="flex flex-col gap-6">
          <ManagerAssignmentSection />
        </div>
      )}
      {active === "kaspi" && (
        <div className="flex flex-col gap-6">
          <KaspiSection />
        </div>
      )}
      {active === "bcc" && (
        <div className="flex flex-col gap-6">
          <BccSection />
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
