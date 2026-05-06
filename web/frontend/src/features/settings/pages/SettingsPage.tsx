import { TelegramBotSection } from "../components/TelegramBotSection";
import { TelegramGroupsSection } from "../components/TelegramGroupsSection";

// Admin-only settings. Renders one section per concern; for now only Telegram
// is here, support_whatsapp / support_hours stay in chat help dialog config
// until they get their own UI. Page is gated by RequireAdmin in App.tsx.
export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 pt-4 max-w-[1100px]">
      <TelegramBotSection />
      <TelegramGroupsSection />
    </div>
  );
}
