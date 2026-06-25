// §14.3 — generic Brent root finder.
// Returns null on no sign change in [a,b] or on divergence/non-convergence.

export function brent(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-10,
  maxIter = 200,
): number | null {
  let fa = f(a);
  let fb = f(b);

  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;

  // Exact roots at the endpoints.
  if (fa === 0) return a;
  if (fb === 0) return b;

  // No sign change → no bracketed root.
  if (fa * fb > 0) return null;

  // Ensure |f(b)| <= |f(a)| (b is the best estimate of the root).
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }

  let c = a;
  let fc = fa;
  let d = b - a;
  let mflag = true;

  for (let iter = 0; iter < maxIter; iter++) {
    if (fb === 0) return b;
    if (Math.abs(b - a) < tol) return b;

    let s: number;
    if (fa !== fc && fb !== fc) {
      // Inverse quadratic interpolation.
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      // Secant method.
      s = b - fb * (b - a) / (fb - fa);
    }

    const lo = (3 * a + b) / 4;
    const cond1 = !((s > Math.min(lo, b) && s < Math.max(lo, b)));
    const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    const cond4 = mflag && Math.abs(b - c) < tol;
    const cond5 = !mflag && Math.abs(c - d) < tol;

    if (cond1 || cond2 || cond3 || cond4 || cond5) {
      // Bisection.
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }

    const fs = f(s);
    if (!Number.isFinite(fs)) return null;

    d = c;
    c = b;
    fc = fb;

    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }

    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }

  // Did not converge within maxIter.
  if (Math.abs(fb) < 1e-8) return b;
  return null;
}
