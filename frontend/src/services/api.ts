import type { ChatResponse } from '../types';

export async function askQuestion(
  userMessage: string,
  language: string = 'en',
  baseUrl: string
): Promise<ChatResponse> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/api/Chat/ask`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for AI + research search

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userMessage,
        language,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Server returned status ${res.status}: ${errText}`);
    }

    const data: ChatResponse = await res.json();
    return data;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. The server or AI took too long to respond.');
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('An unexpected network error occurred.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkBackendHealth(baseUrl: string): Promise<boolean> {
  try {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanBase}/api/Chat/models`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    return res.ok || res.status === 404 || res.status === 502; // Endpoint is reachable
  } catch {
    return false;
  }
}
