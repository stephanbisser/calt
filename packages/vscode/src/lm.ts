import * as vscode from "vscode";

export interface LmRequestOptions {
  systemPrompt: string;
  userPrompt: string;
  token?: vscode.CancellationToken;
  maxTokens?: number;
}

/**
 * Select a Copilot chat model. Returns undefined if no Copilot model is
 * available (user not signed in / no subscription).
 */
export async function selectModel(): Promise<vscode.LanguageModelChat | undefined> {
  if (!vscode.lm || typeof vscode.lm.selectChatModels !== "function") return undefined;
  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
  return models[0];
}

/**
 * Send a single-turn request to a language model and stream the response.
 * Yields text fragments as they arrive. Caller is responsible for handling
 * `LanguageModelError` (e.g. quota exhausted, no consent) thrown during
 * iteration — we don't swallow it because UX should differ per surface.
 */
export async function* streamReply(
  model: vscode.LanguageModelChat,
  options: LmRequestOptions,
): AsyncIterable<string> {
  const messages = [
    vscode.LanguageModelChatMessage.User(`SYSTEM:\n${options.systemPrompt}\n\nTASK:\n${options.userPrompt}`),
  ];
  const response = await model.sendRequest(
    messages,
    {},
    options.token ?? new vscode.CancellationTokenSource().token,
  );
  for await (const fragment of response.text) {
    yield fragment;
  }
}

export async function collectReply(
  model: vscode.LanguageModelChat,
  options: LmRequestOptions,
): Promise<string> {
  let out = "";
  for await (const fragment of streamReply(model, options)) {
    out += fragment;
  }
  return out;
}

export function formatLmError(err: unknown): string {
  if (err instanceof vscode.LanguageModelError) {
    return `Language model error (${err.code}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
