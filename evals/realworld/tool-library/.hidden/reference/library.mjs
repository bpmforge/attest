// REFERENCE implementation — hidden from models.
// Purpose: prove the acceptance suite is passable and internally consistent
// BEFORE any model is graded against it. A buggy hidden suite would produce a
// fake model failure, which is the exact harness-fault pattern this whole
// benchmark keeps tripping over.
// Also serves as the "known-good" baseline for cross-review grading.

const DAY = 86400000;
const parse = (s) => Date.parse(`${s}T00:00:00Z`);
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => fmt(parse(s) + n * DAY);
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);

const FEE_PER_DAY = 50;
const FEE_THRESHOLD = 1000;      // "more than £10" — strictly greater
const RESERVATION_DAYS = 3;
const SUSPENSION_DAYS = 30;
const PERIOD = { basic: 14, patron: 21 };

const no = (reason, message) => ({ ok: false, reason, message });

export function createLibrary(seed) {
  const members = [...(seed.members || [])];
  const tools = [...(seed.tools || [])];
  const loans = (seed.loans || []).map((l) => ({ ...l }));
  const reservations = [...(seed.reservations || [])];
  const fees = (seed.fees || []).map((f) => ({ ...f }));
  const stocktakeDate = seed.stocktakeDate ?? null;

  let seqLoan = loans.length + 1;
  let seqRes = reservations.length + 1;
  let seqFee = fees.length + 1;
  // memberId -> ISO date until which renewals are suspended
  const suspended = new Map();

  const member = (id) => members.find((m) => m.id === id);
  const tool = (id) => tools.find((t) => t.id === id);
  const activeLoans = (mid) => loans.filter((l) => l.memberId === mid && !l.returnedDate);
  const outstanding = (mid) => fees.filter((f) => f.memberId === mid && !f.paid)
    .reduce((a, f) => a + f.amountPence, 0);
  const onLoan = (tid) => loans.some((l) => l.toolId === tid && !l.returnedDate);
  const liveReservations = (tid, today) => reservations.filter(
    (r) => r.toolId === tid && daysBetween(r.createdDate, today) <= RESERVATION_DAYS);

  return {
    borrow(memberId, toolId, today) {
      const m = member(memberId); const t = tool(toolId);
      if (!m || !t) return no('NOT_FOUND', 'That member or tool is not in our records — please check the number and try again.');
      if (stocktakeDate && today === stocktakeDate) return no('STOCKTAKE_CLOSED', 'We are closed for the annual stocktake today, so nothing can go out.');
      if (t.status === 'maintenance') return no('TOOL_IN_MAINTENANCE', 'This tool is in maintenance and cannot be lent out at the moment.');
      if (onLoan(toolId)) return no('TOOL_UNAVAILABLE', 'This tool is already out on loan to someone else.');
      if (outstanding(memberId) > FEE_THRESHOLD) return no('FEES_OUTSTANDING', 'This member owes more than £10 in unpaid fees, so they cannot borrow until it is settled.');
      if (activeLoans(memberId).length >= PERIOD[m.tier] / 7 * 0 + (m.tier === 'patron' ? 5 : 2)) {
        return no('AT_HOLD_LIMIT', `This member already has the maximum number of tools out for a ${m.tier} membership.`);
      }
      const dueDate = addDays(today, PERIOD[m.tier]);
      const id = `L${seqLoan++}`;
      loans.push({ id, memberId, toolId, startDate: today, dueDate, returnedDate: null, renewed: false });
      return { ok: true, loanId: id, dueDate };
    },

    renew(loanId, today) {
      const l = loans.find((x) => x.id === loanId);
      if (!l) return no('NOT_FOUND', 'We could not find that loan on the system.');
      const m = member(l.memberId);
      if (l.renewed) return no('ALREADY_RENEWED', 'This loan has already been renewed once and cannot be renewed again.');
      const until = suspended.get(l.memberId);
      if (until && daysBetween(until, today) < 0) {
        return no('RENEWAL_SUSPENDED', `This member returned something late, so renewals are paused until ${until}.`);
      }
      if (liveReservations(l.toolId, today).some((r) => r.memberId !== l.memberId)) {
        return no('RESERVED_BY_OTHER', 'Someone else has reserved this tool, so it cannot be renewed.');
      }
      l.dueDate = addDays(l.dueDate, PERIOD[m.tier]);
      l.renewed = true;
      return { ok: true, dueDate: l.dueDate };
    },

    returnTool(loanId, today) {
      const l = loans.find((x) => x.id === loanId);
      if (!l) return no('NOT_FOUND', 'We could not find that loan on the system.');
      const t = tool(l.toolId);
      const late = Math.max(0, daysBetween(l.dueDate, today));
      const feePence = Math.min(late * FEE_PER_DAY, t.replacementValuePence);
      l.returnedDate = today;
      if (late > 0) {
        fees.push({ id: `F${seqFee++}`, memberId: l.memberId, amountPence: feePence, paid: false });
        suspended.set(l.memberId, addDays(today, SUSPENSION_DAYS));
      }
      return { ok: true, feePence };
    },

    reserve(memberId, toolId, today) {
      if (!member(memberId) || !tool(toolId)) return no('NOT_FOUND', 'That member or tool is not in our records.');
      const id = `R${seqRes++}`;
      reservations.push({ id, memberId, toolId, createdDate: today });
      return { ok: true, reservationId: id };
    },

    setMaintenance(actorId, toolId, inMaintenance, _today) {
      const a = member(actorId);
      if (!a) return no('NOT_FOUND', 'We do not recognise that staff member.');
      if (!a.staff) return no('NOT_STAFF', 'Only staff can change whether a tool is in maintenance.');
      const t = tool(toolId);
      if (!t) return no('NOT_FOUND', 'That tool is not in our records.');
      t.status = inMaintenance ? 'maintenance' : 'available';
      return { ok: true };
    },

    waiveFee(actorId, feeId, _today) {
      const a = member(actorId);
      if (!a) return no('NOT_FOUND', 'We do not recognise that staff member.');
      if (!a.staff) return no('NOT_STAFF', 'Only staff can waive a fee.');
      const f = fees.find((x) => x.id === feeId);
      if (!f) return no('NOT_FOUND', 'That fee is not on the system.');
      f.paid = true;
      return { ok: true };
    },

    memberStatus(memberId, today) {
      const m = member(memberId);
      if (!m) return no('NOT_FOUND', 'That member is not in our records.');
      const until = suspended.get(memberId) ?? null;
      const blocked = until && daysBetween(until, today) < 0 ? until : null;
      const owed = outstanding(memberId);
      return {
        ok: true,
        heldCount: activeLoans(memberId).length,
        outstandingPence: owed,
        canBorrow: owed <= FEE_THRESHOLD && activeLoans(memberId).length < (m.tier === 'patron' ? 5 : 2),
        renewalBlockedUntil: blocked,
      };
    },
  };
}
