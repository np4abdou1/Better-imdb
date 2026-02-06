
import sys
import os

# Add current directory to path so we can import modules
sys.path.append(os.getcwd())

from cenima.scraper import TopCinemaScraper
import json

def test_search(query):
    print(f"--- Testing Search: {query} ---")
    scraper = TopCinemaScraper()
    results = scraper.search(query)
    print(f"Found {len(results)} results:")
    for r in results:
        print(f" - {r['title']} ({r['type']}) -> {r['url']}")
    return results

def test_breaking_bad_details():
    print("\n--- Testing Breaking Bad Details ---")
    scraper = TopCinemaScraper()
    # Using the url found in logs
    url = "https://topcinema.rip/series/مسلسل-breaking-bad-مترجم/"
    details = scraper.get_series_details(url)
    if not details:
        print("Failed to get details")
        return

    print(f"Got details for: {details.get('title')}")
    if details.get('seasons'):
        s1 = details['seasons'][0]
        print(f"Season 1 has {len(s1.get('episodes', []))} episodes (pre-fetch)")
        
        # Fetch episodes properly
        episodes = scraper.fetch_season_episodes(s1)
        print(f"Season 1 fetched {len(episodes)} episodes")
        
        if episodes:
            ep1 = episodes[0]
            print(f"Testing Episode 1: {ep1['title']} - {ep1['url']}")
            
            servers = scraper.fetch_episode_servers(ep1)
            print(f"Found {len(servers)} servers")
            for s in servers:
                print(f" - {s['name']}: {s.get('video_url', 'No Video URL')}")

if __name__ == "__main__":
    test_search("Jujutsu Kaisen")
    test_breaking_bad_details()
