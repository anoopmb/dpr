import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to_email: str, subject: str, body: str) -> None:
    """No-ops (with a log line) when SMTP isn't configured — email is an
    optional layer on top of in-app notifications, never a hard dependency."""
    if not settings.smtp_configured:
        logger.info("SMTP not configured — skipping email to %s: %s", to_email, subject)
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user,
        password=settings.smtp_password,
        start_tls=settings.smtp_use_tls,
    )


async def send_email_safe(to_email: str, subject: str, body: str) -> None:
    """Same as send_email but never raises — used as the BackgroundTasks
    target so a dead/misconfigured SMTP server can't turn an otherwise
    successful request (e.g. an approval) into a 500 response."""
    try:
        await send_email(to_email, subject, body)
    except Exception:
        logger.exception("Failed to send notification email to %s", to_email)
