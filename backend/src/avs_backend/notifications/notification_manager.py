"""Notifications - Professional notification system.

Provides notification events for:
- Optimization Complete
- Memory Optimized
- Privacy Cleaned
- Startup Updated
- Operation Failed
- Undo Available

Backend stores notification events and provides RPC methods.
Frontend handles actual toast notification display.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    """Notification types."""

    OPTIMIZATION_COMPLETE = "optimization_complete"
    MEMORY_OPTIMIZED = "memory_optimized"
    PRIVACY_CLEANED = "privacy_cleaned"
    STARTUP_UPDATED = "startup_updated"
    OPERATION_FAILED = "operation_failed"
    UNDO_AVAILABLE = "undo_available"
    WARNING = "warning"
    INFO = "info"
    SUCCESS = "success"


class NotificationPriority(str, Enum):
    """Notification priority levels."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


@dataclass(slots=True)
class Notification:
    """A notification event."""

    id: str
    type: NotificationType
    title: str
    message: str
    priority: NotificationPriority = NotificationPriority.NORMAL
    timestamp: str = ""
    module: str = ""
    action: str | None = None
    action_data: dict[str, Any] = field(default_factory=dict)
    dismissed: bool = False


# In-memory notification storage (could be moved to database for persistence)
_notifications: list[Notification] = []


def create_notification(
    notification_type: NotificationType,
    title: str,
    message: str,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    module: str = "",
    action: str | None = None,
    action_data: dict[str, Any] | None = None,
) -> Notification:
    """Create a new notification.

    Args:
        notification_type: Type of notification
        title: Notification title
        message: Notification message
        priority: Notification priority
        module: Module that generated the notification
        action: Optional action to perform when clicked
        action_data: Data for the action

    Returns:
        Notification object
    """
    notification_id = f"notif_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"

    notification = Notification(
        id=notification_id,
        type=notification_type,
        title=title,
        message=message,
        priority=priority,
        timestamp=datetime.now().isoformat(),
        module=module,
        action=action,
        action_data=action_data or {},
    )

    _notifications.append(notification)
    logger.info(f"Created notification: {title} - {message}")

    return notification


def get_notifications(
    limit: int = 50,
    dismissed: bool | None = None,
    notification_type: NotificationType | None = None,
) -> list[Notification]:
    """Get notifications with optional filtering.

    Args:
        limit: Maximum number of notifications to return
        dismissed: Filter by dismissed status (None = all)
        notification_type: Filter by notification type

    Returns:
        List of Notification objects
    """
    filtered = _notifications

    if dismissed is not None:
        filtered = [n for n in filtered if n.dismissed == dismissed]

    if notification_type:
        filtered = [n for n in filtered if n.type == notification_type]

    # Sort by timestamp, newest first
    filtered.sort(key=lambda x: x.timestamp, reverse=True)

    return filtered[:limit]


def dismiss_notification(notification_id: str) -> bool:
    """Dismiss a notification.

    Args:
        notification_id: ID of notification to dismiss

    Returns:
        True if successful, False otherwise
    """
    for notification in _notifications:
        if notification.id == notification_id:
            notification.dismissed = True
            logger.info(f"Dismissed notification: {notification_id}")
            return True
    return False


def clear_dismissed_notifications() -> int:
    """Clear all dismissed notifications.

    Returns:
        Number of notifications cleared
    """
    count = len([n for n in _notifications if n.dismissed])
    _notifications[:] = [n for n in _notifications if not n.dismissed]
    logger.info(f"Cleared {count} dismissed notifications")
    return count


def clear_all_notifications() -> int:
    """Clear all notifications.

    Returns:
        Number of notifications cleared
    """
    count = len(_notifications)
    _notifications.clear()
    logger.info(f"Cleared all notifications ({count} total)")
    return count


def get_unread_count() -> int:
    """Get count of unread (non-dismissed) notifications.

    Returns:
        Number of unread notifications
    """
    return len([n for n in _notifications if not n.dismissed])


# Predefined notification templates
def notify_optimization_complete(
    module: str,
    space_saved: int = 0,
    duration_ms: int = 0,
) -> Notification:
    """Create optimization complete notification."""
    space_mb = space_saved / 1024 / 1024
    message = f"Optimization completed. "
    if space_mb > 0:
        message += f"Saved {space_mb:.1f} MB. "
    if duration_ms > 0:
        message += f"Took {duration_ms / 1000:.1f} seconds."

    return create_notification(
        notification_type=NotificationType.OPTIMIZATION_COMPLETE,
        title="Optimization Complete",
        message=message,
        priority=NotificationPriority.NORMAL,
        module=module,
    )


def notify_memory_optimized(
    memory_freed: int = 0,
    processes_optimized: int = 0,
) -> Notification:
    """Create memory optimized notification."""
    memory_mb = memory_freed / 1024 / 1024
    message = f"Memory optimization completed. "
    if memory_mb > 0:
        message += f"Freed {memory_mb:.1f} MB. "
    if processes_optimized > 0:
        message += f"Optimized {processes_optimized} processes."

    return create_notification(
        notification_type=NotificationType.MEMORY_OPTIMIZED,
        title="Memory Optimized",
        message=message,
        priority=NotificationPriority.NORMAL,
        module="memory_optimizer",
    )


def notify_privacy_cleaned(
    items_cleaned: int = 0,
    space_freed: int = 0,
) -> Notification:
    """Create privacy cleaned notification."""
    space_mb = space_freed / 1024 / 1024
    message = f"Privacy cleaning completed. "
    if items_cleaned > 0:
        message += f"Cleaned {items_cleaned} items. "
    if space_mb > 0:
        message += f"Freed {space_mb:.1f} MB."

    return create_notification(
        notification_type=NotificationType.PRIVACY_CLEANED,
        title="Privacy Cleaned",
        message=message,
        priority=NotificationPriority.NORMAL,
        module="privacy_cleaner",
    )


def notify_startup_updated(
    action: str,
    app_name: str,
) -> Notification:
    """Create startup updated notification."""
    message = f"Startup entry '{app_name}' has been {action}."

    return create_notification(
        notification_type=NotificationType.STARTUP_UPDATED,
        title="Startup Updated",
        message=message,
        priority=NotificationPriority.NORMAL,
        module="startup_manager",
    )


def notify_operation_failed(
    module: str,
    operation: str,
    error: str,
) -> Notification:
    """Create operation failed notification."""
    return create_notification(
        notification_type=NotificationType.OPERATION_FAILED,
        title="Operation Failed",
        message=f"{module} {operation} failed: {error}",
        priority=NotificationPriority.HIGH,
        module=module,
    )


def notify_undo_available(
    backup_id: str,
    operation: str,
) -> Notification:
    """Create undo available notification."""
    return create_notification(
        notification_type=NotificationType.UNDO_AVAILABLE,
        title="Undo Available",
        message=f"You can undo the last operation: {operation}",
        priority=NotificationPriority.NORMAL,
        module="undo",
        action="restore",
        action_data={"backupId": backup_id},
    )
