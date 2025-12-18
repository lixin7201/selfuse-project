import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
      thinkingLevel,
    }: {
      chatId: string;
      message: UIMessage;
      model: string;
      provider?: string;
      webSearch: boolean;
      reasoning?: boolean;
      thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
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
      thinkingLevel,
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
    // Note: getChatMessages returns messages in ASC order by createdAt
    // We need the most recent messages, so we'll get more and include the current message
    const previousMessages = await getChatMessages({
      chatId,
      status: ChatMessageStatus.CREATED,
      page: 1,
      limit: 50, // Increased limit to ensure we get enough context
    });

    // Debug logging - check what messages we're sending to LLM
    console.log('[Chat API] Total messages from DB:', previousMessages.length);
    console.log('[Chat API] Message IDs:', previousMessages.map(m => ({ id: m.id, role: m.role, createdAt: m.createdAt })));

    // Convert database messages to UIMessage format
    // Messages are already in chronological order (oldest first) from the query
    let validatedMessages: UIMessage[] = [];
    if (previousMessages.length > 0) {
      validatedMessages = previousMessages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts ? JSON.parse(message.parts) : [],
      })) as UIMessage[];
    }

    console.log('[Chat API] Validated messages count:', validatedMessages.length);
    console.log('[Chat API] Last message role:', validatedMessages.length > 0 ? validatedMessages[validatedMessages.length - 1].role : 'none');
    
    // Debug: 检查最后一条消息的 parts 内容
    if (validatedMessages.length > 0) {
      const lastMsg = validatedMessages[validatedMessages.length - 1];
      console.log('[Chat API] Last message parts:', JSON.stringify(lastMsg.parts, null, 2));
    }

    // Create provider client based on selected provider
    let llmModel;

    if (provider === 'evolink') {
      const evolinkApiKey = configs.evolink_api_key;
      if (!evolinkApiKey) {
        throw new Error('evolink_api_key is not set');
      }

      const evolinkBaseUrl = configs.evolink_base_url || 'https://api.evolink.ai';

      // Debug logging
      console.log('[Chat API] Evolink request:', { model, provider: requestProvider, evolinkBaseUrl });

      // Gemini, GPT-5.x, and Kimi-K2 models use OpenAI-compatible API
      // @docs https://docs.evolink.ai/en/api-manual/language-series/gemini-3.0-pro/openai-sdk/openai-sdk-quickstart
      // @docs https://docs.evolink.ai/en/api-manual/language-series/gpt-5.2/gpt-5.2-reference
      // @docs https://docs.evolink.ai/en/api-manual/language-series/kimi-k2/Kimi-K2-api
      if (model.startsWith('gemini-') || model.startsWith('gpt-5.') || model.startsWith('kimi-k2')) {
        console.log('[Chat API] Using OpenAI-compatible client for model:', model);
        const evolink = createOpenRouter({
          apiKey: evolinkApiKey,
          baseURL: `${evolinkBaseUrl}/v1`,
        });
        llmModel = evolink.chat(model);
      } else {
        // Claude models use Anthropic Messages API
        // @docs https://docs.evolink.ai/en/api-manual/language-series/claude/claude-messages-api
        console.log('[Chat API] Using Anthropic client for model:', model);
        const evolink = createAnthropic({
          apiKey: evolinkApiKey,
          baseURL: `${evolinkBaseUrl}/v1`,
        });
        llmModel = evolink.chat(model);
      }
    } else if (provider === 'gemini') {
      // Gemini 官方 API（复用 gemini_api_key 配置）
      const geminiApiKey = configs.gemini_api_key;
      if (!geminiApiKey) {
        throw new Error('gemini_api_key is not set');
      }

      // 移除 -official 后缀以获取实际的 API 模型名
      const actualModel = model.replace('-official', '');
      console.log('[Chat API] Using Gemini official API for model:', actualModel, 'thinkingLevel:', thinkingLevel);
      const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
      llmModel = google(actualModel);
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

    // Build streamText options
    const streamOptions: any = {
      model: llmModel,
      messages: convertToModelMessages(validatedMessages),
      maxOutputTokens: 8192, // 增加最大输出 token 数，防止回复被截断
    };

    // Add thinkingConfig for Gemini 3 models to improve response speed
    // Use 'low' thinkingLevel for faster responses (default is 'high' which is slower)
    // @docs https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#thinking
    if (provider === 'gemini' && model.includes('gemini-3')) {
      streamOptions.providerOptions = {
        google: {
          thinkingConfig: {
            thinkingLevel: thinkingLevel || 'low', // Default to 'low' for faster responses
          },
        },
      };
    }

    const result = streamText(streamOptions);

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
