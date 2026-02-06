import sys
import os
import json
import logging
from urllib.parse import unquote

# Add project root to path so 'cenima' package can be imported
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'cenima-cli'))

from cenima.scraper import TopCinemaScraper, clean_arabic_title, extract_season_number, extract_season_part

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("DeepParserTest")

def test_season_extraction():
    print("="*60)
    print("TESTING SEASON NUMBER EXTRACTION")
    print("="*60)
    
    test_cases = [
        # User requested cases
        "Attack on Titan: The Final Season Part 1",
        "Attack on Titan: The Final Season Part 2",
        "One Piece",
        "Breaking Bad Season 1",
        "Demon Slayer: Kimetsu no Yaiba Swordsmith Village Arc",
        
        # Additional edge cases
        "Attack on Titan Final Part 3",
        "Attack on Titan Final Season Part 3",
        "Attack on Titan The Final Season - Part 1"
    ]

    print(f"{'Input String':<60} | {'Season':<8} | {'Part'}")
    print("-" * 85)

    for text in test_cases:
        season_num = extract_season_number(text)
        part = extract_season_part(text)
        
        # Format for readability
        part_str = part if part else "-"
        print(f"{text[:58]:<60} | {season_num:<8} | {part_str}")

def pjson(data):
    return json.dumps(data, indent=2, ensure_ascii=False)

def test_search_and_extract():
    scraper = TopCinemaScraper()
    
    # Test 1: Search
    query = "Breaking Bad"
    logger.info(f"1. Searching for '{query}'...")
    results = scraper.search(query)
    
    if not results:
        logger.error("Search failed! No results.")
        return
        
    logger.info(f"Found {len(results)} results.")
    target = results[0]
    logger.info(f"Targeting: {target['title']} ({target['type']})")
    
    # Test 2: Details
    logger.info(f"2. Fetching details for {target['url']}...")
    if target['type'] == 'movie':
        details = scraper.get_movie_details(target['url'])
    else:
        details = scraper.get_series_details(target['url'])
        
    if not details:
        logger.error("Details fetch failed!")
        return

    logger.info(f"Details extracted: {details.get('title')} ({details.get('year')})")
    seasons = details.get('seasons', [])
    logger.info(f"Seasons/Lists found: {len(seasons)}")
    
    # Test 3: Episodes
    if seasons:
        first_season = seasons[0]
        logger.info(f"3. Fetching episodes for Season {first_season.get('season_number', '?')}...")
        episodes = scraper.fetch_season_episodes(first_season)
        
        logger.info(f"Episodes found: {len(episodes)}")
        if episodes:
            logger.info("Sample Episode:")
            logger.info(pjson(episodes[0]))

def test_anime_specific():
    scraper = TopCinemaScraper()
    query = "Attack on Titan"
    logger.info(f"Testing Deep Inspection for '{query}'...")
    
    results = scraper.search_anime(query)
    if not results:
        logger.warning(f"Anime search '{query}' return empty.")
        return

    target = results[0]
    logger.info(f"Found: {target['title']}")
    
    details = scraper.get_series_details(target['url'], show_type="anime")
    if details and details.get('seasons'):
        logger.info(f"Anime Seasons Found: {len(details['seasons'])}")
        
        for idx, s in enumerate(details['seasons']):
            # s['url'] might look like .../series/name-season-4-part-2/
            sn = s.get('season_number')
            url = s.get('url', 'N/A')
            label = s.get('display_label', 'N/A')
            
            # Extract slug from url for visual check
            slug = url.split('/')[-2] if url.endswith('/') else url.split('/')[-1]
            slug = unquote(slug)
            
            logger.info(f"[{idx+1}] Season {sn} | Label: {label} | Slug: {slug}")
            
            # Fetch episode counts (lazy)
            # Only for S4 or Final seasons to save time
            if sn == 4 or sn > 100:
                eps = scraper.fetch_season_episodes(s)
                logger.info(f"    -> Episodes: {len(eps)}")
                if eps:
                    first = eps[0]['title']
                    last = eps[-1]['title']
                    first_url = eps[0]['url']
                    logger.info(f"       First: {first[:30]}... URL: {unquote(first_url).split('/')[-2]}")
                    logger.info(f"       Last:  {last[:30]}...")

if __name__ == "__main__":
    logger.info("Starting AOT Deep Dive...")
    try:
        test_anime_specific()
        logger.info("Test Run Complete.")
    except Exception as e:
        logger.exception("Test failed:")
