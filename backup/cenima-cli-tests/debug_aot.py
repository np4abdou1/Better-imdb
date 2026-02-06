from cenima.scraper import TopCinemaScraper
import json

scraper = TopCinemaScraper()
print("Searching for 'Attack on Titan'...")
results = scraper.search("Attack on Titan")
print(json.dumps(results, indent=2, ensure_ascii=False))

print("\nSearching for 'Shingeki no Kyojin'...")
results = scraper.search("Shingeki no Kyojin")
print(json.dumps(results, indent=2, ensure_ascii=False))

print("\nSearching for 'Attack on Titan' with type='series'...")
results = scraper.search("Attack on Titan", content_type="series")
print(json.dumps(results, indent=2, ensure_ascii=False))
