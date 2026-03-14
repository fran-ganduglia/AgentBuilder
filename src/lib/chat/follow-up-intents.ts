export type ChatFollowUpIntent = {
  id: string;
  label: string;
  prompt: string;
  order: number;
};

const FOLLOW_UP_LINE_PATTERN = /^(\d+)\.\s+(.+?)\s*$/;

function normalizeFollowUpText(value: string): string {
  return value.replace(/\*\*/g, "").replace(/__/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

export function extractChatFollowUpIntents(content: string): ChatFollowUpIntent[] {
  const lines = content.split(/\r?\n/);
  const matches = lines
    .map((line) => {
      const match = line.match(FOLLOW_UP_LINE_PATTERN);
      if (!match) {
        return null;
      }

      const order = Number.parseInt(match[1] ?? "", 10);
      const text = normalizeFollowUpText(match[2] ?? "");

      if (!Number.isInteger(order) || order <= 0 || text.length === 0) {
        return null;
      }

      return {
        id: `follow-up-${order}-${text.toLowerCase()}`,
        label: text,
        prompt: text,
        order,
      } satisfies ChatFollowUpIntent;
    })
    .filter((value): value is ChatFollowUpIntent => value !== null)
    .sort((left, right) => left.order - right.order);

  if (matches.length === 0 || matches[0]?.order !== 1) {
    return [];
  }

  const followUps: ChatFollowUpIntent[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const expectedOrder = index + 1;
    const current = matches[index];

    if (!current || current.order !== expectedOrder) {
      break;
    }

    followUps.push(current);
  }

  return followUps;
}
