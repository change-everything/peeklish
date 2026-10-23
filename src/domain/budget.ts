export type BudgetState = { chars: number; keys: string[] };

export function nextBudget(
  state: BudgetState,
  key: string,
  chars: number,
  max: number,
): { state: BudgetState; status: 'ok' | 'duplicate' | 'budget' } {
  if (state.keys.includes(key)) return { state, status: 'duplicate' };
  if (state.chars >= max || state.chars + chars > max) return { state, status: 'budget' };
  return {
    state: { chars: state.chars + chars, keys: [...state.keys, key] },
    status: 'ok',
  };
}
