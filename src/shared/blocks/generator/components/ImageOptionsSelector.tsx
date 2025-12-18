'use client';

import { useTranslations } from 'next-intl';

import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';

// Aspect ratio options - common across providers
export const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
];

// Resolution options - only for Gemini 3 Pro Image Preview
export const RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

// Models that support aspect ratio selection
export const ASPECT_RATIO_SUPPORTED_MODELS = [
  // Gemini
  'gemini-3-pro-image-preview',
  'gemini-3-flash-preview',
  // Evolink
  'gemini-3-pro-image-preview', // Nano Banana Pro on Evolink
  'nano-banana-2-lite',
  'gemini-2.5-flash-image',
];

// Models that support resolution selection
export const RESOLUTION_SUPPORTED_MODELS = [
  'gemini-3-pro-image-preview',
  'gemini-3-flash-preview',
];

// Provider-model combinations for aspect ratio support
export const supportsAspectRatio = (provider: string, model: string): boolean => {
  if (provider === 'gemini' && (model === 'gemini-3-pro-image-preview' || model === 'gemini-3-flash-preview')) {
    return true;
  }
  if (provider === 'evolink' && ASPECT_RATIO_SUPPORTED_MODELS.includes(model)) {
    return true;
  }
  return false;
};

// Provider-model combinations for resolution support
export const supportsResolution = (provider: string, model: string): boolean => {
  if (provider === 'gemini' && (model === 'gemini-3-pro-image-preview' || model === 'gemini-3-flash-preview')) {
    return true;
  }
  // Evolink doesn't support resolution for Nano Banana models
  return false;
};

interface ImageOptionsSelectorProps {
  provider: string;
  model: string;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  resolution: string;
  onResolutionChange: (value: string) => void;
}

export function ImageOptionsSelector({
  provider,
  model,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
}: ImageOptionsSelectorProps) {
  const t = useTranslations('ai.image.generator');

  const showAspectRatio = supportsAspectRatio(provider, model);
  const showResolution = supportsResolution(provider, model);

  if (!showAspectRatio && !showResolution) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {showAspectRatio && (
        <div className="space-y-2">
          <Label>{t('form.aspect_ratio')}</Label>
          <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('form.select_aspect_ratio')} />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIO_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showResolution && (
        <div className="space-y-2">
          <Label>{t('form.resolution')}</Label>
          <Select value={resolution} onValueChange={onResolutionChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('form.select_resolution')} />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
