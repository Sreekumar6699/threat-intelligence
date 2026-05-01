import asyncio
import aiohttp
import feedparser
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from .database import AsyncSessionLocal
from .models import Inventory, Alert

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

async def fetch_rss(url: str, session: aiohttp.ClientSession):
    try:
        async with session.get(url, timeout=15) as response:
            content = await response.read()
            feed = feedparser.parse(content)
            return feed.entries
    except Exception as e:
        logger.error(f"Error fetching RSS {url}: {e}")
        return []

async def fetch_ransomware_live(endpoint: str, session: aiohttp.ClientSession):
    url = f"https://api.ransomware.live{endpoint}"
    try:
        async with session.get(url, timeout=15) as response:
            if response.status == 200:
                return await response.json()
            return []
    except Exception as e:
        logger.error(f"Error fetching ransomware.live {endpoint}: {e}")
        return []

async def fetch_github_cves(session: aiohttp.ClientSession):
    # For GitHub, we can search recent CVEs or look at trickest/cve
    # Let's use Github search API for recent CVEs as an example
    # We'll search for repositories created recently with "CVE" in name
    # To keep it simple and reliable without auth, we'll just use another RSS feed for NVD or similar, 
    # but since the prompt asked for Github PoCs, let's query the Github API.
    # Note: Rate limits might apply without a token.
    url = "https://api.github.com/search/repositories?q=CVE+pushed:>"+(datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')+"&sort=updated"
    try:
        async with session.get(url, timeout=15, headers={"User-Agent": "Threat-Dashboard"}) as response:
            if response.status == 200:
                data = await response.json()
                return data.get("items", [])
            return []
    except Exception as e:
        logger.error(f"Error fetching GitHub PoCs: {e}")
        return []

def match_inventory(text: str, inventory_items: list[str]) -> str | None:
    if not text or not inventory_items:
        return None
    text_lower = text.lower()
    for item in inventory_items:
        if item.lower() in text_lower:
            return item
    return None

async def sync_threat_intel():
    logger.info("Starting Threat Intel Sync...")
    async with AsyncSessionLocal() as db:
        # Get all inventory items
        result = await db.execute(select(Inventory))
        inventories = result.scalars().all()
        
        all_inventory_items = set()
        for inv in inventories:
            all_inventory_items.update(inv.items)
            
        all_items_list = list(all_inventory_items)
        if not all_items_list:
            logger.info("No inventory items to match against. Skipping sync.")
            return

        async with aiohttp.ClientSession() as session:
            # 1. Fetch from RSS Feeds
            cisa_entries, bleeping_entries = await asyncio.gather(
                fetch_rss("https://www.cisa.gov/cybersecurity-advisories/all.xml", session),
                fetch_rss("https://www.bleepingcomputer.com/feed/", session)
            )

            # 2. Fetch from Ransomware.live (recentattacks and attacks)
            # attacks might be too big, we use recentattacks
            rw_recent = await fetch_ransomware_live("/recentattacks", session)

            # 3. Fetch GitHub PoCs
            github_repos = await fetch_github_cves(session)

            alerts_to_add = []

            # Process RSS
            for entry in (cisa_entries + bleeping_entries):
                title = entry.get('title', '')
                description = entry.get('description', '')
                matched = match_inventory(f"{title} {description}", all_items_list)
                if matched:
                    # Check if already exists to avoid duplicates
                    # A naive check would just add, let's assume we use URL as uniqueish identifier in combination with matched
                    alerts_to_add.append(Alert(
                        source="RSS",
                        title=title,
                        description=description[:500] if description else "",
                        url=entry.get('link', ''),
                        matched_on=matched,
                        published_at=datetime.now(timezone.utc) # Simplify parsing pubDate
                    ))

            # Process Ransomware.live
            for attack in rw_recent:
                # Ransomware.live returns list of dicts, format might vary, usually has 'victim', 'group', 'discovered'
                victim = attack.get('victim', attack.get('post_title', ''))
                group = attack.get('group_name', attack.get('group', ''))
                desc = attack.get('description', '')
                matched = match_inventory(f"{victim} {group} {desc}", all_items_list)
                if matched:
                    alerts_to_add.append(Alert(
                        source="Ransomware.live",
                        title=f"Ransomware Attack by {group} on {victim}",
                        description=desc[:500],
                        url=f"https://ransomware.live/#/group/{group}",
                        matched_on=matched,
                        published_at=datetime.now(timezone.utc)
                    ))

            # Process GitHub
            for repo in github_repos:
                name = repo.get('name', '')
                desc = repo.get('description', '')
                matched = match_inventory(f"{name} {desc}", all_items_list)
                if matched:
                    alerts_to_add.append(Alert(
                        source="GitHub PoC",
                        title=name,
                        description=desc[:500] if desc else "No description",
                        url=repo.get('html_url', ''),
                        matched_on=matched,
                        published_at=datetime.now(timezone.utc)
                    ))

            if alerts_to_add:
                # We should deduplicate against existing to avoid spam, but for simplicity we'll just add.
                # A robust approach checks existing URLs.
                existing_urls_result = await db.execute(select(Alert.url))
                existing_urls = {row[0] for row in existing_urls_result.all() if row[0]}
                
                new_alerts = [a for a in alerts_to_add if a.url not in existing_urls]
                
                db.add_all(new_alerts)
                await db.commit()
                logger.info(f"Added {len(new_alerts)} new alerts.")
            else:
                logger.info("No new alerts matched inventory.")

async def cleanup_old_alerts():
    logger.info("Running 30-day data retention cleanup...")
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Alert).where(Alert.created_at < thirty_days_ago))
        await db.commit()

def start_scheduler():
    scheduler.add_job(sync_threat_intel, 'interval', minutes=15)
    scheduler.add_job(cleanup_old_alerts, 'interval', hours=24)
    scheduler.start()

def stop_scheduler():
    scheduler.shutdown()
