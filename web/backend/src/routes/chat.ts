import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { chatReads, chatThreads, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole } from "../middleware/requireRole";
import {
  chatAttachmentUpload,
  persistAttachment,
  type StoredAttachment,
} from "../services/chatAttachments";
import {
  fetchMessages,
  getOrCreateClientThread,
  listThreads,
  loadThreadDetail,
  totalUnreadCount,
  unreadThreadsCount,
} from "../services/chatRepo";
import { loadThreadAccess } from "../services/chatAuthorization";
import {
  createAndDeliverMessage,
  resolvePushRecipients,
} from "../services/messageDelivery";
import { chatBus } from "../services/chatBus";

export const chatRouter = Router();

const MAX_BODY_LEN = 4000;

// POST /chat/threads/me — client-only: get-or-create the caller's thread.
// Mobile clients call this on entering the Chat tab; the response carries
// the thread id, the assigned manager (for the header), and the unread count.
chatRouter.post(
  "/chat/threads/me",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      if (actorRole !== "client") {
        res.status(403).json({ error: "client_only" });
        return;
      }
      const thread = await getOrCreateClientThread(actorId);
      const detail = await loadThreadDetail(thread.id, actorId);
      res.json({ thread: detail });
    } catch (err) {
      next(err);
    }
  },
);

// POST /chat/threads/by-client/:clientId — staff-only: get-or-create the
// thread for a specific client. Used by the staff "Клиенты" → client profile
// chat icon, which routes the user into /staff/chat/:threadId. Manager-role
// actors may only open threads for clients they own; senior_manager / admin
// can open any.
chatRouter.post(
  "/chat/threads/by-client/:clientId",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      if (actorRole === "client") {
        res.status(403).json({ error: "staff_only" });
        return;
      }
      const clientId = req.params.clientId;
      const rows = await db
        .select({
          id: users.id,
          role: users.role,
          managerId: users.managerId,
          deactivatedAt: users.deactivatedAt,
        })
        .from(users)
        .where(eq(users.id, clientId))
        .limit(1);
      if (
        rows.length === 0 ||
        rows[0].role !== "client" ||
        rows[0].deactivatedAt !== null
      ) {
        res.status(404).json({ error: "client_not_found" });
        return;
      }
      if (actorRole === "manager" && rows[0].managerId !== actorId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const thread = await getOrCreateClientThread(clientId);
      res.json({ threadId: thread.id });
    } catch (err) {
      next(err);
    }
  },
);

// GET /chat/threads — staff-only list with search/filter/sort.
chatRouter.get(
  "/chat/threads",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      if (actorRole === "client") {
        res.status(403).json({ error: "staff_only" });
        return;
      }
      const isStaffAdmin =
        actorRole === "senior_manager" || actorRole === "admin";
      const search =
        typeof req.query.search === "string" ? req.query.search : null;
      const filterRaw = String(req.query.filter ?? "all").toLowerCase();
      const filter: "all" | "unread" | "unanswered" =
        filterRaw === "unread" || filterRaw === "unanswered"
          ? filterRaw
          : "all";
      const managerIdFilter =
        isStaffAdmin && typeof req.query.managerId === "string"
          ? req.query.managerId
          : null;
      const sortRaw = String(req.query.sort ?? "newest").toLowerCase();
      const sort: "newest" | "oldest" | "name" =
        sortRaw === "oldest" || sortRaw === "name" ? sortRaw : "newest";

      const threads = await listThreads({
        managerScopeId: actorRole === "manager" ? actorId : null,
        search,
        filter,
        managerIdFilter,
        sort,
        forUserId: actorId,
      });
      res.json({ threads });
    } catch (err) {
      next(err);
    }
  },
);

// GET /chat/threads/:id — header info + role flags.
chatRouter.get(
  "/chat/threads/:id",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      const access = await loadThreadAccess(
        actorId,
        actorRole,
        req.params.id,
      );
      if (!access) {
        res.status(404).json({ error: "thread_not_found" });
        return;
      }
      if (!access.canRead) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const detail = await loadThreadDetail(access.threadId, actorId);
      if (!detail) {
        res.status(404).json({ error: "thread_not_found" });
        return;
      }
      res.json({
        thread: detail,
        access: {
          canRead: access.canRead,
          canWrite: access.canWrite,
          hasJoined: access.hasJoined,
          isClient: access.isClient,
          isAssignedManager: access.isAssignedManager,
          isSeniorOrAdmin: access.isSeniorOrAdmin,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /chat/threads/:id/messages?before=ISO&limit=50
chatRouter.get(
  "/chat/threads/:id/messages",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      const access = await loadThreadAccess(
        actorId,
        actorRole,
        req.params.id,
      );
      if (!access) {
        res.status(404).json({ error: "thread_not_found" });
        return;
      }
      if (!access.canRead) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const limit = Math.min(
        100,
        Math.max(1, Number(req.query.limit ?? "50") || 50),
      );
      const beforeRaw =
        typeof req.query.before === "string" ? req.query.before : null;
      let before: Date | null = null;
      if (beforeRaw) {
        const d = new Date(beforeRaw);
        if (!isNaN(d.getTime())) before = d;
      }
      const messages = await fetchMessages(access.threadId, before, limit);
      res.json({ messages });
    } catch (err) {
      next(err);
    }
  },
);

// POST /chat/threads/:id/messages — multipart: text in `body`, files in `files`.
chatRouter.post(
  "/chat/threads/:id/messages",
  requireAuth,
  requireAnyRole,
  chatAttachmentUpload.array("files", 5),
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      const access = await loadThreadAccess(
        actorId,
        actorRole,
        req.params.id,
      );
      if (!access) {
        res.status(404).json({ error: "thread_not_found" });
        return;
      }
      if (!access.canWrite) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const rawBody = (req.body?.body as string | undefined) ?? "";
      const body = rawBody.trim() || null;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!body && files.length === 0) {
        res.status(400).json({ error: "empty_message" });
        return;
      }
      if (body && body.length > MAX_BODY_LEN) {
        res.status(400).json({ error: "body_too_long" });
        return;
      }
      const attachments: StoredAttachment[] = [];
      for (const file of files) {
        attachments.push(await persistAttachment(access.threadId, file));
      }

      const recipients = await resolvePushRecipients(access.threadId);
      const recipientUserIds: string[] = [];
      if (recipients.clientId) recipientUserIds.push(recipients.clientId);
      if (recipients.managerId) recipientUserIds.push(recipients.managerId);

      const delivered = await createAndDeliverMessage({
        threadId: access.threadId,
        senderId: actorId,
        body,
        attachments,
        recipientUserIds,
      });
      res.status(201).json({ message: delivered.message });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "image_too_large" || err.message === "pdf_too_large") {
          res.status(400).json({ error: err.message });
          return;
        }
      }
      next(err);
    }
  },
);

// POST /chat/threads/:id/read — mark this user as caught up to "now".
chatRouter.post(
  "/chat/threads/:id/read",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      const access = await loadThreadAccess(
        actorId,
        actorRole,
        req.params.id,
      );
      if (!access) {
        res.status(404).json({ error: "thread_not_found" });
        return;
      }
      if (!access.canRead) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const now = new Date();
      await db
        .insert(chatReads)
        .values({
          threadId: access.threadId,
          userId: actorId,
          lastReadAt: now,
        })
        .onConflictDoUpdate({
          target: [chatReads.threadId, chatReads.userId],
          set: { lastReadAt: now },
        });
      chatBus.emit("message:read", {
        threadId: access.threadId,
        userId: actorId,
        lastReadAt: now,
      });
      res.json({ ok: true, lastReadAt: now.toISOString() });
    } catch (err) {
      next(err);
    }
  },
);

// POST /chat/threads/:id/join — senior_manager / admin start participating.
// Idempotent: if a join system message already exists for this actor in the
// thread, the response just reports the current state without inserting a
// duplicate.
chatRouter.post(
  "/chat/threads/:id/join",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      const access = await loadThreadAccess(
        actorId,
        actorRole,
        req.params.id,
      );
      if (!access) {
        res.status(404).json({ error: "thread_not_found" });
        return;
      }
      if (!access.isSeniorOrAdmin) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      if (access.hasJoined) {
        res.json({ joined: true });
        return;
      }
      const me = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);
      const u = me[0];
      const fullName = `${u.firstName} ${u.lastName}`.trim() || "Сотрудник";
      const roleLabel =
        u.role === "admin" ? "Администратор" : "Старший менеджер";
      const body = `${roleLabel} ${fullName} присоединился к чату`;

      const recipients = await resolvePushRecipients(access.threadId);
      const recipientUserIds: string[] = [];
      if (recipients.clientId) recipientUserIds.push(recipients.clientId);
      if (recipients.managerId) recipientUserIds.push(recipients.managerId);

      await createAndDeliverMessage({
        threadId: access.threadId,
        senderId: actorId,
        body,
        attachments: [],
        kind: "system",
        recipientUserIds,
      });
      res.json({ joined: true });
    } catch (err) {
      next(err);
    }
  },
);

// GET /chat/unread-count — single number for the badge on the chat tab/icon.
chatRouter.get(
  "/chat/unread-count",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      const count = await totalUnreadCount(actorId, {
        managerOf: actorRole === "manager" ? actorId : null,
        isStaffAdmin:
          actorRole === "senior_manager" || actorRole === "admin",
      });
      res.json({ count });
    } catch (err) {
      next(err);
    }
  },
);

// GET /chat/unread-threads-count — distinct number of threads with unread
// messages for the actor. Same scoping as /chat/unread-count, but the web
// admin sidebar prefers reading "N chats need attention" rather than total
// message count. Mobile still uses /chat/unread-count.
chatRouter.get(
  "/chat/unread-threads-count",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const actorRole = req.actorRole!;
      const count = await unreadThreadsCount(actorId, {
        managerOf: actorRole === "manager" ? actorId : null,
        isStaffAdmin:
          actorRole === "senior_manager" || actorRole === "admin",
      });
      res.json({ count });
    } catch (err) {
      next(err);
    }
  },
);
