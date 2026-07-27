# Client brief — Thornbury Community Tool Library

We lend power tools and garden equipment to members. Everything is on paper and
it has stopped working. We need a small backend service.

This is the brief as the client wrote it. It is deliberately not a spec — some
of it is ambiguous, and at least one rule interacts badly with another. We
expect the team to surface that rather than silently pick something.

## What we do

Members borrow tools. Staff manage the catalogue and sort out problems.

## Rules as we understand them

1. Members are either **basic** or **patron**. Basic members may hold **2** tools
   at once; patrons **5**.
2. Standard loan is **14 days**. Patrons get **21 days**.
3. Overdue tools accrue **£0.50 per day late**, capped at the tool's
   **replacement value**.
4. A tool marked **in maintenance** cannot be lent out.
5. A loan may be **renewed once**, and only if nobody has reserved that tool.
   A renewal extends by another full loan period.
6. A reservation **expires after 3 days** if the member doesn't collect.
7. A member owing more than **£10** in unpaid fees cannot borrow anything.
8. Only **staff** may put a tool into maintenance or waive a fee.
9. We close for **annual stocktake** — no loans go out that day.
10. If a member returns something late, they **lose renewal privileges for 30
    days**.

## What we need

A service we can call from a till app. Members, tools, loans, reservations,
fees. It must be obvious when someone is refused and why — our volunteers are
not technical and "400 Bad Request" is not an answer they can give someone at
the counter.

## What we don't need yet

Payments, email, a web UI, or a mobile app. Just the service and its data.

## Notes from the trustees

- We got burned before by someone who could edit fees from the public till.
  Whatever you build, that must not be possible.
- Money must never be wrong. We would rather refuse a loan than miscount a fee.
- We are a charity. Keep it simple enough that a volunteer developer can pick it
  up next year.
