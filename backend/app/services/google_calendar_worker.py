"""Dedicated process entrypoint for PostgreSQL-backed Calendar synchronization."""

import logging
import time

from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.google_calendar import (
    claim_next_google_calendar_job,
    process_google_calendar_job,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run() -> None:
    while True:
        try:
            with Session(engine) as session:
                job = claim_next_google_calendar_job(session)
                if job:
                    process_google_calendar_job(session, job)
                    continue
        except Exception:
            # Never log a response body: it might contain an OAuth error payload.
            logger.exception(
                "Google Calendar sync worker failed while processing a job"
            )
        time.sleep(settings.GOOGLE_CALENDAR_SYNC_POLL_SECONDS)


if __name__ == "__main__":
    run()
