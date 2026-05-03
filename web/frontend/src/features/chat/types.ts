// Wire format mirrors the backend serializers (see web/backend/src/services/
// chatRepo.ts). Keep these in sync when the API changes — they're not
// auto-generated.

export type ChatRole = "client" | "manager" | "senior_manager" | "admin";

export type ChatUserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: ChatRole;
  online?: boolean;
  lastSeenAt?: string | null;
};

export type ChatThread = {
  id: string;
  client: ChatUserSummary;
  manager: ChatUserSummary | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: string;
};

export type ChatAttachment = {
  url: string;
  mime: string;
  name: string;
  size: number;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  sender: ChatUserSummary | null;
  body: string | null;
  attachments: ChatAttachment[];
  kind: "text" | "system";
  createdAt: string;
};

export type ChatThreadAccess = {
  canRead: boolean;
  canWrite: boolean;
  hasJoined: boolean;
  isClient: boolean;
  isAssignedManager: boolean;
  isSeniorOrAdmin: boolean;
};
