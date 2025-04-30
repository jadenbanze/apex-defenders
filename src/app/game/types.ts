export enum ManType {
  SUPER = 'super',
  MEDIUM = 'medium',
  SMALL = 'small',
}

export interface CharacterStats {
  health: number;
  maxHealth: number;
  damage: number;
  speed: number; // Movement or attack speed
}

export interface ManConfig {
  type: ManType;
  stats: CharacterStats;
}

export interface GorillaConfig {
  stats: CharacterStats;
}

export interface GameConfig {
  superMenCount: number;
  mediumMenCount: number;
  smallMenCount: number;
  strategy: string;
}

// Define available strategy types
export enum StrategyType {
  RANDOM = 'random',
  SURROUND = 'surround',
  FLANK = 'flank',
  PHALANX = 'phalanx',
}

// Define stats for each type
export const GORILLA_STATS: CharacterStats = {
  maxHealth: 500,
  health: 500,
  damage: 20,
  speed: 50, // Slower speed value
};

export const SUPER_MAN_STATS: CharacterStats = {
  maxHealth: 50,
  health: 50,
  damage: 8,
  speed: 90, // Slightly slower than medium
};

export const MEDIUM_MAN_STATS: CharacterStats = {
  maxHealth: 30,
  health: 30,
  damage: 4, // Reduced from 5
  speed: 100,
};

export const SMALL_MAN_STATS: CharacterStats = {
  maxHealth: 15,
  health: 15,
  damage: 2, // Reduced from 3
  speed: 150, // Still fast
}; 