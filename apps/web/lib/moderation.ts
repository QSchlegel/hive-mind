const blockedTerms = ["child abuse", "terrorist manual", "malware payload"];

export function moderateContent(content: string): { approved: boolean; reason?: string } {
  const normalized = content.toLowerCase();
  const matched = blockedTerms.find((term) => normalized.includes(term));

  if (matched) {
    return {
      approved: false,
      reason: `Blocked term detected: ${matched}`
    };
  }

  if (content.length > 80_000) {
    return {
      approved: false,
      reason: "Content too large"
    };
  }

  return { approved: true };
}
