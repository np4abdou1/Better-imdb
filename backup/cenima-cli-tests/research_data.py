#!/usr/bin/env python3
import sys
import os
import json
import time

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from cenima.scraper import TopCinemaScraper

def main():
    scraper = TopCinemaScraper()
    
    queries = {
        "Anime": ["Attack on Titan", "One Piece", "Jujutsu Kaisen", "Demon Slayer", "Naruto Shippuden", "Bleach"],
        "Series": ["Breaking Bad", "Stranger Things", "The Witcher", "Game of Thrones", "Avatar: The Last Airbender"],
        "Movies": ["Inception", "The Dark Knight", "Your Name", "Spirited Away"]
    }

    # For deep inspection of specific persistent issues
    deep_inspect = ["Attack on Titan", "One Piece"]

    results_log = {}

    for category, titles in queries.items():
        results_log[category] = {}
        for title in titles:
            print(f"Searching for {category}: {title}...")
            search_results = scraper.search(title)
            
            # Filter and simplify search results for log
            cleaned_results = []
            for res in search_results:
                cleaned_results.append({
                    "title": res.get("title"),
                    "url": res.get("url"),
                    "type": res.get("type"),
                    "metadata": res.get("metadata")
                })
            
            results_log[category][title] = {
                "search_results": cleaned_results,
                "details": []
            }

            # If it's a deep inspect title, or just the first result for others
            targets = search_results if title in deep_inspect else (search_results[:1] if search_results else [])
            
            for target in targets:
                print(f"  Fetching details for: {target.get('title')} ({target.get('url')})")
                try:
                    details = scraper.get_show_details(target.get("url"))
                    if details:
                        # Simplify details for log - focus on seasons/episodes structure
                        simple_details = {
                            "title": details.get("title"),
                            "url": details.get("url"),
                            "type": details.get("type"),
                        }
                        
                        if "seasons" in details:
                            simple_details["seasons"] = []
                            for season in details["seasons"]:
                                simple_details["seasons"].append({
                                    "title": season.get("title"),
                                    "slug": season.get("slug"), # Usually holds the part/season info
                                    "episodes_count": len(season.get("episodes", [])),
                                    # store first few and last few episodes to check gaps
                                    "episode_samples": [e.get("title") for e in season.get("episodes", [])[:3]] + [e.get("title") for e in season.get("episodes", [])[-3:]] if season.get("episodes") else []
                                })
                        
                        if "episodes" in details and "seasons" not in details: # Flat movie or single season
                             simple_details["single_season_episodes_count"] = len(details.get("episodes", []))

                        results_log[category][title]["details"].append(simple_details)
                    time.sleep(1) # Be polite
                except Exception as e:
                    print(f"  Error fetching details: {e}")

    # Output full JSON to file for analysis
    with open("research_output.json", "w", encoding="utf-8") as f:
        json.dump(results_log, f, indent=2, ensure_ascii=False)
    
    print("Research complete. Data saved to research_output.json")

if __name__ == "__main__":
    main()
