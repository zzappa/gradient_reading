"""Seed preseed sample projects from artifact.

By default this is non-destructive and safe to run on app startup.
Use CLI flags for destructive maintenance operations.
"""
import argparse
import asyncio

from sqlalchemy import select

from database import init_db, async_session
from models.user import User
from preseed_artifacts import preseed_projects_from_artifact


async def seed(*, reset_users: bool = False, prune_missing: bool = False):
    await init_db()
    async with async_session() as session:
        if reset_users:
            existing_users = (await session.execute(select(User))).scalars().all()
            for user in existing_users:
                await session.delete(user)
            print(f"Removed users: {len(existing_users)}")
            await session.commit()

        try:
            preseed_result = await preseed_projects_from_artifact(
                session,
                prune_missing=prune_missing,
            )
            if preseed_result.get("loaded"):
                skipped = preseed_result.get("skipped_processing", 0)
                print(
                    "Preseeded sample projects: "
                    f"{preseed_result['projects']} projects / {preseed_result['chapters']} chapters "
                    f"(skipped busy: {skipped})"
                )
            else:
                print(f"Preseed skipped: {preseed_result.get('reason', 'unknown reason')}")
        except Exception as exc:
            await session.rollback()
            print(f"Preseed failed: {exc}")
    print("Seeding complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed sample projects from artifact.")
    parser.add_argument(
        "--reset-users",
        action="store_true",
        help="Delete all users before seeding. Destructive.",
    )
    parser.add_argument(
        "--prune-missing",
        action="store_true",
        help="Delete preseed projects not present in artifact.",
    )
    args = parser.parse_args()
    asyncio.run(seed(reset_users=args.reset_users, prune_missing=args.prune_missing))
