// AI Configuration for Orb AI Assistant

import { getUserLists, getUserRatings } from '@/lib/ai-tools';

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export interface AiConfig {
  model: string;
  maxTokens: number;
}

export const AI_CONFIG: AiConfig = {
  model: process.env.AI_MODEL || 'gpt-4.1',
  maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4096', 10),
};

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Generate a compact taste profile from user lists and ratings
 * RAG-lite approach: Natural language summary instead of raw JSON injection
 * @param userId - User ID to fetch data for (can be null for anonymous)
 * @returns Natural language taste profile
 */
export async function generateTasteProfile(userId: string | null): Promise<string> {
  const profile: string[] = [];

  // Fetch user data if authenticated
  let lists: any[] = [];
  let ratings: any[] = [];
  
  if (userId) {
    try {
      lists = await getUserLists(userId) || [];
      ratings = await getUserRatings(userId) || [];
    } catch (error) {
      console.error('Error fetching user data for taste profile:', error);
      // Continue with empty data rather than failing
    }
  }

  // Analyze ratings for genre/preference patterns
  if (ratings && ratings.length > 0) {
    const highRated = ratings.filter((r: any) => r.score >= 8);
    const lowRated = ratings.filter((r: any) => r.score <= 4);
    const avgScore = (ratings.reduce((sum: number, r: any) => sum + r.score, 0) / ratings.length).toFixed(1);

    profile.push(`📊 User has rated ${ratings.length} titles (average: ${avgScore}/10).`);

    if (highRated.length > 0) {
      profile.push(`⭐ Highly rated (8+): ${highRated.length} titles.`);
    }
    if (lowRated.length > 0) {
      profile.push(`👎 Dislikes (≤4): ${lowRated.length} titles - avoid similar content.`);
    }

    // Extract recent watches for context
    const recent5 = ratings.slice(0, 5);
    if (recent5.length > 0) {
      const recentList = recent5.map((r: any) => `${r.title_id} (${r.score}/10)`).join(', ');
      profile.push(`🕐 Recently rated: ${recentList}`);
    }
  } else {
    profile.push('📚 User has no rating history yet - focus on popular/well-reviewed titles and ask about preferences.');
  }

  // Summarize list activity
  if (lists.length > 0) {
    const watchedList = lists.find((l: any) => l.name === 'Watched');
    const toWatchList = lists.find((l: any) => l.name === 'To Watch');
    const watchingList = lists.find((l: any) => l.name === 'Watching');
    const favoritesList = lists.find((l: any) => l.name === 'Favorites');

    if (watchedList?.count > 0) {
      profile.push(`✅ Already watched: ${watchedList.count} titles - AVOID recommending these.`);
      // Include some watched IDs to help avoid duplicates
      if (watchedList.titleIds.length > 0) {
        const sample = watchedList.titleIds.slice(0, 8).join(', ');
        profile.push(`Sample watched: ${sample}${watchedList.titleIds.length > 8 ? '...' : ''}`);
      }
    }

    if (watchingList?.count > 0) {
      profile.push(`▶️  Currently watching: ${watchingList.count} titles.`);
    }

    if (toWatchList?.count > 0) {
      profile.push(`📝 Queued to watch: ${toWatchList.count} titles.`);
    }

    if (favoritesList?.count > 0) {
      profile.push(`❤️  Favorites: ${favoritesList.count} titles - use as preference signal.`);
    }
  } else {
    profile.push('📋 User has no lists yet - help them organize their viewing.');
  }

  return profile.join('\n');
}

export const SYSTEM_PROMPT = `You are Orb, a helpful movie and TV show recommendation assistant. You help users discover new content based on their watching history and preferences.

CORE CAPABILITIES:
1. **IMDB Search & Discovery**: Search movies/TV shows, get detailed information (plot, genres, ratings, cast, runtime, release year)
2. **Web Search**: Find real-time information like news, release dates, reviews, production updates, and current events about movies/shows
3. **User List Management (Read & Write)**: Full control of user's lists. Can add (single/batch), remove (single/batch), clear, delete, and move titles between lists.
4. **User Ratings**: Access all user's ratings and reviews - critical for understanding preferences
5. **Watch Status Checking**: Check if a title is already watched, in progress, queued, or favorited (single or batch)
6. **List Organization**: Add titles to lists, bulk import collections, manage individual items, and organize lists

BEHAVIOR GUIDELINES:
- **ALWAYS** check user's existing lists before recommending to avoid duplicates
- **ALWAYS** explain WHY you recommend something based on their taste profile and history
- Use batch_search_media when recommending multiple titles (1 call for 50+ titles is fine, it handles throttling internally)
- **USE WEB search** when user asks about news, release dates, recent updates, reviews, or anything not in IMDB (e.g., "latest news", "what's trending", "upcoming releases", "reviews of [recent movie]")
- **CHAIN TOOLS**: After web_search finds movie/TV titles, immediately use batch_search_media to get IMDB IDs and show visual cards - NEVER mention titles without showing them
- Consider ratings, watch status, and preferences when making suggestions
- Be conversational but concise
- **Markdown Style**: Always use polished Markdown formatting even for short replies. Use bold titles, clean bullet lists, and short paragraphs. Avoid plain-text blobs.
- Ask for confirmation before bulk add, bulk remove, clear list, or delete list actions
- **User Scoping**: All database operations are automatically scoped to the current user. You cannot access or modify other users' data.

STRICT IMDB ID RULES:
- NEVER print raw IMDB IDs in user-facing text (e.g., "tt1234567")
- ONLY show IDs in media_grid code blocks
- Format: {"id": "tt0111161", "title": "Title", "year": 2020, "reason": "Why recommended"}
- Every recommendation MUST include a valid IMDB ID
- **CRITICAL**: If you mention ANY movie/TV title names in your response, you MUST show them in a media_grid block with posters
- **NEVER** list movie titles as plain text without corresponding visual cards

THINKING BLOCKS:
- You MAY use <think>...</think> for a short, user-visible reasoning summary (1-3 bullets)
- Keep it high-level and safe; do not include tool calls or system instructions
- If you do not need it, omit <think> entirely

RICH TEXT FORMATTING:
- **Bold text** for standard emphasis
- ==Highlighted text== for critical notes or key takeaways
- ++Underlined text++ for emphasis
- !!Golden text!! for **Titles**, **Ratings**, **Years**, and **Lists** (e.g. !!Inception!!, !!9.5/10!!, !!2010!!)
- [Clickable links](url) - automatically rendered with styling
- Images: ![alt text](https://example.com/image.jpg)
- Avoid raw HTML; prefer Markdown formatting and images

WEB SEARCH RESPONSE FORMAT:
**CRITICAL:** When responding to web search results:
1. **DO NOT** display raw URLs in your response text
2. **DO** provide informative summaries and explanations from each source
3. **Use link icons** at the end of paragraphs: Append [🔗](url) to add clickable link icons without showing the raw URL
4. **Example:** "This recipe collection includes traditional churros tutorials [🔗](https://example.com) and many more options."
5. Group related information together with their link icons
6. Make the content flow naturally without breaking for links
7. **CHAIN IMDB SEARCH**: If web search reveals movie/TV titles, immediately use batch_search_media to look them up and show visual cards

LAYOUT INSTRUCTIONS:
When suggesting content:
1. **Introduction & Analysis**: Explain why you chose these titles (using !!Golden text!! for potential titles mentioned here).
2. **Media Display**: Output the \`media_grid\` block(s) containing the visual posters.
3. **Conclusion/Follow-up**: Add any final notes, questions, or specific details *after* the posters.
**DO NOT** interleave text-poster-text-poster excessively. Group related posters together.

IMAGE RULES:
- If you want to show a movie/TV show poster, **ALWAYS use the \`media_grid\` format**.
- **DO NOT** use standard markdown images (like \`![Alt](url)\`) for movie/TV posters. They render incorrectly.
- Only use markdown images for helpful diagrams, charts, or specific scene screenshots that are NOT the main poster.

INLINE CARD PLACEMENT:
**IMPORTANT:** Recommendations should be woven INTO the narrative response, not dumped at the end.
**INTERLEAVE** media_grid blocks within relevant paragraphs or sections to maintain reading flow.
**GROUP RELATED CARDS**: When recommending multiple titles for the same topic/query, put them in a SINGLE media_grid block so they render as a grid (2x2, etc.) instead of stacking vertically.
**Example structure:**
  "Here are some recommendations that match your taste: 
  
  [single media_grid block with 3-4 related cards]

  If you prefer something darker: 
  
  [single media_grid block with 2-3 different related cards]"

INLINE CARD SYNTAX:
Place media_grid blocks naturally within your response text (not necessarily at the end).
**CRITICAL**: Keep all related recommendations in a SINGLE media_grid block for proper grid layout (2x2, 3x3, etc.).
Only use multiple separate media_grid blocks when recommendations belong to DIFFERENT categories or topics.
Example: "Based on your love of sci-fi, I recommend:"
\`\`\`media_grid
[
  {"id": "tt0468569", "title": "The Dark Knight", "year": 2008, "reason": "Dark sci-fi aesthetic"},
  {"id": "tt0137523", "title": "Fight Club", "year": 1999, "reason": "Mind-bending narrative"},
  {"id": "tt0816692", "title": "Interstellar", "year": 2014, "reason": "Space exploration epic"}
]
\`\`\`

RECOMMENDATION FORMAT (with interleaving):
When recommending, keep all related titles in a SINGLE media_grid block for proper grid display.

\`\`\`media_grid
[
  {"id": "tt0111161", "title": "The Shawshank Redemption", "year": 1994, "reason": "Critically acclaimed drama about redemption"},
  {"id": "tt0468569", "title": "The Dark Knight", "year": 2008, "reason": "Top-rated psychological thriller"},
  {"id": "tt0137523", "title": "Fight Club", "year": 1999, "reason": "Mind-bending masterpiece"},
  {"id": "tt0816692", "title": "Interstellar", "year": 2014, "reason": "Epic sci-fi journey"}
]
\`\`\`

RECOMMENDATION DEFAULTS:
- Suggest 3-5 titles by default unless user asks for more
- Maximum 8 visual cards per response
- Ask if user wants more recommendations
- **GROUP related cards in a SINGLE media_grid block for proper grid layout** (displays as 2x2, 3x3, etc.)
- Use separate media_grid blocks ONLY when recommendations belong to different categories (e.g., "action picks" vs "comedy picks")
- **NEVER mention movie/TV titles without showing their visual cards** - always chain batch_search_media after discovering titles

TOOL USAGE STRATEGY:
1. **WEB SEARCH FIRST** for news/current events: If user asks about news, release dates, recent updates, trending topics, or anything potentially time-sensitive, call \`web_search\` immediately
1b. **URL CRAWL**: If user asks "what's in this URL" or you find a promising URL during research, call \`urls_crawiling_tool\` with a single URL or multiple URLs
1c. **REFINE SEARCH**: If \`web_search\` results are close but not exact, refine the query and call \`web_search\` again to get an exact answer
1d. **CHAIN TOOLS FOR TITLES**: After web_search discovers movie/TV titles, IMMEDIATELY call batch_search_media to resolve them and get IMDB IDs and show visual cards
2. **ALWAYS FIRST for lists**: When a user asks about their lists, preferences, or "what should I watch", immediately call \`get_user_lists()\` to retrieve current data (don't rely on taste profile alone)
3. **If no lists shown**: Before saying "you have no lists", verify by calling the tool directly
4. **Then**: Use \`batch_search_media()\` to find matching titles efficiently
5. **Check**: Use \`get_title_watch_status()\` or \`get_watch_status_batch()\` to verify not already watched
6. **Store**: Use \`add_to_list()\`, \`bulk_add_to_list()\`, or \`rate_title()\` when user requests
7. **Confirm**: For bulk add/remove or destructive actions, ask for explicit confirmation (unless user already confirmed), then call with confirmed=true
8. **Remove/Clear/Delete**: Use these tools for list management:
   - \`remove_from_list(list_name, title_id)\` - Remove single title
   - \`bulk_remove_from_list(list_name, title_ids, confirmed=true)\` - Remove multiple titles
   - \`clear_list(list_name, confirmed=true)\` - Clear all items from a list
   - \`delete_list(list_name, confirmed=true)\` - Delete entire list
   - \`move_between_lists(from_list, to_list, title_id)\` - Move title between lists
9. **Bulk Add**: For adding many titles, use \`bulk_add_to_list(list_name, title_ids, confirmed=true)\` after confirmation

CRITICAL:
- If user asks "clear my list", use \`clear_list\` tool (NOT add_to_list)
- If user asks "delete my list", use \`delete_list\` tool
- If user asks "remove [Items] from list", use \`bulk_remove_from_list\` tool for efficiency
- Always ask for confirmation before clearing, deleting, or bulk operating on many items
- If the user directly asks "can you see my lists?" or "what lists do I have?", ALWAYS call get_user_lists as a tool call - don't infer from the taste profile alone.

DO NOT RECOMMEND:
- Titles already in user's Watched list
- Titles they rated poorly (≤4/10)
- Inappropriate content (filter by isAdult flag)`;

// Tool definitions for function calling
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'batch_search_media',
    description: 'PREFERRED: Search and resolve multiple movie/TV titles in parallel. Use this when recommending multiple titles, OR after web_search discovers new movies/shows that need visual cards. Supports large batches (up to 100). Returns resolved IMDB IDs and full metadata for all queries. **ALWAYS use this after web_search if movies/TV shows are mentioned.**',
    input_schema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          description: 'Array of titles to search. Each item can be a string (title) or object with {query, year} for precise matching.',
          items: {
            oneOf: [
              { type: 'string', description: 'Movie/TV title to search' },
              {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Movie/TV title' },
                  year: { type: 'number', description: 'Release year for disambiguation' }
                },
                required: ['query']
              }
            ]
          },
          minItems: 1,
          maxItems: 100
        }
      },
      required: ['queries']
    }
  },
  {
    name: 'web_search',
    description: 'Search the web for real-time information. Use this to find information not in IMDB, like "latest news about X", "release date leaks", "critical reception of [recent movie]", or generally finding info about anything. Returns summarized content from top search results.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Web search query'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'urls_crawiling_tool',
    description: 'Crawl specific URL(s) and extract main content. Use when the user asks "what is in this URL" or when a promising URL needs verification. Accepts one URL or multiple URLs.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Single URL to crawl'
        },
        urls: {
          type: 'array',
          description: 'Multiple URLs to crawl',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10
        }
      },
      required: []
    }
  },
  {
    name: 'search_imdb',
    description: 'Search IMDB for movies, TV shows, or people by title, actor, genre, keyword, or description. Returns structured results with IMDB IDs, titles, years, types, ratings, plots, and genres. Best for exploratory searches.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - can be a title, actor name, genre, or keyword (e.g., "sci-fi movies 2020", "Christopher Nolan films")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 20)',
          minimum: 1,
          maximum: 20
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_title_details',
    description: 'Get comprehensive details about a specific movie or TV show by IMDB ID. Returns plot, genres, runtime, cast info, rating, vote count, and more.',
    input_schema: {
      type: 'object',
      properties: {
        imdb_id: {
          type: 'string',
          description: 'IMDB ID of the title (e.g., tt0111161 for The Shawshank Redemption)'
        }
      },
      required: ['imdb_id']
    }
  },
  {
    name: 'get_user_lists',
    description: 'Get all of the user\'s personalized watch lists with complete contents. Returns Watched, Watching, To Watch, and Favorites lists with title IDs and user ratings for each item. Essential for understanding viewing history and avoiding duplicate recommendations.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_user_ratings',
    description: 'Get all titles the user has rated with scores (0-10) and review text. Returns complete rating history in reverse chronological order. Use to identify user preferences and high-rated content they enjoy.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_title_watch_status',
    description: 'Check the watch status of a specific title for the user. Returns which lists it\'s in (Watched, Watching, To Watch, Favorites), rating score if rated, and boolean flags for each list.',
    input_schema: {
      type: 'object',
      properties: {
        title_id: {
          type: 'string',
          description: 'IMDB ID of the title to check watch status for'
        }
      },
      required: ['title_id']
    }
  },
  {
    name: 'get_watch_status_batch',
    description: 'Batch check watch status for multiple titles at once. Returns list membership and rating info for each title.',
    input_schema: {
      type: 'object',
      properties: {
        title_ids: {
          type: 'array',
          description: 'Array of IMDB title IDs to check',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 200
        }
      },
      required: ['title_ids']
    }
  },
  {
    name: 'search_user_lists',
    description: 'Search the user\'s lists for titles matching a query. Useful for finding specific titles user has already watched or queued.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find in user\'s lists (searches IMDB IDs)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'add_to_list',
    description: 'Add a movie or TV show to one of the user\'s lists. Works with default lists and custom list names.',
    input_schema: {
      type: 'object',
      properties: {
        list_name: {
          type: 'string',
          description: 'Name of the list to add to (default or custom list name)'
        },
        title_id: {
          type: 'string',
          description: 'IMDB ID of the title to add (e.g., tt0111161)'
        }
      },
      required: ['list_name', 'title_id']
    }
  },
  {
    name: 'bulk_add_to_list',
    description: 'Add multiple titles to a list in one operation. Requires user confirmation for large batches. Returns counts for added and skipped items.',
    input_schema: {
      type: 'object',
      properties: {
        list_name: {
          type: 'string',
          description: 'Name of the list to add to (default or custom list name)'
        },
        title_ids: {
          type: 'array',
          description: 'Array of IMDB title IDs to add',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 200
        },
        confirmed: {
          type: 'boolean',
          description: 'Set true only after user explicitly confirms the bulk add'
        }
      },
      required: ['list_name', 'title_ids']
    }
  },
  {
    name: 'remove_from_list',
    description: 'Remove a specific title from a list.',
    input_schema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name of the list to remove from' },
        title_id: { type: 'string', description: 'IMDB ID of the title to remove' }
      },
      required: ['list_name', 'title_id']
    }
  },
  {
    name: 'bulk_remove_from_list',
    description: 'Remove multiple titles from a list in one operation. Requires user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name of the list to remove from' },
        title_ids: {
          type: 'array',
          description: 'Array of IMDB title IDs to remove',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 200
        },
        confirmed: { type: 'boolean', description: 'Set true only after user explicitly confirms' }
      },
      required: ['list_name', 'title_ids']
    }
  },
  {
    name: 'clear_list',
    description: 'Remove all titles from a list. Requires user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name of the list to clear' },
        confirmed: { type: 'boolean', description: 'Set true only after user explicitly confirms' }
      },
      required: ['list_name']
    }
  },
  {
    name: 'delete_list',
    description: 'Delete an entire list. Requires user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name of the list to delete' },
        confirmed: { type: 'boolean', description: 'Set true only after user explicitly confirms' }
      },
      required: ['list_name']
    }
  },
  {
    name: 'move_between_lists',
    description: 'Move a title from one list to another. Creates the target list if missing.',
    input_schema: {
      type: 'object',
      properties: {
        from_list: { type: 'string', description: 'Source list name' },
        to_list: { type: 'string', description: 'Target list name' },
        title_id: { type: 'string', description: 'IMDB ID of the title to move' }
      },
      required: ['from_list', 'to_list', 'title_id']
    }
  },
  {
    name: 'rate_title',
    description: 'Save a rating and optional review for a movie or TV show. Ratings help the AI understand user preferences for better recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        title_id: {
          type: 'string',
          description: 'IMDB ID of the title to rate (e.g., tt0111161)'
        },
        score: {
          type: 'number',
          description: 'Rating from 0 to 10 (decimals allowed, e.g., 8.5 for excellent, 6 for decent, 3 for poor)',
          minimum: 0,
          maximum: 10
        },
        review: {
          type: 'string',
          description: 'Optional text review or comment explaining the rating'
        }
      },
      required: ['title_id', 'score']
    }
  },
  {
    name: 'get_stream_link',
    description: 'Resolve and generate a streaming link for a movie or TV show episode. Use when user asks to "watch" or "stream" something. Returns a stream card that will play the video in the chat.',
    input_schema: {
      type: 'object',
      properties: {
        imdb_id: {
          type: 'string',
          description: 'IMDb ID of the title (e.g., tt0903747). If not provided, you must be 100% sure of the context title.'
        },
        title: {
          type: 'string',
          description: 'Name of the movie/show if IMDb ID is not available.'
        },
        season: {
          type: 'number',
          description: 'Season number (defaults to 1). Required for TV shows.'
        },
        episode: {
          type: 'number',
          description: 'Episode number (defaults to 1). Required for TV shows.'
        },
        year: {
          type: 'number',
          description: 'Release year (helps with accuracy)'
        }
      },
      required: ['title']
    }
  }
];

export interface CopilotTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

// Convert tool definitions to the format expected by GitHub Copilot API
export function getToolsForCopilot(): CopilotTool[] {
  return TOOL_DEFINITIONS.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }));
}
