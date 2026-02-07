// AI Chat Streaming Endpoint
// Uses GitHub Copilot directly (embedded client)

import { SYSTEM_PROMPT, getToolsForCopilot, generateTasteProfile } from '@/lib/ai-config';
import { executeTool, webSearchStreaming, getUserLists, getUserRatings } from '@/lib/ai-tools';
import { createChatCompletions } from '@/lib/copilot-client';
import { auth } from '@/auth';
import { getDb, getUserById } from '@/lib/db';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

// Increase timeout for streaming responses
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const session = await auth();
  const userId = session?.user?.id;

  try {
    const { messages: userMessages, model = 'gpt-4.1', chatId: requestedChatId } = await request.json();

    if (!userMessages || !Array.isArray(userMessages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get GitHub Copilot token from DB for this user, or from cookies for guests
    let githubToken = null;
    if (userId) {
      const user = await getUserById(userId);
      if (user?.copilot_token) {
        githubToken = user.copilot_token;
      }
    }

    // Fallback to cookie if no DB token (useful for guest users or first-time auth)
    if (!githubToken) {
      const cookieStore = request.cookies;
      githubToken = cookieStore.get('github_token')?.value;
    }

    const db = await getDb();
    
    // Handle Chat ID and Persistence
    let chatId = requestedChatId;
    let isNewChat = false;

     if (userId) {
       if (!chatId) {
         // Create new chat
         chatId = randomUUID();
         isNewChat = true;
         try {
           const now = new Date();
           const result = await db.collection('ai_chats').insertOne({
               _id: chatId,
               user_id: userId,
               title: 'New Chat',
               created_at: now,
               updated_at: now
           });
           console.log('POST /chat: New chat created', { chatId, userId });
         } catch (e) {
           console.error('POST /chat: Failed to create chat', { chatId, userId, error: e.message });
           // Continue without persistence if DB fails
           chatId = null;
         }
       } else {
         // Chat was pre-created; treat as new if empty
         try {
           const existing = await db.collection('ai_chats').findOne({ _id: chatId, user_id: userId });
           if (existing) {
            const count = await db.collection('ai_messages').countDocuments({ chat_id: chatId });
            if (count === 0) isNewChat = true;
           }
         } catch (e) {
           console.error('POST /chat: Failed to check chat messages', { chatId, userId, error: e.message });
         }
       }

       // Save User Message
       if (chatId) {
          try {
             const lastUserMsg = userMessages[userMessages.length - 1];
             if (lastUserMsg && lastUserMsg.role === 'user') {
                 // @ts-ignore
                 await db.collection('ai_messages').insertOne({
                     _id: randomUUID() as any,
                     chat_id: chatId,
                     role: 'user',
                     content: lastUserMsg.content,
                     created_at: new Date()
                 });
             }
          } catch (e) {
             console.error('Failed to save user message:', e);
          }
       }
    }

    // Build compact taste profile
    const tasteProfile = await generateTasteProfile(userId);
    const now = new Date();
    const currentDateContext = `Current date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (${now.toISOString().split('T')[0]})
ISO: ${now.toISOString()}
Year: ${now.getFullYear()}

Use this information to:
- Distinguish between released and upcoming content
- Understand recency when users ask about "recent", "latest", or "new" releases
- Provide accurate context for "this year", "last year", relative dates, etc.
- Know what content is currently in theaters, recently released, or upcoming`;

    // Prepare messages for the API
    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT
          + '\n\n--- SYSTEM TIME ---\n' + currentDateContext + '\n--- END SYSTEM TIME ---'
          + '\n\n--- USER TASTE PROFILE ---\n' + tasteProfile + '\n--- END PROFILE ---'
      },
      ...userMessages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ];

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (isNewChat && chatId) {
             // Inform client of new chat ID
             controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'chat_created',
                id: chatId
             })}\n\n`));
          }

          const fullResponse = await processAIConversation(messages, controller, encoder, model, userId, githubToken);
          
          // Save Assistant Message
          if (chatId && fullResponse) {
             try {
                // @ts-ignore
                await db.collection('ai_messages').insertOne({
                    _id: randomUUID() as any,
                    chat_id: chatId,
                    role: 'assistant',
                    content: fullResponse,
                    created_at: new Date()
                });

                // Update chat's updated_at timestamp
                await db.collection('ai_chats').updateOne(
                    { _id: chatId },
                    { $set: { updated_at: new Date() } }
                );

                // Auto-Title Logic
                if (isNewChat) {
                   // Generate title based on first user message
                   const firstUserMsg = userMessages.find(m => m.role === 'user')?.content || '';
                   const generatedTitle = await generateSummaryTitle(firstUserMsg, fullResponse, model, githubToken);
                   if (generatedTitle) {
                      await db.collection('ai_chats').updateOne(
                          { _id: chatId },
                          { $set: { title: generatedTitle, updated_at: new Date() } }
                      );
                      // Notify client of title change
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'title_generated',
                        title: generatedTitle
                      })}\n\n`));
                   }
                }

             } catch (e) {
                console.error('Failed to save assistant message:', e);
             }
          }

        } catch (error) {
          console.error('Stream error:', error);

          const errorMsg = error.message || 'An error occurred';
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: errorMsg,
            message: errorMsg
          })}\n\n`));
        } finally {
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (e) {
            console.error('Error closing stream:', e);
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
  } catch (error) {
    console.error('POST /chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat: ' + error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Logic below remains largely the same, just keeping it here for completeness if needed in the file
// processAIConversation and generateSummaryTitle are pure functions mostly calling external APIs or encoding streams

async function processAIConversation(messages, controller, encoder, model, userId = null, githubToken = null) {
  const tools = getToolsForCopilot();
  let continueLoop = true;
  let currentMessages = [...messages];
  const maxIterations = 10;
  let iteration = 0;
  let fullAssistantContent = '';
  const confirmationRequiredTools = new Set(['bulk_add_to_list', 'clear_list', 'delete_list', 'bulk_remove_from_list']);

  while (continueLoop && iteration < maxIterations) {
    iteration++;

    const response = await createChatCompletions({
      model,
      messages: currentMessages,
      tools,
      tool_choice: 'auto',
      stream: true,
      max_tokens: 4096,
      temperature: 0.7
    }, githubToken);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Copilot API error:', response.status, errorText);
      throw new Error(`Copilot API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantContent = '';
    let toolCalls = [];
    let finishReason = null;
    let streamedText = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

        try {
          const data = JSON.parse(line.slice(6));
          const choice = data.choices?.[0];

          if (!choice) continue;

          if (choice.delta?.content) {
            let delta = choice.delta.content;
            delta = delta.replace(/调用\s*functions\.[^\n]+/g, '');
            assistantContent += delta;
            fullAssistantContent += delta;
            streamedText = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'text',
              content: delta
            })}\n\n`));
          }

          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = {
                    id: tc.id || `call_${Date.now()}_${tc.index}`,
                    function: { name: '', arguments: '' }
                  };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        } catch (e) { }
      }
    }

    if (toolCalls.length > 0 && finishReason === 'tool_calls') {
      currentMessages.push({
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }))
      });

      for (const toolCall of toolCalls) {
        if (!toolCall?.function) continue;
        const toolName = toolCall.function.name;
        let args: Record<string, any> = {};

        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          console.error('Failed to parse tool arguments:', e);
        }

        const needsConfirmation = confirmationRequiredTools.has(toolName) && args?.confirmed !== true;
        let result;

        if (needsConfirmation) {
          result = {
            needs_confirmation: true,
            action: toolName,
            list_name: args?.list_name || null,
            total: Array.isArray(args?.title_ids) ? args.title_ids.length : null,
            message: 'Please confirm before proceeding.'
          };
        } else {
          if (toolName === 'web_search') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'tool_start',
              tool: toolName,
              query: args?.query || null
            })}\n\n`));
          }

          const options = toolName === 'bulk_add_to_list'
            ? {
                onProgress: ({ completed, total }) => {
                  const isLongRunning = typeof total === 'number' && total >= 20;
                  if (!isLongRunning) return;

                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'tool_progress',
                    tool: toolName,
                    completed,
                    total,
                    tool_call_id: toolCall.id
                  })}\n\n`));
                }
              }
            : {};

          if (toolName === 'web_search') {
            result = await webSearchStreaming(args.query, (source) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'web_search_source',
                source
              })}\n\n`));
            });
          } else {
            result = await executeTool(toolName, args, userId, options);
          }

          if (result && result.type === 'stream_card') {
             controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'stream_card',
                data: result
             })}\n\n`));
          }

          if (toolName === 'web_search') {
            const sources = Array.isArray(result?.sources) ? result.sources : [];
            if (sources.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'web_search_sources',
                sources
              })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'tool_end',
              tool: toolName
            })}\n\n`));
          }
        }

        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    } else {
      if (!streamedText && fullAssistantContent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'text',
          content: fullAssistantContent
        })}\n\n`));
      }
      continueLoop = false;
    }
  }

  return fullAssistantContent;
}

async function generateSummaryTitle(userMessage, assistantMessage, model, githubToken = null) {
  try {
     const prompt = `Summarize the following interaction into a very short title using ONLY 2-3 words. Do not use quotes or punctuation.
     User: ${userMessage.substring(0, 200)}...
     Assistant: ${assistantMessage.substring(0, 200)}...
     Title (2-3 words only):`;

     const response = await createChatCompletions({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 15,
      temperature: 0.5,
      stream: false
    }, githubToken);

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.warn('Title generation failed:', e);
    return null;
  }
}
