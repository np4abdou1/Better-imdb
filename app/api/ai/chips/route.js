import { NextResponse } from 'next/server';

const COPILOT_API_URL = process.env.COPILOT_API_URL || 'http://localhost:4141';

export async function GET() {
  try {
    const prompt = 'Generate 4 short example user questions for a movie/TV recommendation assistant. These should be natural user questions like "Find sci-fi movies from 2020s" or "Recommend comedy shows". Keep them under 5 words each. Return ONLY a JSON array of strings.';

    const response = await fetch(`${COPILOT_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.8
      })
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
