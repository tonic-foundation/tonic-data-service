import readline from 'readline';

/**
 * validate postgres date (format only) (pg does this but seems flexible so best
 * to do it here)
 */
export function assertValidDate(s: string, exit = true): boolean {
  if (!s.match(/\d\d\d\d-\d\d-\d\d/)?.length) {
    console.error('Invalid date, must be YYYY-MM-DD');
    if (exit) {
      process.exit(1);
    }
    return false;
  }
  return true;
}

export function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Batch into n-sized buckets. Use for (eg) batching payouts for nearsend.
 *
 * NB: return is array of (array of) references, be careful mutating.
 */
export function batch<T>(xs: T[], n = 20): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < xs.length; i += n) {
    batches.push(xs.slice(i, i + n));
  }
  return batches;
}
