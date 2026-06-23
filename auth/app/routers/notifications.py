"""통합 알림 API — cal_notifications + eas_notifications 합산 조회 + 알림 설정."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────


class NotifItem(BaseModel):
    id: int
    source: str  # "cal" | "eas"
    source_app: str  # "calendar" | "eas"
    type: str
    title: str
    message: Optional[str] = None
    link: Optional[str] = None
    is_read: bool
    created_at: datetime


class NotifListResponse(BaseModel):
    items: list[NotifItem]
    unread_count: int


class ReadItem(BaseModel):
    source: str
    id: int


class ReadRequest(BaseModel):
    items: list[ReadItem]


class PrefApp(BaseModel):
    slug: str
    name: str
    in_app: bool
    browser: bool
    discord: bool


class PrefResponse(BaseModel):
    apps: list[PrefApp]


class PrefUpdateItem(BaseModel):
    slug: str
    in_app: bool
    browser: bool
    discord: bool


class PrefUpdateRequest(BaseModel):
    apps: list[PrefUpdateItem]


# ── Notifications ────────────────────────────────────────


UNIFIED_QUERY = text("""
WITH cal AS (
    SELECT 'cal' AS source, cn.id, COALESCE(cn.source_app, 'calendar') AS source_app,
           COALESCE(cn.type, 'general') AS type,
           cn.title, cn.message, cn.link, cn.is_read, cn.created_at
    FROM cal_notifications cn
    WHERE cn.recipient_id = :uid
      AND NOT EXISTS (
          SELECT 1 FROM notification_preferences np
          WHERE np.user_id = :uid AND np.app_slug = COALESCE(cn.source_app, 'calendar')
            AND np.in_app_enabled = false
      )
),
eas AS (
    SELECT 'eas' AS source, en.id, 'eas' AS source_app,
           CASE
               WHEN en.title LIKE '%신규%' THEN 'ticket_new'
               WHEN en.title LIKE '%픽업%' THEN 'ticket_pickup'
               WHEN en.title LIKE '%완료%' THEN 'ticket_complete'
               WHEN en.title LIKE '%회수%' THEN 'ticket_return'
               ELSE 'notice'
           END AS type,
           en.title, en.message,
           CASE WHEN en.link IS NOT NULL AND en.link NOT LIKE '/eas%' THEN '/eas' || en.link ELSE en.link END AS link,
           en.is_read, en.created_at
    FROM eas_notifications en
    WHERE en.recipient_id = :uid
      AND NOT EXISTS (
          SELECT 1 FROM notification_preferences np
          WHERE np.user_id = :uid AND np.app_slug = 'eas'
            AND np.in_app_enabled = false
      )
)
SELECT * FROM cal UNION ALL SELECT * FROM eas
ORDER BY created_at DESC
LIMIT 50
""")

UNREAD_QUERY = text("""
SELECT
    (SELECT COUNT(*) FROM cal_notifications cn
     WHERE cn.recipient_id = :uid AND cn.is_read = false
       AND NOT EXISTS (
           SELECT 1 FROM notification_preferences np
           WHERE np.user_id = :uid AND np.app_slug = COALESCE(cn.source_app, 'calendar')
             AND np.in_app_enabled = false
       )
    ) +
    (SELECT COUNT(*) FROM eas_notifications en
     WHERE en.recipient_id = :uid AND en.is_read = false
       AND NOT EXISTS (
           SELECT 1 FROM notification_preferences np
           WHERE np.user_id = :uid AND np.app_slug = 'eas'
             AND np.in_app_enabled = false
       )
    ) AS total
""")


@router.get("/notifications", response_model=NotifListResponse)
async def get_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id

    result = await db.execute(UNIFIED_QUERY, {"uid": uid})
    rows = result.fetchall()

    items = [
        NotifItem(
            id=r.id,
            source=r.source,
            source_app=r.source_app,
            type=r.type,
            title=r.title or "",
            message=r.message,
            link=r.link,
            is_read=r.is_read,
            created_at=r.created_at,
        )
        for r in rows
    ]

    unread_result = await db.execute(UNREAD_QUERY, {"uid": uid})
    unread_count = unread_result.scalar() or 0

    return NotifListResponse(items=items, unread_count=unread_count)


@router.post("/notifications/read")
async def mark_read(
    body: ReadRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id
    cal_ids = [item.id for item in body.items if item.source == "cal"]
    eas_ids = [item.id for item in body.items if item.source == "eas"]

    if cal_ids:
        # pending 초대 알림은 읽음 처리에서 제외 (캘린더에서 수락/거부해야 함)
        await db.execute(
            text("""
                UPDATE cal_notifications SET is_read = true
                WHERE id = ANY(:ids) AND recipient_id = :uid
                  AND NOT (
                    type = 'event_invite'
                    AND event_id IS NOT NULL
                    AND EXISTS (
                      SELECT 1 FROM cal_event_participants
                      WHERE event_id = cal_notifications.event_id
                        AND user_id = :uid AND status = 'pending'
                    )
                  )
            """),
            {"ids": cal_ids, "uid": uid},
        )
    if eas_ids:
        await db.execute(
            text("UPDATE eas_notifications SET is_read = true WHERE id = ANY(:ids) AND recipient_id = :uid"),
            {"ids": eas_ids, "uid": uid},
        )
    await db.commit()
    return {"success": True}


@router.post("/notifications/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id
    await db.execute(
        text("UPDATE cal_notifications SET is_read = true WHERE recipient_id = :uid AND is_read = false"),
        {"uid": uid},
    )
    await db.execute(
        text("UPDATE eas_notifications SET is_read = true WHERE recipient_id = :uid AND is_read = false"),
        {"uid": uid},
    )
    await db.commit()
    return {"success": True}


@router.post("/notifications/delete-all")
async def delete_all_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id
    await db.execute(
        text("DELETE FROM cal_notifications WHERE recipient_id = :uid"),
        {"uid": uid},
    )
    await db.execute(
        text("DELETE FROM eas_notifications WHERE recipient_id = :uid"),
        {"uid": uid},
    )
    await db.commit()
    return {"success": True}


# ── Notification Preferences ────────────────────────────


@router.get("/notification-preferences", response_model=PrefResponse)
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id

    # 사용자가 접근 가능한 앱 목록 조회
    apps_result = await db.execute(text("""
        SELECT DISTINCT a.slug, a.name
        FROM apps a
        WHERE a.is_active = true
          AND (
              EXISTS (SELECT 1 FROM app_group_access aga WHERE aga.app_id = a.id AND aga.group_id = :gid)
              OR EXISTS (SELECT 1 FROM app_user_access aua WHERE aua.app_id = a.id AND aua.user_id = :uid)
              OR :role = 'admin'
          )
        ORDER BY a.name
    """), {"uid": uid, "gid": user.group_id, "role": user.role})
    accessible_apps = apps_result.fetchall()

    # 현재 설정 조회
    prefs_result = await db.execute(text("""
        SELECT app_slug, in_app_enabled, browser_enabled, discord_enabled
        FROM notification_preferences
        WHERE user_id = :uid
    """), {"uid": uid})
    prefs_map = {r.app_slug: r for r in prefs_result.fetchall()}

    apps = []
    for app in accessible_apps:
        pref = prefs_map.get(app.slug)
        apps.append(PrefApp(
            slug=app.slug,
            name=app.name,
            in_app=pref.in_app_enabled if pref else True,
            browser=pref.browser_enabled if pref else True,
            discord=pref.discord_enabled if pref else True,
        ))

    return PrefResponse(apps=apps)


@router.put("/notification-preferences")
async def update_preferences(
    body: PrefUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id

    # app_slug 권한 검증: 사용자가 접근 가능한 앱만 허용
    apps_result = await db.execute(text("""
        SELECT DISTINCT a.slug FROM apps a
        WHERE a.is_active = true
          AND (
              EXISTS (SELECT 1 FROM app_group_access aga WHERE aga.app_id = a.id AND aga.group_id = :gid)
              OR EXISTS (SELECT 1 FROM app_user_access aua WHERE aua.app_id = a.id AND aua.user_id = :uid)
              OR :role = 'admin'
          )
    """), {"uid": uid, "gid": user.group_id, "role": user.role})
    allowed_slugs = {r.slug for r in apps_result.fetchall()}

    for item in body.apps:
        if item.slug not in allowed_slugs:
            continue  # 권한 없는 앱 slug는 무시
        await db.execute(text("""
            INSERT INTO notification_preferences (user_id, app_slug, in_app_enabled, browser_enabled, discord_enabled, updated_at)
            VALUES (:uid, :slug, :in_app, :browser, :discord, NOW())
            ON CONFLICT (user_id, app_slug)
            DO UPDATE SET in_app_enabled = :in_app, browser_enabled = :browser, discord_enabled = :discord, updated_at = NOW()
        """), {
            "uid": uid,
            "slug": item.slug,
            "in_app": item.in_app,
            "browser": item.browser,
            "discord": item.discord,
        })

    await db.commit()
    return {"success": True}
