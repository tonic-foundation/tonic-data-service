import readline from 'readline';

/**
 * validate postgres date (pg does this but seems flexible so best to do it here)
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

export function prompt(query: string): Promise<unknown> {
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
