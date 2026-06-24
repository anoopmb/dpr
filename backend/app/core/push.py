import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_push_notification_safe(
    endpoint: str,
    p256dh: str,
    auth: str,
    title: str,
    body: str,
    url: str | None = None,
) -> None:
    if not settings.vapid_configured:
        return
    try:
        from pywebpush import WebPushException, webpush  # noqa: PLC0415

        data = json.dumps({"title": title, "body": body, "url": url or "/"})
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=data,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={
                "sub": f"mailto:{settings.smtp_from_email or 'admin@dpr.local'}"
            },
        )
    except Exception as exc:
        # 410 Gone means the subscription was revoked by the browser — treat
        # as info, not a warning; all other failures are warnings but never
        # propagated since push delivery is best-effort.
        try:
            from pywebpush import WebPushException  # noqa: PLC0415

            if isinstance(exc, WebPushException) and exc.response and exc.response.status_code == 410:
                logger.info("Push subscription gone for endpoint %.40s", endpoint)
                return
        except ImportError:
            pass
        logger.warning("Push notification failed: %s", exc)
