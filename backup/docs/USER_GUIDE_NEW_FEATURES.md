# User Guide - New Features Quick Reference

## 🎯 Quick Navigation

1. [Quick Add Button](#quick-add-button) - Add titles to lists instantly
2. [Bulk Selection Mode](#bulk-selection-mode) - Multi-select and batch operations
3. [Updated Navigation](#updated-navigation) - New icons for better clarity
4. [AI Improvements](#ai-improvements) - Faster, smoother experience

---

## Quick Add Button

### What is it?
A floating '+' button that appears when you hover over any movie/show card, allowing you to instantly add it to your lists.

### How to Use

1. **Hover over any movie/show card**
   ```
   ┌──────────────────┐
   │                  │
   │   [Movie Poster] │──→ Notice '+' appears in top-right
   │                  │
   │    The Matrix    │
   └──────────────────┘
   ```

2. **Click the '+' button**
   ```
   ┌──────────────────┐
   │  [+] button      │
   │    appears       │
   │                  │
   │    The Matrix    │
   └──────────────────┘
   ```

3. **Select a list from dropdown**
   ```
   ┌──────────────────┐
   │  Add to list ▼   │
   │  ├─ Watched      │ ← Click
   │  ├─ To Watch     │
   │  ├─ Watching     │
   │  └─ Favorites    │
   │                  │
   │    The Matrix    │
   └──────────────────┘
   ```

4. **See success feedback**
   ```
   ┌──────────────────┐
   │  [✓] button      │ ← Green checkmark
   │    turns green   │    for 1.5 seconds
   │                  │
   │    The Matrix    │
   └──────────────────┘
   ```

### Features
- ✅ Works only when logged in
- ✅ Shows all your lists (default + custom)
- ✅ Handles duplicates gracefully
- ✅ Visual feedback (loading → success)
- ✅ Auto-closes after adding

### Related Actions
- Quick add doesn't affect other ratings/reviews
- Duplicate additions show as "already in list"
- Can add same title to multiple lists

---

## Bulk Selection Mode

### What is it?
A powerful feature that lets you select multiple titles at once and perform batch operations (like adding 50 movies to a list in one action).

### How to Activate

1. **In search results, look for "Select" button** (top-left, next to results count)
   ```
   Found 247 results for "sci-fi"    [Select] [Filters]
   ```

2. **Click "Select" to enable selection mode**
   ```
   Found 247 results for "sci-fi"    [Cancel] [Filters]
   Checkboxes now appear on all cards:

   ☐ Movie 1    ☐ Movie 2    ☐ Movie 3
   ☐ Movie 4    ☐ Movie 5    ☐ Movie 6
   ```

### Making Selections

**Option 1: Click individual checkboxes**
```
☐ Movie 1
☑ Movie 2    ← Click to select/deselect
☐ Movie 3
```

**Option 2: Use bulk action bar**
```
3 selected          [Select All] [Deselect All] [Add to List ▼]
```

### Performing Bulk Actions

1. **Select items** (at least 1 required)
   ```
   ☑ Movie 1
   ☑ Movie 2
   ☑ Movie 3
   ```

2. **Click "Add to List" button**
   ```
   3 selected    [Select All] [Deselect All] [Add to List ▼]
                                                    ↓
                                              Opens dropdown
   ```

3. **Choose target list**
   ```
   Add 3 items to list ▼
   ├─ Watched
   ├─ To Watch      ← Click
   ├─ Watching
   └─ Favorites
   ```

4. **See summary**
   ```
   "Added 3 of 3 items to To Watch"
   
   Mode exits, selections clear
   ```

### Example Workflows

**Scenario 1: Add 25 movies to a list**
```
1. Search "2024 Oscar nominees"
2. Results: 50 movies
3. Click [Select]
4. Click [Select All]
5. All 50 checkboxes checked ✅
6. Click [Add to List] → Favorites
7. Done! All added in seconds
```

**Scenario 2: Curate top 10 from 200 results**
```
1. Filter results (Genre: Drama, Year: 2020-2024)
2. Click [Select]
3. Manually click 10 movies to select
4. Click [Add to List] → Favorites
5. Done! Your top 10 is saved
```

### Tips & Tricks

- ⏱️ **Fast filtering:** Use filters first, then bulk select from refined results
- 🔄 **Change your mind:** Click "Cancel" to exit without saving selections
- ⚡ **Keyboard friendly:** Tab between buttons for accessibility
- 📱 **Mobile friendly:** Checkboxes are touch-optimized

---

## Updated Navigation

### New Icons You'll Notice

#### 🎇 Anime Icon Changes
**Before:** Generic TV icon  
**After:** Sparkles icon ✨

- More visually distinctive
- Clearly indicates anime section
- Better visual hierarchy

#### 🪄 AI Assistant Icon Changes
**Before:** Generic robot icon  
**After:** Magic wand icon 🪄

- More modern and professional
- Suggests AI's powerful capabilities
- Better matches product identity

### How They Look

```
Bottom Navigation Bar:
┌─────────────────────────────────────────────┐
│  [🏠] [📈] [🎬] [✨] [👥] [🪄] [👤]        │
│  Home  Trending  Top  Anime  People  AI  Profile
└─────────────────────────────────────────────┘
```

---

## AI Improvements

### Faster Chip Loading
Previously, suggestion chips would take time to load. Now they appear instantly when you visit the AI page.

**Before:**
```
Loading... ⏳
(Wait for API)
[Chip 1] [Chip 2] [Chip 3] [Chip 4]
```

**After:**
```
[Chip 1] [Chip 2] [Chip 3] [Chip 4]
⬆️ Instantly visible! (Updates if fresh suggestions arrive)
```

### Better Suggestions
If you have a GitHub token configured, the AI will fetch personalized suggestions. Otherwise, it uses smart defaults.

---

## Common Questions

### Q: Can I select items outside search results?
**A:** Select mode is available on the home/search page. For other pages, use the quick '+' button on each card.

### Q: What if I add a duplicate item?
**A:** The system prevents duplicates. If you try to add an item already in a list, it shows as "already added" without error.

### Q: Does bulk add work for large batches?
**A:** Yes! You can select 50 items and add them all. The system handles throttling internally.

### Q: Will my selections save if I refresh?
**A:** No, selections are temporary. The added items stay in your lists, but selection state resets on page reload.

### Q: Can I add to custom lists?
**A:** Absolutely! Any list you create appears in both quick add and bulk add dropdowns.

### Q: What's the keyboard shortcut for select mode?
**A:** Currently, use the mouse/touch. Keyboard shortcuts may come in future updates!

---

## Troubleshooting

### Quick Add Button Not Appearing
- ❌ Are you logged in? You need to be logged in to see it.
- ❌ Are you hovering on a card? Hover over a movie/show card.
- ❌ Is JavaScript enabled? Check your browser settings.

**Solution:** Log in, refresh, and hover over any card.

### Bulk Selection Not Working
- ❌ Are there results? Need at least 1 result to enable Select mode.
- ❌ Are you logged in? Also requires authentication.
- ❌ Is the button visible? It appears next to the filters button.

**Solution:** Log in, search for something, then look for the [Select] button.

### Items Not Adding to List
- ❌ Check your internet connection
- ❌ Verify the list still exists
- ❌ Try logging out and back in

**Solution:** Try again or contact support if issue persists.

---

## Feature Roadmap

### Coming Soon 🔮
- [ ] Drag & drop between lists
- [ ] Keyboard shortcuts for power users
- [ ] Undo/redo for bulk operations
- [ ] Export selections to CSV
- [ ] Collaborative lists with friends
- [ ] Save searching preferences

---

## Need Help?

1. **How do I create a new list?** → Go to Profile → Lists section
2. **Can I edit list names?** → Yes, click the list name in Profile
3. **How do I delete a list?** → Go to Profile, click delete on the list
4. **What are default lists?** → Watched, Watching, To Watch, Favorites (auto-created)

---

## Feedback

Found a bug or have a suggestion? Let us know!
- 📧 Email: support@watcharr.local
- 🐛 Bug reports: Click the help icon on any page
- 💡 Feature requests: Feedback button in Profile

---

**Last Updated:** February 5, 2026  
**Version:** 0.2.0  
Happy browsing! 🍿
