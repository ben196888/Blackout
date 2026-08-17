import { INVALID_MOVE } from 'boardgame.io/core';
import type { MoveFn } from 'boardgame.io';
import type { TruthState } from '../types';

export class RuleError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RuleError';
  }
}

export function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RuleError(code);
}

export function withErrorBoundary(
  move: MoveFn<TruthState>,
): MoveFn<TruthState> {
  return (context, ...args) => {
    try {
      return move(context, ...args);
    } catch (error) {
      if (error instanceof RuleError) {
        context.log.setMetadata({ ruleError: error.code });
        return INVALID_MOVE;
      }
      console.error('Unexpected game move failure', error);
      throw error;
    }
  };
}
