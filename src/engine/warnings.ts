// Warning collection. No console.* anywhere in the engine — warnings are
// collected into returned `warnings` arrays.

export type WarningCode =
  | 'concentration_produced_negative_value'
  | 'negative_nav_clamped'
  | 'cost_basis_clamped'
  | 'actuals_override_anchor_conflict'
  | 'actuals_above_terminal'
  | 'pic_above_terminal_flat_forward'
  | 'fx_rate_missing'
  | 'fx_rate_inverted'
  | 'overcalled'
  | 'irr_not_converged';

export interface Warning {
  code: WarningCode;
  message: string;
  /** Optional context: which scenario / quarter / fund. */
  context?: Record<string, string | number>;
}

export function pushWarning(
  warnings: Warning[],
  code: WarningCode,
  message: string,
  context?: Record<string, string | number>,
): void {
  warnings.push({ code, message, ...(context ? { context } : {}) });
}
