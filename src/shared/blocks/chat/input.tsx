'use client';

import { useEffect, useState } from 'react';
import { UIMessage, UseChatHelpers } from '@ai-sdk/react';
import { BrainCircuitIcon, ChevronDownIcon, GlobeIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/shared/components/ai-elements/prompt-input';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { useChatContext } from '@/shared/contexts/chat';
import { ChatModel } from '@/shared/types/chat';

const CHAT_MODEL_STORAGE_KEY = 'shipany_chat_selected_model';

export function ChatInput({
  handleSubmit,
  status,
  error,
  onInputChange,
}: {
  handleSubmit: (
    message: PromptInputMessage,
    body: Record<string, any>
  ) => void | Promise<void>;
  status?: UseChatHelpers<UIMessage>['status'];
  error?: string | null;
  onInputChange?: (value: string) => void;
}) {
  const t = useTranslations('ai.chat.generator');

  // todo: get models from api
  const models: ChatModel[] = [
    // OpenRouter models (default)
    {
      title: 'Kimi K2 Thinking',
      name: 'moonshotai/kimi-k2-thinking',
      provider: 'openrouter',
    },
    {
      title: 'Deepseek R1',
      name: 'deepseek/deepseek-r1',
      provider: 'openrouter',
    },
    {
      title: 'GPT-5',
      name: 'openai/gpt-5',
      provider: 'openrouter',
    },
    {
      title: 'Claude 4.5 Sonnet',
      name: 'anthropic/claude-4.5-sonnet',
      provider: 'openrouter',
    },
    // Evolink models - IDs from https://docs.evolink.ai/en/api-manual/language-series/
    // Kimi K2 via Evolink - uses OpenAI-compatible API
    // @docs https://docs.evolink.ai/en/api-manual/language-series/kimi-k2/Kimi-K2-api
    {
      title: 'Kimi K2 Thinking (Evolink)',
      name: 'kimi-k2-thinking',
      provider: 'evolink',
    },
    {
      title: 'Claude Sonnet 4.5 (Evolink)',
      name: 'claude-sonnet-4-5-20250929',
      provider: 'evolink',
    },
    {
      title: 'Claude Haiku 4.5 (Evolink)',
      name: 'claude-haiku-4-5-20251001',
      provider: 'evolink',
    },
    {
      title: 'Claude Opus 4.5 (Evolink)',
      name: 'claude-opus-4-5-20251101',
      provider: 'evolink',
    },
    {
      title: 'Claude Opus 4.1 (Evolink)',
      name: 'claude-opus-4-1-20250805',
      provider: 'evolink',
    },
    // Gemini via Evolink - uses OpenAI-compatible API
    {
      title: 'Gemini 3.0 Pro (Evolink)',
      name: 'gemini-3-pro-preview',
      provider: 'evolink',
    },
    // GPT 5.2 via Evolink - uses OpenAI-compatible API
    // @docs https://docs.evolink.ai/en/api-manual/language-series/gpt-5.2/gpt-5.2-reference
    {
      title: 'GPT 5.2 (Evolink)',
      name: 'gpt-5.2',
      provider: 'evolink',
    },
    // Gemini 官方 API（复用现有 gemini_api_key 配置）
    {
      title: 'Gemini 3 Pro (Official)',
      name: 'gemini-3-pro-preview-official',
      provider: 'gemini',
    },
    {
      title: 'Gemini 3 Flash (Official)',
      name: 'gemini-3-flash-preview-official',
      provider: 'gemini',
    },
  ];

  // Thinking level options for Gemini 3 models (only 'low' and 'high' are supported)
  // 'low' = faster responses, 'high' = deeper reasoning
  const THINKING_LEVEL_OPTIONS = [
    { value: 'low', labelKey: 'thinking_levels.low' },
    { value: 'high', labelKey: 'thinking_levels.high' },
  ];

  // Initialize with default, then load from localStorage in useEffect
  const [model, setModel] = useState<string>(models[0].name);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Load saved model from localStorage on mount
  useEffect(() => {
    const savedModel = localStorage.getItem(CHAT_MODEL_STORAGE_KEY);
    if (savedModel && models.some((m) => m.name === savedModel)) {
      setModel(savedModel);
    }
    setIsModelLoaded(true);
  }, []);

  // Save model to localStorage when changed
  const handleModelChange = (value: string) => {
    setModel(value);
    localStorage.setItem(CHAT_MODEL_STORAGE_KEY, value);
  };
  const [input, setInput] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<string>('low'); // Default to 'low' for faster responses
  const selectedModelLabel =
    models.find((item) => item.name === model)?.title ?? models[0]?.title ?? '';
  
  // Check if current model is Gemini 3 (supports thinking level)
  const isGemini3Model = model.includes('gemini-3') && model.includes('-official');

  return (
    <div className="w-full">
      <PromptInput
        onSubmit={async (message) => {
          try {
            const selectedModel = models.find((item) => item.name === model);
            const provider = selectedModel?.provider || 'openrouter';
            
            // 如果有文件附件，先上传到 R2 存储获取公开 URL
            let processedFiles = message.files;
            if (message.files && message.files.length > 0) {
              processedFiles = await Promise.all(
                message.files.map(async (file) => {
                  // 如果是 blob 或 data URL，需要上传到 R2
                  if (file.url && (file.url.startsWith('blob:') || file.url.startsWith('data:'))) {
                    try {
                      // 将 URL 转换为 Blob
                      const response = await fetch(file.url);
                      const blob = await response.blob();
                      const fileName = file.filename || `file-${Date.now()}`;
                      
                      // 判断文件类型
                      const isImage = blob.type.startsWith('image/');
                      const isPdf = blob.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
                      const isTextFile = !isImage && !isPdf && (
                        fileName.endsWith('.txt') || fileName.endsWith('.md') || 
                        fileName.endsWith('.json') || fileName.endsWith('.csv') ||
                        fileName.endsWith('.xml') || fileName.endsWith('.html') ||
                        fileName.endsWith('.css') || fileName.endsWith('.js') ||
                        fileName.endsWith('.ts') || fileName.endsWith('.py') ||
                        fileName.endsWith('.yaml') || fileName.endsWith('.yml') ||
                        fileName.endsWith('.sh') || fileName.endsWith('.log') ||
                        blob.type.startsWith('text/')
                      );
                      
                      if (isImage || isPdf) {
                        // 图片和 PDF 使用 presigned URL 直接上传到 R2
                        console.log('[ChatInput] Getting presigned URL for:', fileName, 'type:', blob.type);
                        
                        // 1. 获取 presigned URL
                        const presignedResp = await fetch('/api/storage/presigned-url', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            filename: fileName,
                            contentType: blob.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
                          }),
                        });
                        
                        if (!presignedResp.ok) {
                          console.error('[ChatInput] Failed to get presigned URL');
                          // 对于大文件，无法使用 base64 备选
                          if (blob.size > 3 * 1024 * 1024) {
                            console.error('[ChatInput] File too large for base64 fallback');
                            return {
                              ...file,
                              text: `[文件上传失败: ${fileName}]\n\n文件太大，请使用较小的文件或联系管理员配置存储服务。`,
                            };
                          }
                          // 备选：返回 base64（仅限小文件）
                          const reader = new FileReader();
                          const base64 = await new Promise<string>((resolve) => {
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                          });
                          return { ...file, url: base64 };
                        }
                        
                        const { data: presignedData } = await presignedResp.json();
                        
                        // 2. 直接上传到 R2
                        console.log('[ChatInput] Uploading to R2 via presigned URL');
                        const uploadResp = await fetch(presignedData.presignedUrl, {
                          method: 'PUT',
                          body: blob,
                          headers: {
                            'Content-Type': blob.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
                          },
                        });
                        
                        if (uploadResp.ok) {
                          console.log('[ChatInput] File uploaded successfully:', presignedData.publicUrl);
                          return {
                            ...file,
                            url: presignedData.publicUrl,
                          };
                        } else {
                          console.error('[ChatInput] R2 upload failed:', uploadResp.status);
                          return {
                            ...file,
                            text: `[文件上传失败: ${fileName}]\n\n请检查存储服务配置或稍后重试。`,
                          };
                        }
                      } else if (isTextFile) {
                        // 文本文件：读取内容（限制大小）
                        console.log('[ChatInput] Reading text file:', fileName);
                        if (blob.size > 100 * 1024) { // 限制文本文件 100KB
                          return {
                            ...file,
                            text: `[文件: ${fileName}]\n\n文件内容过大（${(blob.size / 1024).toFixed(1)}KB），仅显示前 100KB。\n\n${await blob.slice(0, 100 * 1024).text()}`,
                          };
                        }
                        const text = await blob.text();
                        return {
                          ...file,
                          text: `[文件: ${fileName}]\n\n${text}`,
                        };
                      } else {
                        // 其他未知类型文件
                        console.log('[ChatInput] Unknown file type:', fileName, blob.type);
                        return {
                          ...file,
                          text: `[不支持的文件类型: ${fileName}]\n\n请上传图片、PDF 或文本文件。`,
                        };
                      }
                    } catch (e) {
                      console.error('[ChatInput] Upload error:', e);
                    }
                  }
                  return file;
                })
              );
            }
            
            // 使用处理后的文件发送消息
            await handleSubmit(
              { text: message.text, files: processedFiles },
              { model, provider, webSearch, reasoning, thinkingLevel: isGemini3Model ? thinkingLevel : undefined }
            );
            setInput('');
          } catch (err) {
            console.error('[ChatInput] Submit error:', err);
            // Allow parent to control error display/state. Do not clear input.
          }
        }}
        className="mt-4"
        globalDrop
        multiple
        accept="image/*,.txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.pdf,.docx,.doc,.xlsx,.xls,.yaml,.yml,.sh,.log"
        maxFiles={5}
        maxFileSize={50 * 1024 * 1024}
      >
        <PromptInputHeader>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea
            className="overflow-hidden p-4 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder={t('input_placeholder')}
            onChange={(e) => {
              const value = e.target.value;
              setInput(value);
              onInputChange?.(value);
            }}
            value={input}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label={t('add_attachments')} />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <div className="flex items-center">
              <Switch
                id="prompt-reasoning-switch"
                checked={reasoning}
                onCheckedChange={setReasoning}
                // className="peer sr-only"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label
                    htmlFor="prompt-reasoning-switch"
                    className="text-muted-foreground hover:text-foreground peer-data-[state=checked]:text-primary inline-flex cursor-pointer items-center rounded-md p-2 transition-colors"
                  >
                    <BrainCircuitIcon size={16} />
                  </Label>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>Reasoning</TooltipContent>
              </Tooltip>
            </div>
            <PromptInputSelect
              onValueChange={(value) => {
                handleModelChange(value);
              }}
              value={model}
            >
              <PromptInputSelectTrigger>
                <PromptInputSelectValue>
                  {selectedModelLabel}
                </PromptInputSelectValue>
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                {models.map((model) => (
                  <PromptInputSelectItem key={model.name} value={model.name}>
                    {model.title}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
            {isGemini3Model && (
              <PromptInputSelect
                onValueChange={setThinkingLevel}
                value={thinkingLevel}
              >
                <PromptInputSelectTrigger className="w-auto min-w-[80px]">
                  <PromptInputSelectValue>
                    {t(THINKING_LEVEL_OPTIONS.find(opt => opt.value === thinkingLevel)?.labelKey || 'thinking_levels.low')}
                  </PromptInputSelectValue>
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {THINKING_LEVEL_OPTIONS.map((option) => (
                    <PromptInputSelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>
            )}
          </PromptInputTools>
          <PromptInputSubmit
            disabled={!input || status === 'submitted'}
            status={status}
          />
        </PromptInputFooter>
      </PromptInput>
      {error ? (
        <p className="text-destructive mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
