import base64
import binascii
import secrets
import warnings
from typing import Annotated, Any, Literal

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    HttpUrl,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


def cash_flow_share_frontend_host(
    *, environment: str, domain: str, local_frontend_host: str
) -> str:
    if environment == "local":
        return local_frontend_host.rstrip("/")
    return f"https://dashboard.{domain.rstrip('/')}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Use top level .env file (one level above ./backend/)
        env_file="../.env",
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    DOMAIN: str = "localhost.tiangolo.com"
    FRONTEND_HOST: str = "http://localhost:5173"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"
    CASH_FLOW_SHARE_TOKEN_ENCRYPTION_KEY: str | None = None
    GOOGLE_CALENDAR_CLIENT_ID: str | None = None
    GOOGLE_CALENDAR_CLIENT_SECRET: str | None = None
    GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: str | None = None
    GOOGLE_CALENDAR_REDIRECT_URI: str | None = None
    GOOGLE_CALENDAR_SYNC_POLL_SECONDS: int = 15

    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        origins = [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST.rstrip("/")
        ]
        if self.ENVIRONMENT == "local":
            origins.extend(
                f"http://{host}:{port}"
                for host in ("localhost", "127.0.0.1")
                for port in (3000, 4173, 5173, 5174, 5175, 5176)
            )
        return list(dict.fromkeys(origins))

    @property
    def cash_flow_share_frontend_host(self) -> str:
        return cash_flow_share_frontend_host(
            environment=self.ENVIRONMENT,
            domain=self.DOMAIN,
            local_frontend_host=self.FRONTEND_HOST,
        )

    @property
    def google_calendar_redirect_uri(self) -> str:
        if self.GOOGLE_CALENDAR_REDIRECT_URI:
            return self.GOOGLE_CALENDAR_REDIRECT_URI
        if self.ENVIRONMENT == "local":
            return f"http://localhost:8000{self.API_V1_STR}/calendar-integrations/google/callback"
        return (
            f"https://api.{self.DOMAIN.rstrip('/')}{self.API_V1_STR}"
            "/calendar-integrations/google/callback"
        )

    @property
    def google_calendar_enabled(self) -> bool:
        return bool(
            self.GOOGLE_CALENDAR_CLIENT_ID
            and self.GOOGLE_CALENDAR_CLIENT_SECRET
            and self.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY
        )

    PROJECT_NAME: str
    SENTRY_DSN: HttpUrl | None = None
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: str | None = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    EMAIL_TEST_USER: EmailStr = "test@example.com"
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str
    CARETAKER_USER_EMAIL: EmailStr = "caretaker@example.com"
    CARETAKER_USER_PASSWORD: str = "changethis"
    CLEANER_STATUS_SMS_TO: str | None = None
    CONTRACTOR_DOOR_CODES: dict[str, str] = {}
    TWILIO_ACCOUNT_SID: str | None = None
    TWILIO_AUTH_TOKEN: str | None = None
    TWILIO_FROM_NUMBER: str | None = None
    TWILIO_MESSAGING_SERVICE_SID: str | None = None
    TWILIO_STATUS_CALLBACK_URL: HttpUrl | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def twilio_enabled(self) -> bool:
        has_sender = bool(self.TWILIO_FROM_NUMBER or self.TWILIO_MESSAGING_SERVICE_SID)
        return bool(
            self.TWILIO_ACCOUNT_SID and self.TWILIO_AUTH_TOKEN and has_sender
        )

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )
        self._check_default_secret(
            "CARETAKER_USER_PASSWORD", self.CARETAKER_USER_PASSWORD
        )

        share_key = self.CASH_FLOW_SHARE_TOKEN_ENCRYPTION_KEY
        if self.ENVIRONMENT != "local" and not share_key:
            raise ValueError(
                "CASH_FLOW_SHARE_TOKEN_ENCRYPTION_KEY must be configured outside local"
            )
        if share_key:
            try:
                decoded_share_key = base64.urlsafe_b64decode(share_key.encode())
            except (binascii.Error, ValueError) as exc:
                raise ValueError(
                    "CASH_FLOW_SHARE_TOKEN_ENCRYPTION_KEY must be a Fernet key"
                ) from exc
            if len(decoded_share_key) != 32:
                raise ValueError(
                    "CASH_FLOW_SHARE_TOKEN_ENCRYPTION_KEY must be a Fernet key"
                )

        google_calendar_values = (
            self.GOOGLE_CALENDAR_CLIENT_ID,
            self.GOOGLE_CALENDAR_CLIENT_SECRET,
            self.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY,
        )
        if self.ENVIRONMENT != "local" and not all(google_calendar_values):
            raise ValueError(
                "GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and "
                "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be configured outside local"
            )
        calendar_key = self.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY
        if calendar_key:
            try:
                decoded_calendar_key = base64.urlsafe_b64decode(calendar_key.encode())
            except (binascii.Error, ValueError) as exc:
                raise ValueError(
                    "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be a Fernet key"
                ) from exc
            if len(decoded_calendar_key) != 32:
                raise ValueError(
                    "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be a Fernet key"
                )
        if self.GOOGLE_CALENDAR_SYNC_POLL_SECONDS < 1:
            raise ValueError("GOOGLE_CALENDAR_SYNC_POLL_SECONDS must be positive")

        return self


settings = Settings()  # type: ignore
