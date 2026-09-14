/** Decimal strings preserve the full PostgreSQL bigint range in JSON and URLs. */
export function parseMessageCursor(value: string): string {
  if (!/^(0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > BigInt("9223372036854775807")) {
    throw new Error("Invalid message cursor");
  }
  return value;
}

export function mergeMessages<T extends { id: string; sequence: string }>(existing: T[], incoming: T[]): T[] {
  const messages = new Map(existing.map(message => [message.id, message]));
  incoming.forEach(message => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : 0);
}
