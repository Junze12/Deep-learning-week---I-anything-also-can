type GenerateOptions = {
  model?: string;
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  stop?: string[];
  baseUrl?: string;
};

const DEFAULT_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'deepseek-v3.1:671b-cloud';

export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const {
    model = DEFAULT_MODEL,
    temperature,
    top_p,
    num_predict,
    stop,
    baseUrl = DEFAULT_BASE_URL,
  } = options;

  const body = {
    model,
    prompt,
    stream: false,
    options: {
      ...(temperature !== undefined ? { temperature } : {}),
      ...(top_p !== undefined ? { top_p } : {}),
      ...(num_predict !== undefined ? { num_predict } : {}),
      ...(stop !== undefined ? { stop } : {}),
    },
  };

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const details = text ? ` - ${text}` : '';
    throw new Error(`Ollama error ${response.status} ${response.statusText}${details}`);
  }

  const data = await response.json();
  return (data?.response ?? data?.message?.content ?? '').toString();
}

