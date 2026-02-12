import logging

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"
    ENVIRONMENT: str = "development"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

if not settings.ANTHROPIC_API_KEY:
    logger.warning(
        "ANTHROPIC_API_KEY is not set. Claude-powered endpoints will fail until configured."
    )
