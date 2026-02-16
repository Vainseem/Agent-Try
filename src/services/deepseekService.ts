import axios, { AxiosInstance } from 'axios';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  json_mode?: boolean;
  [key: string]: any;
}

interface ChatCompletionResponse {
  content: string;
}

const API_KEY = process.env.REACT_APP_DEEPSEEK_API_KEY;
const BASE_URL = process.env.REACT_APP_DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

const deepseekClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  }
});

export const chatCompletion = async (
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<ChatCompletionResponse> => {
  try {
    const response = await deepseekClient.post('/v1/chat/completions', {
      model: 'deepseek-reasoner',
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 20000,
      response_format: options.json_mode ? { type: 'json_object' } : undefined,
      ...options
    });

    return response.data.choices[0].message;
  } catch (error: any) {
    console.error('DeepSeek API Error:', error);
    throw new Error(error.response?.data?.error?.message || '调用 DeepSeek API 失败');
  }
};

export const chatCompletionStream = async (
  messages: ChatMessage[],
  onChunk: (content: string) => void,
  options: ChatCompletionOptions = {}
): Promise<void> => {
  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages,
        stream: true,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 20000,
        ...options
      })
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法获取响应流');

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            console.warn('Failed to parse chunk:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('DeepSeek Streaming Error:', error);
    throw new Error('流式调用失败');
  }
};

export default {
  chatCompletion,
  chatCompletionStream
};
