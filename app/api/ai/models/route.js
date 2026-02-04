import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch available AI models from Copilot API
    const copilotApiUrl = process.env.COPILOT_API_URL || 'http://localhost:4141';
    const response = await fetch(`${copilotApiUrl}/v1/models`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Copilot API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Transform models to expected format and deduplicate by model ID
    const seenIds = new Set();
    const models = Array.isArray(data?.data)
      ? data.data
          .filter(model => {
            if (seenIds.has(model.id)) {
              return false;
            }
            seenIds.add(model.id);
            return true;
          })
          .map(model => ({
            id: model.id,
            name: model.display_name || model.id
          }))
      : [];

    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching AI models:', error);
    // Fallback to basic models if copilot-api is unavailable
    const fallbackModels = [
      { id: 'gpt-5-mini', name: 'GPT-5 mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4', name: 'GPT-4' },
    ];
    return NextResponse.json(fallbackModels);
  }
}
