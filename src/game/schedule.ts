import { BALANCE, DEFAULT_RENDEZVOUS } from '../constants';
import type {
  GameDay,
  NodeId,
  PlayerID,
  ScheduleProgress,
  StarCalculation,
  TerminalOutcome,
  TruthState,
} from '../types';
import { refreshPositionKnowledge, resolveNightEconomy } from './actions';
import { resolveNightRadio } from './facilities';
import {
  BRIDGE_SPAN,
  DAY_2_EDGE,
  RENDEZVOUS_CENTRE_NODES,
} from './map';

const PLAYER_IDS: PlayerID[] = ['0', '1', '2', '3'];

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface DayScheduleEntry {
  day: GameDay;
  event: string;
  severedEdge: string | null;
  exposureNight: boolean;
  rendezvousChange: boolean;
  communication: {
    mobileData: 'DOWN' | 'RADIUS_2_ZONES';
    mobileVoiceDropRate: number | null;
    smsDropRate: number | null;
    landlineUp: boolean;
    batteryCostMultiplier: 1 | 2;
    radioBatteryCost: 1;
  };
}

/** Authoritative seven-day event summary; method delivery details remain in comms.ts. */
export const SEVEN_DAY_SCHEDULE: readonly DayScheduleEntry[] = [
  {
    day: 1,
    event: 'Grid down',
    severedEdge: null,
    exposureNight: false,
    rendezvousChange: false,
    communication: {
      mobileData: 'DOWN', mobileVoiceDropRate: BALANCE.dropRate.MOBILE_VOICE_DAY_1, smsDropRate: 0,
      landlineUp: true, batteryCostMultiplier: 1, radioBatteryCost: BALANCE.communicationPrice.RADIO_NIGHTLY,
    },
  },
  {
    day: 2,
    event: 'Backups exhausted',
    severedEdge: DAY_2_EDGE,
    exposureNight: true,
    rendezvousChange: false,
    communication: {
      mobileData: 'DOWN', mobileVoiceDropRate: null, smsDropRate: BALANCE.dropRate.SMS_DAY_2,
      landlineUp: true, batteryCostMultiplier: 1, radioBatteryCost: BALANCE.communicationPrice.RADIO_NIGHTLY,
    },
  },
  {
    day: 3,
    event: 'Bridge span severed',
    severedEdge: BRIDGE_SPAN,
    exposureNight: true,
    rendezvousChange: false,
    communication: {
      mobileData: 'DOWN', mobileVoiceDropRate: null, smsDropRate: null,
      landlineUp: false, batteryCostMultiplier: 1, radioBatteryCost: BALANCE.communicationPrice.RADIO_NIGHTLY,
    },
  },
  {
    day: 4,
    event: 'Official rendezvous changes',
    severedEdge: null,
    exposureNight: false,
    rendezvousChange: true,
    communication: {
      mobileData: 'DOWN', mobileVoiceDropRate: null, smsDropRate: null,
      landlineUp: false, batteryCostMultiplier: 1, radioBatteryCost: BALANCE.communicationPrice.RADIO_NIGHTLY,
    },
  },
  {
    day: 5,
    event: 'Power scarcity',
    severedEdge: null,
    exposureNight: true,
    rendezvousChange: false,
    communication: {
      mobileData: 'DOWN', mobileVoiceDropRate: null, smsDropRate: null,
      landlineUp: false, batteryCostMultiplier: BALANCE.communicationPrice.DAY_5_MULTIPLIER,
      radioBatteryCost: BALANCE.communicationPrice.RADIO_NIGHTLY,
    },
  },
  {
    day: 6,
    event: 'Cell-on-wheels online',
    severedEdge: null,
    exposureNight: false,
    rendezvousChange: false,
    communication: {
      mobileData: 'RADIUS_2_ZONES', mobileVoiceDropRate: null, smsDropRate: null,
      landlineUp: false, batteryCostMultiplier: 1, radioBatteryCost: BALANCE.communicationPrice.RADIO_NIGHTLY,
    },
  },
  {
    day: 7,
    event: 'Final convergence',
    severedEdge: null,
    exposureNight: false,
    rendezvousChange: false,
    communication: {
      mobileData: 'DOWN', mobileVoiceDropRate: null, smsDropRate: null,
      landlineUp: false, batteryCostMultiplier: 1, radioBatteryCost: BALANCE.communicationPrice.RADIO_NIGHTLY,
    },
  },
] as const;

export interface ShuffleRandom {
  Shuffle<T>(items: T[]): T[];
}

function progressFor(G: TruthState): ScheduleProgress {
  return G.scheduleProgress ??= {
    appliedDays: [],
    rendezvousChanged: G.rendezvous !== DEFAULT_RENDEZVOUS,
  };
}

function asGameDay(day: number): GameDay | undefined {
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day as GameDay : undefined;
}

/** Apply each missed one-shot topology event through the current day. */
export function applyScheduledDay(G: TruthState, throughDay = G.day): void {
  const lastDay = asGameDay(Math.min(throughDay, 7));
  if (!lastDay) return;
  const progress = progressFor(G);
  for (const entry of SEVEN_DAY_SCHEDULE) {
    if (entry.day > lastDay || progress.appliedDays.includes(entry.day)) continue;
    if (entry.severedEdge && !G.severedEdges.includes(entry.severedEdge)) {
      G.severedEdges.push(entry.severedEdge);
    }
    progress.appliedDays.push(entry.day);
  }
}

/**
 * Draw the Day 4 rendezvous once. A non-default value means the legacy M4 block
 * already performed the draw, so this helper records it instead of drawing again.
 */
export function changeRendezvousForDayFour(
  G: TruthState,
  random: ShuffleRandom,
): NodeId | undefined {
  if (G.day !== 4) return undefined;
  const progress = progressFor(G);
  if (progress.rendezvousChanged || G.rendezvous !== DEFAULT_RENDEZVOUS) {
    progress.rendezvousChanged = true;
    return G.rendezvous;
  }
  const candidates = RENDEZVOUS_CENTRE_NODES.filter((node) => node !== G.rendezvous);
  const selected = random.Shuffle([...candidates])[0];
  if (!selected) throw new Error('No Day 4 rendezvous candidate');
  G.rendezvous = selected;
  progress.rendezvousChanged = true;
  return selected;
}

export function calculateStars(G: TruthState): StarCalculation {
  const survivors = PLAYER_IDS.filter((id) => G.players[id].alive);
  const allPlayersSurvived = survivors.length === PLAYER_IDS.length;
  const allSurvivorsAtTrueRendezvous = survivors.length > 0
    && survivors.every((id) => G.players[id].location === G.rendezvous);
  const stars: StarCalculation['stars'] = survivors.length === 0
    ? 0
    : !allPlayersSurvived
      ? 1
      : allSurvivorsAtTrueRendezvous
        ? 3
        : 2;
  return {
    survivorCount: survivors.length,
    allPlayersSurvived,
    allSurvivorsAtTrueRendezvous,
    stars,
  };
}

function revealOutcome(
  G: TruthState,
  reason: TerminalOutcome['reason'],
): TerminalOutcome {
  const calculation = calculateStars(G);
  const players = Object.fromEntries(PLAYER_IDS.map((id) => {
    const player = G.players[id];
    return [id, {
      character: player.character,
      alive: player.alive,
      finalLocation: player.location,
      bodyLocation: player.alive ? null : player.location,
      inventory: { ...player.inventory },
      starvationNights: player.starvationNights,
      discoveries: {
        knowledge: cloneSerializable(player.knowledge),
        rendezvousKnowledge: player.rendezvousKnowledge
          ? cloneSerializable(player.rendezvousKnowledge)
          : null,
        bulletinNotebook: cloneSerializable(player.bulletinNotebook ?? []),
      },
    }];
  })) as TerminalOutcome['players'];
  return {
    result: calculation.stars === 0 ? 'LOSS' : 'WIN',
    reason,
    endedAfterNight: G.day,
    trueRendezvous: G.rendezvous,
    calculation,
    players,
  };
}

/** Set and return an immediate terminal loss whenever no living player remains. */
export function resolveImmediateLoss(G: TruthState): TerminalOutcome | undefined {
  if (G.terminalOutcome) return G.terminalOutcome;
  if (PLAYER_IDS.some((id) => G.players[id].alive)) return undefined;
  return G.terminalOutcome = revealOutcome(G, 'ALL_DEAD');
}

/** Score only once night 7 has fully resolved. */
export function scoreAfterNightSeven(G: TruthState): TerminalOutcome | undefined {
  if (G.terminalOutcome) return G.terminalOutcome;
  if (G.day !== 7) return undefined;
  return G.terminalOutcome = revealOutcome(G, 'NIGHT_7_COMPLETE');
}

/**
 * Pinned night order: Food/exposure/death, Day 4 draw, radio/official board,
 * terminal check, then final scoring after night 7. Day increment remains the
 * phase owner's job.
 */
export function resolveScheduledNight(
  G: TruthState,
  random: ShuffleRandom,
): TerminalOutcome | undefined {
  resolveNightEconomy(G);
  changeRendezvousForDayFour(G, random);
  resolveNightRadio(G);
  refreshPositionKnowledge(G);
  return resolveImmediateLoss(G) ?? scoreAfterNightSeven(G);
}
