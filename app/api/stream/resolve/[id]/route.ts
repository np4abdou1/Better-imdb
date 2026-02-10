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
      let closed = false;

      const send = (payload) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const closeStream = () => {
        if (closed) return;
        closed = true;
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          console.error('Error sending stream done:', err);
        }
        try {
          controller.close();
        } catch (err) {
          console.error('Error closing resolve stream:', err);
        }
      };

      try {
        const streamData = await resolveStreamForImdbId(id, season, episode, (message) => {
          send({ type: 'log', message });
        });

        if (!streamData) {
          send({ type: 'error', message: 'Stream not found' });
          closeStream();
          return;
        }

        // Pass the actual stream URL so frontend can extract hash
        send({ type: 'resolved', streamUrl: streamData.streamUrl });
      } catch (error) {
        send({
          type: 'error',
          message: error?.message || 'Stream resolve failed'
        });
      } finally {
        closeStream();
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
