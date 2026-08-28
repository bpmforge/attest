export function latestAttemptGaps(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) return [];
  const latest = attempts[attempts.length - 1];
  return Array.isArray(latest) ? latest : [];
}

export function exhaustionReason(maxAttempts, attempts, maxLen = 1800) {
  const latest = latestAttemptGaps(attempts);
  const prior = attempts.slice(0, -1);
  const parts = [
    `conductor exhausted ${maxAttempts} attempt(s)`,
    `latest: ${latest.join('; ') || 'no failure detail recorded'}`,
  ];
  if (prior.length) {
    parts.push(`prior: ${prior.map((g, i) => `[${i + 1}] ${g.join('; ')}`).join(' | ')}`);
  }
  return parts.join(' — ').slice(0, maxLen);
}
