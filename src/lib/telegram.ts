import axios from 'axios';
import type { ExecutionResult } from '../engine/executor.js';
import type { Signal } from '../engine/signal.js';
import type { AppConfig } from '../types.js';

function buildMessage(signal: Signal, result: ExecutionResult): string {
  const statusEmoji =
    result.status === 'executed' ? '✅' : result.status === 'dry-run' ? '🧪' : '⏭️';
  const wallet = signal.walletAddress.slice(0, 10);
  const edgePct = (signal.edge * 100).toFixed(2);
  const marketUrl = signal.eventSlug ? `https://polymarket.com/event/${signal.eventSlug}` : null;
  const lines = [
    `${statusEmoji} <b>Copy Trade Signal</b> [${result.status.toUpperCase()}]`,
    `Copied from: <code>${wallet}</code>`,
    signal.marketQuestion ? `Market: <b>${signal.marketQuestion}</b>` : null,
    marketUrl ? `Link: ${marketUrl}` : null,
    `Outcome: <b>${signal.outcome}</b>`,
    `Whale entry: ${signal.whaleAvgPrice.toFixed(3)} | Ask: ${signal.currentAsk.toFixed(3)}`,
    `Edge: <b>+${edgePct}%</b> | Kelly: <b>$${signal.kellySize.toFixed(2)}</b>`,
    result.orderId ? `Order ID: <code>${result.orderId}</code>` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

export async function sendLiveWhaleAlert(
  params: {
    wallet: string;
    marketQuestion: string;
    eventSlug: string;
    outcome: string;
    usdcSize: number;
    price: number;
  },
  config: AppConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  const wallet = params.wallet.slice(0, 10);
  const marketUrl = params.eventSlug ? `https://polymarket.com/event/${params.eventSlug}` : null;
  const lines = [
    '🔴 <b>Live Whale Detected</b> [WS]',
    `Wallet: <code>${wallet}</code>`,
    params.marketQuestion ? `Market: <b>${params.marketQuestion}</b>` : null,
    marketUrl ? `Link: ${marketUrl}` : null,
    `Outcome: <b>${params.outcome}</b>`,
    `Trade: ${params.price.toFixed(3)} × $${params.usdcSize.toFixed(0)} USDC`,
  ];
  const text = lines.filter(Boolean).join('\n');
  try {
    await axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'HTML',
    });
  } catch {
    // Non-fatal — don't interrupt trade flow on Telegram outage
  }
}

export async function sendSignalAlert(
  signal: Signal,
  result: ExecutionResult,
  config: AppConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      chat_id: config.telegramChatId,
      text: buildMessage(signal, result),
      parse_mode: 'HTML',
    });
  } catch {
    // Non-fatal — don't interrupt trade flow on Telegram outage
  }
}
