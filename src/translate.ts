import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function translateText(
  text: string,
  sourceLang: 'en' | 'zh',
  targetLang: 'en' | 'zh'
): Promise<string> {
  const target = targetLang === 'zh' ? 'Mandarin Chinese' : 'English';
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Translate the following to ${target}. Output only the translation, nothing else.\n\n${text}`,
    }],
  });

  const block = message.content[0];
  if (!block || block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text.trim();
}
