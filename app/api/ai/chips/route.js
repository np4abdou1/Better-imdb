import { NextResponse } from 'next/server';
import { createChatCompletions, hasGitHubToken } from '@/lib/copilot-client';

export async function GET() {
  // If no GitHub token configured, return empty chips (no error logging)
  if (!hasGitHubToken()) {
    return NextResponse.json({ chips: [] }, { status: 200 });
  }

  try {
    const prompt = 'Generate 4 short example user questions for a movie/TV recommendation assistant. These should be natural user questions like "Find sci-fi movies from 2020s" or "Recommend comedy shows". Keep them under 5 words each. Return ONLY a JSON array of strings.';

    const response = await createChatCompletions({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60,
      temperature: 0.8,
      stream: false
    });

    if (!response.ok) {
      return NextResponse.json({ chips: [] }, { status: 200 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : [];
    const chips = Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string').slice(0, 4)
      : [];

    return NextResponse.json({ chips }, { status: 200 });
  } catch (error) {
    console.error('Error fetching AI chips:', error);
    return NextResponse.json({ chips: [] }, { status: 200 });
  }
}
