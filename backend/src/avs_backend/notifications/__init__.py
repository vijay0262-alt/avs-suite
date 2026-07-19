"""Notifications — Professional notification system."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.notifications.notification_manager import (
    NotificationType,
    NotificationPriority,
    Notification,
    create_notification,
    get_notifications,
    dismiss_notification,
    clear_dismissed_notifications,
    clear_all_notifications,
    get_unread_count,
    notify_optimization_complete,
    notify_memory_optimized,
    notify_privacy_cleaned,
    notify_startup_updated,
    notify_operation_failed,
    notify_undo_available,
)

logger = logging.getLogger(__name__)


@register("notifications.list")
def notifications_list(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get notifications with optional filtering."""
    try:
        limit = params.get("limit", 50) if params else 50
        dismissed = params.get("dismissed") if params else None
        notification_type = None
        if params and "type" in params:
            notification_type = NotificationType(params["type"])

        notifications = get_notifications(
            limit=limit,
            dismissed=dismissed,
            notification_type=notification_type,
        )

        return {
            "notifications": [
                {
                    "id": notif.id,
                    "type": notif.type.value,
                    "title": notif.title,
                    "message": notif.message,
                    "priority": notif.priority.value,
                    "timestamp": notif.timestamp,
                    "module": notif.module,
                    "action": notif.action,
                    "actionData": notif.action_data,
                    "dismissed": notif.dismissed,
                }
                for notif in notifications
            ],
            "count": len(notifications),
        }
    except Exception as e:
        logger.error(f"Failed to get notifications: {e}")
        raise


@register("notifications.dismiss")
def notifications_dismiss(params: dict[str, Any] | None) -> dict[str, Any]:
    """Dismiss a notification."""
    try:
        if not params or "id" not in params:
            raise ValueError("Missing required parameter: id")

        notification_id = params["id"]
        success = dismiss_notification(notification_id)

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to dismiss notification: {e}")
        raise


@register("notifications.clearDismissed")
def notifications_clear_dismissed(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all dismissed notifications."""
    try:
        count = clear_dismissed_notifications()
        return {"cleared": count}
    except Exception as e:
        logger.error(f"Failed to clear dismissed notifications: {e}")
        raise


@register("notifications.clearAll")
def notifications_clear_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all notifications."""
    try:
        count = clear_all_notifications()
        return {"cleared": count}
    except Exception as e:
        logger.error(f"Failed to clear all notifications: {e}")
        raise


@register("notifications.unreadCount")
def notifications_unread_count(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get count of unread notifications."""
    try:
        count = get_unread_count()
        return {"count": count}
    except Exception as e:
        logger.error(f"Failed to get unread count: {e}")
        raise


@register("notifications.create")
def notifications_create(params: dict[str, Any] | None) -> dict[str, Any]:
    """Create a new notification."""
    try:
        if not params:
            raise ValueError("Missing required parameters")

        notification_type = NotificationType(params.get("type", "info"))
        title = params.get("title", "")
        message = params.get("message", "")
        priority = NotificationPriority(params.get("priority", "normal"))
        module = params.get("module", "")
        action = params.get("action")
        action_data = params.get("actionData")

        notification = create_notification(
            notification_type=notification_type,
            title=title,
            message=message,
            priority=priority,
            module=module,
            action=action,
            action_data=action_data,
        )

        return {
            "id": notification.id,
            "type": notification.type.value,
            "title": notification.title,
            "message": notification.message,
            "priority": notification.priority.value,
            "timestamp": notification.timestamp,
            "module": notification.module,
            "action": notification.action,
            "actionData": notification.action_data,
        }
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")
        raise
