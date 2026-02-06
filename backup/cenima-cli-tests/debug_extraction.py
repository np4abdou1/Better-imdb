
import sys
import os
import json
import logging

# Ensure we can import from current directory
sys.path.append(os.getcwd())

from cenima.scraper import TopCinemaScraper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def debug_aot_extraction():
    scraper = TopCinemaScraper()
    query = "Attack on Titan"
    
    print(f"Searching for '{query}'...")
    results = scraper.search(query)
    
    if not results:
        print("No search results found.")
        return

    # Filter for anime/series
    target_show = None
    for r in results:
        title = r.get('title', '').lower()
        if 'titan' in title and r.get('type') in ('anime', 'series'):
             target_show = r
             break
    
    if not target_show:
        print("Could not find a likely Anime/Series result for Attack on Titan.")
        print("Available results:")
        for r in results:
            print(f"- {r['title']} ({r['type']})")
        # Fallback to first result if no series found, or just pick one
        target_show = results[0]

    print(f"\nSelected Show: {target_show['title']} ({target_show['url']})")
    
    print("Fetching details...")
    details = scraper.get_show_details(target_show['url'])
    
    if not details:
        print("Failed to get details.")
        return

    print(f"Found {len(details.get('seasons', []))} seasons.")
    
    target_season = None
    # Look for Season 4 or Final Season
    for s in details.get('seasons', []):
        label = s.get('display_label', '')
        print(f"Checking season: {label} ({s['url']})")
        if '4' in label or 'Final' in label or 'Season 4' in label:
            target_season = s
            # Don't break immediately, maybe prefer "Part 1" if available or just the main one
            # The user asked for "AoT Season 4". The Final Season is Season 4.
            # Let's pick the last one found that matches, typically latest part? 
            # Or just the first one matching "Season 4" logic.
            # Let's break on first match for simplicity of testing "a" season.
            break
            
    if not target_season:
        print("Season 4 not found explicitly. Using first season found.")
        target_season = details['seasons'][0]
        
    print(f"\nFetching episodes for: {target_season['display_label']}")
    episodes = scraper.fetch_season_episodes(target_season)
    
    print(f"Found {len(episodes)} episodes.")
    
    if len(episodes) > 0:
        print("First 3 episodes:")
        for ep in episodes[:3]:
            print(f"- {ep['display_number']}: {ep['title']} ({ep['url']})")
        
        # Dump to JSON as requested
        filename = "aot_season_4_episodes.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(episodes, f, ensure_ascii=False, indent=2)
        print(f"\nSaved full episode list to {filename}")
    else:
        print("CRITICAL: No episodes found!")
        # If no episodes, we need to inspect the HTML of the season page or list page
        # meaningful logic here.

if __name__ == "__main__":
    debug_aot_extraction()
