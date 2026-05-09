import { Router } from "express";
import { alias } from "drizzle-orm/pg-core";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { kaspiLinks, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAnyRole, requireStaffAdmin } from "../middleware/requireRole";
import {
  SETTING_KEYS,
  getSetting,
  setSetting,
} from "../services/appSettings";

export const kaspiRouter = Router();

const STAFF_ROLES = ["manager", "senior_manager", "admin"] as const;
const STRATEGIES = ["single", "per_group"] as const;
type Strategy = (typeof STRATEGIES)[number];

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// GET /settings/kaspi — admin reads the full config in one shot.
kaspiRouter.get(
  "/settings/kaspi",
  requireAuth,
  requireStaffAdmin,
  async (_req, res, next) => {
    try {
      const [strategyRaw, allLinks, staff] = await Promise.all([
        getSetting(SETTING_KEYS.kaspiStrategy),
        db.select().from(kaspiLinks),
        db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            avatarUrl: users.avatarUrl,
            role: users.role,
            kaspiLinkId: users.kaspiLinkId,
          })
          .from(users)
          .where(
            and(
              inArray(users.role, [...STAFF_ROLES]),
              isNull(users.deactivatedAt),
            ),
          ),
      ]);

      const strategy: Strategy = (STRATEGIES as readonly string[]).includes(
        strategyRaw,
      )
        ? (strategyRaw as Strategy)
        : "single";

      const defaultLink = allLinks.find((l) => l.isDefault) ?? null;
      const groupLinks = allLinks
        .filter((l) => !l.isDefault)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Bucket managers by the link they belong to.
      const managersByLink = new Map<
        string,
        Array<(typeof staff)[number]>
      >();
      for (const u of staff) {
        if (!u.kaspiLinkId) continue;
        const arr = managersByLink.get(u.kaspiLinkId) ?? [];
        arr.push(u);
        managersByLink.set(u.kaspiLinkId, arr);
      }

      res.json({
        strategy,
        defaultLink: defaultLink
          ? { id: defaultLink.id, url: defaultLink.url, label: defaultLink.label }
          : null,
        groupLinks: groupLinks.map((l) => ({
          id: l.id,
          url: l.url,
          label: l.label,
          managers: (managersByLink.get(l.id) ?? []).map((m) => ({
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            email: m.email,
            avatarUrl: m.avatarUrl,
            role: m.role,
          })),
        })),
        // The full active-staff roster powers the multi-select; sending it
        // alongside means the admin UI doesn't need a second request.
        activeStaff: staff.map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          avatarUrl: m.avatarUrl,
          role: m.role,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /settings/kaspi — full atomic replacement. Body:
//   {
//     strategy: 'single' | 'per_group',
//     defaultUrl: string,
//     groupLinks: [{ id?, url, label, managerIds }]
//   }
// Strategy gates mobile resolution; defaultUrl is the URL of the (singleton)
// default link; groupLinks is the new full set — anything not present is
// deleted. id is preserved when provided so a UI that holds onto ids can
// edit a row in place; new rows omit id.
kaspiRouter.put(
  "/settings/kaspi",
  requireAuth,
  requireStaffAdmin,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;
      const body = (req.body ?? {}) as Record<string, unknown>;

      const strategyRaw = body.strategy;
      if (
        typeof strategyRaw !== "string" ||
        !(STRATEGIES as readonly string[]).includes(strategyRaw)
      ) {
        res.status(400).json({ error: "invalid_strategy" });
        return;
      }
      const strategy = strategyRaw as Strategy;

      const defaultUrlRaw = body.defaultUrl;
      if (typeof defaultUrlRaw !== "string") {
        res.status(400).json({ error: "default_url_required" });
        return;
      }
      const defaultUrl = defaultUrlRaw.trim();
      if (defaultUrl.length === 0 || !isUrl(defaultUrl)) {
        res.status(400).json({ error: "invalid_default_url" });
        return;
      }

      const groupLinksRaw = body.groupLinks;
      if (!Array.isArray(groupLinksRaw)) {
        res.status(400).json({ error: "invalid_group_links" });
        return;
      }

      type ParsedGroup = {
        id: string | null;
        url: string;
        label: string;
        managerIds: string[];
      };
      const groups: ParsedGroup[] = [];
      const seenManagerIds = new Set<string>();

      for (const raw of groupLinksRaw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          res.status(400).json({ error: "invalid_group_links" });
          return;
        }
        const r = raw as Record<string, unknown>;
        const id = typeof r.id === "string" && r.id.length > 0 ? r.id : null;
        const url = typeof r.url === "string" ? r.url.trim() : "";
        const label = typeof r.label === "string" ? r.label.trim() : "";
        if (url.length === 0 || !isUrl(url)) {
          res.status(400).json({ error: "invalid_group_url" });
          return;
        }
        if (label.length === 0) {
          res.status(400).json({ error: "group_label_required" });
          return;
        }
        const ids = Array.isArray(r.managerIds) ? r.managerIds : [];
        const managerIds: string[] = [];
        for (const m of ids) {
          if (typeof m !== "string" || m.length === 0) {
            res.status(400).json({ error: "invalid_group_links" });
            return;
          }
          if (seenManagerIds.has(m)) {
            // The schema permits a manager in only one link via
            // users.kaspi_link_id, but reject early with a friendly code
            // before we touch the DB.
            res.status(400).json({ error: "manager_in_multiple_groups" });
            return;
          }
          seenManagerIds.add(m);
          managerIds.push(m);
        }
        groups.push({ id, url, label, managerIds });
      }

      // Verify all referenced managers exist + are active staff.
      if (seenManagerIds.size > 0) {
        const found = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.id, [...seenManagerIds]),
              inArray(users.role, [...STAFF_ROLES]),
              isNull(users.deactivatedAt),
            ),
          );
        if (found.length !== seenManagerIds.size) {
          res.status(400).json({ error: "manager_not_active_staff" });
          return;
        }
      }

      // Strategy doesn't depend on link rows existing — write it before the
      // transaction. A failed transaction would leave strategy updated but
      // links unchanged; mobile resolution still works (per_group falls
      // back to the default link, single ignores groups).
      await setSetting(SETTING_KEYS.kaspiStrategy, strategy, actorId);

      await db.transaction(async (tx) => {
        // Upsert the default link. There can be at most one (partial
        // unique index) — read it, update or insert.
        const existingDefaultRows = await tx
          .select()
          .from(kaspiLinks)
          .where(eq(kaspiLinks.isDefault, true))
          .limit(1);
        if (existingDefaultRows.length > 0) {
          await tx
            .update(kaspiLinks)
            .set({ url: defaultUrl, updatedAt: new Date() })
            .where(eq(kaspiLinks.id, existingDefaultRows[0].id));
        } else {
          await tx.insert(kaspiLinks).values({
            url: defaultUrl,
            label: "По умолчанию",
            isDefault: true,
          });
        }

        // Sync group links: delete-then-insert is simplest and matches the
        // "PUT replaces the whole set" semantics. Pre-collect existing ids
        // we want to keep so users.kaspi_link_id pointers persist for
        // unchanged groups.
        const existingGroupRows = await tx
          .select({ id: kaspiLinks.id })
          .from(kaspiLinks)
          .where(eq(kaspiLinks.isDefault, false));
        const keepIds = new Set(
          groups.map((g) => g.id).filter((id): id is string => id !== null),
        );
        const deleteIds = existingGroupRows
          .map((r) => r.id)
          .filter((id) => !keepIds.has(id));
        if (deleteIds.length > 0) {
          await tx
            .delete(kaspiLinks)
            .where(inArray(kaspiLinks.id, deleteIds));
        }

        // Update / insert each group.
        const groupIdMap = new Map<number, string>();
        for (let i = 0; i < groups.length; i++) {
          const g = groups[i];
          if (g.id) {
            await tx
              .update(kaspiLinks)
              .set({ url: g.url, label: g.label, updatedAt: new Date() })
              .where(eq(kaspiLinks.id, g.id));
            groupIdMap.set(i, g.id);
          } else {
            const inserted = await tx
              .insert(kaspiLinks)
              .values({
                url: g.url,
                label: g.label,
                isDefault: false,
              })
              .returning({ id: kaspiLinks.id });
            groupIdMap.set(i, inserted[0].id);
          }
        }

        // Reset all managers' kaspi_link_id to null first, then bulk-set
        // per group. This keeps the migration declarative — managers no
        // longer in any group fall back to the default link.
        await tx
          .update(users)
          .set({ kaspiLinkId: null })
          .where(
            and(
              inArray(users.role, [...STAFF_ROLES]),
              isNull(users.deactivatedAt),
            ),
          );
        for (let i = 0; i < groups.length; i++) {
          const g = groups[i];
          if (g.managerIds.length === 0) continue;
          const newId = groupIdMap.get(i);
          if (!newId) continue;
          await tx
            .update(users)
            .set({ kaspiLinkId: newId })
            .where(inArray(users.id, g.managerIds));
        }
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// GET /me/kaspi-link — mobile resolves the right URL after order creation.
// Public-on-token: any authenticated client can call. Resolution mirrors
// the strategy field: 'single' → default link, 'per_group' → manager's
// link if any, else default. 503 when nothing is configured.
kaspiRouter.get(
  "/me/kaspi-link",
  requireAuth,
  requireAnyRole,
  async (req, res, next) => {
    try {
      const actorId = req.actorId!;

      const strategyRaw = await getSetting(SETTING_KEYS.kaspiStrategy);
      const strategy: Strategy = (STRATEGIES as readonly string[]).includes(
        strategyRaw,
      )
        ? (strategyRaw as Strategy)
        : "single";

      const [defaultRows] = await Promise.all([
        db
          .select({ id: kaspiLinks.id, url: kaspiLinks.url, label: kaspiLinks.label })
          .from(kaspiLinks)
          .where(eq(kaspiLinks.isDefault, true))
          .limit(1),
      ]);
      const defaultLink = defaultRows[0] ?? null;

      if (strategy === "single") {
        if (!defaultLink) {
          res.status(503).json({ error: "kaspi_link_not_configured" });
          return;
        }
        res.json({ url: defaultLink.url, label: defaultLink.label });
        return;
      }

      // per_group: client → their manager → manager's kaspi_link_id.
      const clientUsers = alias(users, "client_users");
      const managerUsers = alias(users, "manager_users");
      const managerLink = await db
        .select({
          url: kaspiLinks.url,
          label: kaspiLinks.label,
        })
        .from(clientUsers)
        .innerJoin(managerUsers, eq(managerUsers.id, clientUsers.managerId))
        .innerJoin(kaspiLinks, eq(kaspiLinks.id, managerUsers.kaspiLinkId))
        .where(eq(clientUsers.id, actorId))
        .limit(1);

      if (managerLink.length > 0) {
        res.json({ url: managerLink[0].url, label: managerLink[0].label });
        return;
      }
      if (!defaultLink) {
        res.status(503).json({ error: "kaspi_link_not_configured" });
        return;
      }
      res.json({ url: defaultLink.url, label: defaultLink.label });
    } catch (err) {
      next(err);
    }
  },
);
