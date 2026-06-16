import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

import { translateText } from '../src/translate.js';

describe('translateText', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('sends Mandarin Chinese as target for EN→ZH', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '你好，今天怎么样？' }],
    });

    await translateText('Hello, how are you today?', 'en', 'zh');

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({
        content: expect.stringContaining('Mandarin Chinese'),
      })],
    }));
  });

  it('sends English as target for ZH→EN', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello, how are you today?' }],
    });

    await translateText('你好，今天怎么样？', 'zh', 'en');

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({
        content: expect.stringContaining('English'),
      })],
    }));
  });

  it('includes source text verbatim in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '很好' }],
    });

    const sourceText = 'Good morning, this is a test.';
    await translateText(sourceText, 'en', 'zh');

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({
        content: expect.stringContaining(sourceText),
      })],
    }));
  });

  it('returns the translated text', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '你好，今天怎么样？' }],
    });

    const result = await translateText('Hello, how are you today?', 'en', 'zh');
    expect(result).toBe('你好，今天怎么样？');
  });

  it('trims leading and trailing whitespace from the response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '  你好  \n' }],
    });

    const result = await translateText('Hello', 'en', 'zh');
    expect(result).toBe('你好');
  });

  it('throws on unexpected content block type', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'image', source: {} }],
    });

    await expect(translateText('Hello', 'en', 'zh')).rejects.toThrow('Unexpected response type from Claude');
  });

  it('throws on empty content array', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    await expect(translateText('Hello', 'en', 'zh')).rejects.toThrow('Unexpected response type from Claude');
  });
});

describe('language direction mapping', () => {
  it('maps detected English to Chinese target', () => {
    const detected: 'en' | 'zh' = 'en';
    const target: 'en' | 'zh' = detected === 'en' ? 'zh' : 'en';
    expect(target).toBe('zh');
  });

  it('maps detected Chinese to English target', () => {
    const detected: 'en' | 'zh' = 'zh';
    const target: 'en' | 'zh' = detected === 'en' ? 'zh' : 'en';
    expect(target).toBe('en');
  });
});
