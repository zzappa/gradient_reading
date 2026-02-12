from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User
from schemas.user import UserRead, UserUpdate, UserList

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=UserList)
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return UserList(users=[UserRead.model_validate(u) for u in users])


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserRead.model_validate(user)


@router.put("/{user_id}", response_model=UserRead)
async def update_user(user_id: str, data: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.name is not None:
        user.name = data.name
    if data.levels is not None:
        # Merge incoming levels with existing
        current = dict(user.levels or {})
        for lang, lv in data.levels.items():
            if not 0 <= lv <= 7:
                raise HTTPException(status_code=400, detail=f"Level for {lang} must be between 0 and 7")
            current[lang] = lv
        user.levels = current
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)
