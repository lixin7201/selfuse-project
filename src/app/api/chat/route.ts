import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  createIdGenerator,
  generateId,
  streamText,
  UIMessage,
} from 'ai';

import { findChatById } from '@/shared/models/chat';
import {
  ChatMessageStatus,
  createChatMessage,
  getChatMessages,
  NewChatMessage,
} from '@/shared/models/chat_message';
import { getAllConfigs } from '@/shared/models/config';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const {
      chatId,
      message,
      model,
      provider: requestProvider,
      webSearch,
      reasoning,
    }: {
      chatId: string;
      message: UIMessage;
      model: string;
      provider?: string;
      webSearch: boolean;
      reasoning?: boolean;
    } = await req.json();

    if (!chatId || !model) {
      throw new Error('invalid params');
    }

    if (!message || !message.parts || message.parts.length === 0) {
      throw new Error('invalid message');
    }

    // check user sign
    const user = await getUserInfo();
    if (!user) {
      throw new Error('no auth, please sign in');
    }

    // check chat
    const chat = await findChatById(chatId);
    if (!chat) {
      throw new Error('chat not found');
    }

    if (chat.userId !== user?.id) {
      throw new Error('no permission to access this chat');
    }

    const configs = await getAllConfigs();

    // Determine provider (default to openrouter)
    const provider = requestProvider || 'openrouter';

    const currentTime = new Date();

    const metadata = {
      model,
      provider,
      webSearch,
      reasoning,
    };

    // save user message to database
    const userMessage: NewChatMessage = {
      id: generateId().toLowerCase(),
      chatId,
      userId: user?.id,
      status: ChatMessageStatus.CREATED,
      createdAt: currentTime,
      updatedAt: currentTime,
      role: 'user',
      parts: JSON.stringify(message.parts),
      metadata: JSON.stringify(metadata),
      model: model,
      provider: provider,
    };
    await createChatMessage(userMessage);

    // load previous messages from database
    const previousMessages = await getChatMessages({
      chatId,
      status: ChatMessageStatus.CREATED,
      page: 1,
      limit: 10,
    });

    let validatedMessages: UIMessage[] = [];
    if (previousMessages.length > 0) {
      validatedMessages = previousMessages.reverse().map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts ? JSON.parse(message.parts) : [],
      })) as UIMessage[];
    }

    // Create provider client based on selected provider
    let llmModel;

    if (provider === 'evolink') {
      const evolinkApiKey = configs.evolink_api_key;
      if (!evolinkApiKey) {
        throw new Error('evolink_api_key is not set');
      }

      const evolinkBaseUrl = configs.evolink_base_url || 'https://api.evolink.ai';

      // Gemini and GPT-5.x models use OpenAI-compatible API
      // @docs https://docs.evolink.ai/en/api-manual/language-series/gemini-3.0-pro/openai-sdk/openai-sdk-quickstart
      // @docs https://docs.evolink.ai/en/api-manual/language-series/gpt-5.2/gpt-5.2-reference
      if (model.startsWith('gemini-') || model.startsWith('gpt-5.')) {
        const evolink = createOpenRouter({
          apiKey: evolinkApiKey,
          baseURL: `${evolinkBaseUrl}/v1`,
        });
        llmModel = evolink.chat(model);
      } else {
        // Claude models use Anthropic Messages API
        // @docs https://docs.evolink.ai/en/api-manual/language-series/claude/claude-messages-api
        const evolink = createAnthropic({
          apiKey: evolinkApiKey,
          baseURL: `${evolinkBaseUrl}/v1`,
        });
        llmModel = evolink.chat(model);
      }
    } else {
      // Default to OpenRouter
      const openrouterApiKey = configs.openrouter_api_key;
      if (!openrouterApiKey) {
        throw new Error('openrouter_api_key is not set');
      }

      const openrouterBaseUrl = configs.openrouter_base_url;

      const openrouter = createOpenRouter({
        apiKey: openrouterApiKey,
        baseURL: openrouterBaseUrl ? openrouterBaseUrl : undefined,
      });

      llmModel = openrouter.chat(model);
    }

    const result = streamText({
      model: llmModel,
      messages: convertToModelMessages(validatedMessages),
    });

    // send sources and reasoning back to the client
    return result.toUIMessageStreamResponse({
      sendSources: true,
      sendReasoning: Boolean(reasoning),
      originalMessages: validatedMessages,
      generateMessageId: createIdGenerator({
        size: 16,
      }),
      onFinish: async ({ messages }) => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'assistant') {
          const assistantMessage: NewChatMessage = {
            id: generateId().toLowerCase(),
            chatId,
            userId: user?.id,
            status: ChatMessageStatus.CREATED,
            createdAt: currentTime,
            updatedAt: currentTime,
            model: model,
            provider: provider,
            parts: JSON.stringify(lastMessage.parts),
            role: 'assistant',
          };
          await createChatMessage(assistantMessage);
        }
      },
    });
  } catch (e: any) {
    console.log('chat failed:', e);
    return new Response(e.message, { status: 500 });
  }
}
