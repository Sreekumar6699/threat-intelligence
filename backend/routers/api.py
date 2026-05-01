from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import List, Dict, Any
import json

from ..database import get_db
from ..models import User, Inventory, Alert
from ..worker import sync_threat_intel

router = APIRouter()

class InventoryAddRequest(BaseModel):
    item: str

class InventoryRemoveRequest(BaseModel):
    item: str

# Hardcoded user ID since auth is disabled for this weekend project
HARDCODED_USER_ID = 1

@router.post("/inventory/upload")
async def upload_inventory(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    try:
        content = await file.read()
        inventory_list = json.loads(content)
        if not isinstance(inventory_list, list):
            raise ValueError("JSON must be a list of strings")
        
        # Upsert inventory for user
        result = await db.execute(select(Inventory).filter(Inventory.user_id == HARDCODED_USER_ID))
        inv = result.scalars().first()
        if inv:
            inv.items = inventory_list
        else:
            inv = Inventory(user_id=HARDCODED_USER_ID, items=inventory_list)
            db.add(inv)
        await db.commit()
        return {"message": "Inventory updated successfully", "items_count": len(inventory_list)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file: {str(e)}")

@router.post("/inventory/add")
async def add_inventory_item(req: InventoryAddRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Inventory).filter(Inventory.user_id == HARDCODED_USER_ID))
    inv = result.scalars().first()
    
    if inv:
        items = list(inv.items or [])
        if req.item not in items:
            items.append(req.item)
            inv.items = items
            flag_modified(inv, "items")
    else:
        inv = Inventory(user_id=HARDCODED_USER_ID, items=[req.item])
        db.add(inv)
        
    await db.commit()
    return {"message": f"Added {req.item} successfully", "items_count": len(inv.items)}

@router.post("/inventory/remove")
async def remove_inventory_item(req: InventoryRemoveRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Inventory).filter(Inventory.user_id == HARDCODED_USER_ID))
    inv = result.scalars().first()
    
    if inv and inv.items:
        items = list(inv.items)
        if req.item in items:
            items.remove(req.item)
            inv.items = items
            flag_modified(inv, "items")
            await db.commit()
            return {"message": f"Removed {req.item} successfully", "items_count": len(inv.items)}
            
    return {"message": "Item not found in inventory", "items_count": len(inv.items) if inv else 0}

@router.get("/inventory")
async def get_inventory(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Inventory).filter(Inventory.user_id == HARDCODED_USER_ID))
    inv = result.scalars().first()
    return {"items": inv.items if inv else []}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    # We will just fetch top 100 alerts ordered by published_at
    result = await db.execute(select(Alert).order_by(Alert.published_at.desc()).limit(100))
    alerts = result.scalars().all()
    return alerts

@router.post("/sync/force")
async def force_sync(background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # Instead of running directly, add to background tasks to avoid blocking response
    background_tasks.add_task(sync_threat_intel)
    return {"message": "Sync started in the background"}
