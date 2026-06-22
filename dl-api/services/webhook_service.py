import requests
import asyncio
from core.config import EXPRESS_WEBHOOK_URL
from core.logging_config import logger

def _send_webhook_sync(payload: dict, timeout: int) -> bool:
    try:
        import os
        headers = {"Authorization": f"Bearer {os.getenv('API_SECRET')}"}
        resp = requests.post(EXPRESS_WEBHOOK_URL, json=payload, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return True
    except Exception as webhook_err:
        logger.error(f"Webhook delivery failed: {webhook_err}")
        return False

async def send_webhook(payload: dict, timeout: int = 60) -> bool:
    """
    Sends a webhook payload to the Express backend asynchronously.
    Returns True if successful, logs and returns False otherwise.
    """
    return await asyncio.to_thread(_send_webhook_sync, payload, timeout)
