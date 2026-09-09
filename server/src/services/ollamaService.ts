import { env } from '../config/env';

export interface OllamaGenerateOptions {
  model?: string;
  prompt: string;
  system?: string;
  temperature?: number;
}

export interface OllamaModelInfo {
  name: string;
  size?: number;
  digest?: string;
}

export class OllamaService {
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, '');
    this.defaultModel = env.OLLAMA_MODEL;
  }

  /**
   * Checks if local Ollama daemon is running and reachable
   */
  async checkHealth(): Promise<{ online: boolean; models: string[]; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });

      if (!res.ok) {
        return { online: false, models: [], error: `Ollama returned status ${res.status}` };
      }

      const data = (await res.json()) as { models?: { name: string }[] };
      const models = (data.models || []).map((m) => m.name);
      return { online: true, models };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection refused';
      return {
        online: false,
        models: [],
        error: `Ollama daemon not responding on ${this.baseUrl} (${message}). Run: ollama serve`,
      };
    }
  }

  /**
   * Generates completion using local Ollama model (e.g. llama3.1:8b or mistral:7b)
   */
  async generateCompletion(options: OllamaGenerateOptions): Promise<{ response: string; modelUsed: string; fallback: boolean }> {
    const model = options.model || this.defaultModel;

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          system: options.system || 'You are an expert sales outreach copywriter and client relationship manager. Write concise, polite, and persuasive communication without buzzwords.',
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        throw new Error(`Ollama generation failed with status ${res.status}`);
      }

      const data = (await res.json()) as { response: string };
      return {
        response: data.response.trim(),
        modelUsed: model,
        fallback: false,
      };
    } catch (error) {
      console.warn(`[OllamaService] Local Ollama unavailable or failed (${error}). Returning fallback draft template.`);
      // Graceful fallback template when Ollama service is not running locally
      return {
        response: this.generateRuleBasedFallback(),
        modelUsed: `${model} (fallback template)`,
        fallback: true,
      };
    }
  }

  /**
   * Deterministic template generator used when Ollama daemon is offline
   */
  private generateRuleBasedFallback(): string {
    return `Hi there,\n\nFollowing up on our conversation regarding how we help similar businesses streamline client communications and automated scheduling. Would you be open to a quick 3-minute walk-through this week?\n\nBest regards,\nGrowth Team`;
  }
}

export const ollamaService = new OllamaService();
