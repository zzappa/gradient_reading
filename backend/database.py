from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase

from config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Keep one chapter per (project_id, chapter_num), then enforce uniqueness.
        await conn.execute(
            text(
                """
                DELETE FROM chapters
                WHERE id IN (
                    SELECT id
                    FROM (
                        SELECT
                            id,
                            ROW_NUMBER() OVER (
                                PARTITION BY project_id, chapter_num
                                ORDER BY created_at DESC, id DESC
                            ) AS rn
                        FROM chapters
                    ) ranked
                    WHERE ranked.rn > 1
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_chapters_project_chapter_num
                ON chapters(project_id, chapter_num)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_transformation_jobs_project_id
                ON transformation_jobs(project_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_transformation_jobs_status
                ON transformation_jobs(status)
                """
            )
        )
