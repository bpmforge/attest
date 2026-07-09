// T22.19 fixture: same shape as the red fixture but the loop body has no
// try/catch, and identifiers deliberately use underscore-joined names that
// look like the flagged keywords as *substrings* (for_loop, my_function).
// A naive [[:punct:]]-based portability fix for \b would wrongly treat "_"
// as a boundary character and false-positive here; this fixture proves the
// real fix does not.
export function for_loop_helper(items: number[]) {
  for (const item of items) {
    handle(item);
  }
}

export function my_function(items: number[]) {
  return items.map((item) => item);
}

function handle(item: number) {
  return item;
}
