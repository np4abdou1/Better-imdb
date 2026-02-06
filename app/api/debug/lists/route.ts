import { auth } from '@/auth';
import { getUserLists, getUserRatings } from '@/lib/ai-tools';

export async function GET(request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const [lists, ratings] = await Promise.all([
      getUserLists(session.user.id),
      getUserRatings(session.user.id)
    ]);

    return new Response(
      JSON.stringify({
        userId: session.user.id,
        userEmail: session.user.email,
        userName: session.user.name,
        lists,
        listsCount: lists.length,
        totalListItems: lists.reduce((sum, l) => sum + (l.count || 0), 0),
        ratings: ratings.length,
        listDetails: lists.map(l => ({
          id: l.id,
          name: l.name,
          count: l.count
        }))
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Debug lists error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
