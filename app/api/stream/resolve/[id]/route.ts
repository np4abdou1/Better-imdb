import { resolveStreamForImdbId } from '@/lib/stream-service';

export async function GET(request, props) {
  const params = await props.params;
  const { id } = params;
  const searchParams = request.nextUrl.searchParams;
  const season = searchParams.get('season') || 1;
  const episode = searchParams.get('episode') || 1;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const streamData = await resolveStreamForImdbId(id, season, episode, (message) => {
          send({ type: 'log', message });
        });

        if (!streamData) {
          send({ type: 'error', message: 'Stream not found' });
          controller.close();
          return;
        }

        send({ type: 'resolved' });
      } catch (error) {
        send({
          type: 'error',
          message: error?.message || 'Stream resolve failed'
        });
      } finally {
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('Error closing resolve stream:', err);
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
