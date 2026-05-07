import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getOutput(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("CALT");
  }
  return channel;
}
