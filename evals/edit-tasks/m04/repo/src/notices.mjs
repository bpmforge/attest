import { fineCents } from './fines.mjs';

export function overdueNotice(title, daysLate) {
  if (daysLate <= 0) return `${title} is not overdue`;
  if (daysLate <= 3) return `${title} is ${daysLate}d late; within grace, no fine yet`;
  return `${title} is ${daysLate}d late; fine ${fineCents(daysLate)} cents`;
}
