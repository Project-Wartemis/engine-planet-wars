export interface Player {
  id: string;
  dead: boolean;
}

export interface Planet {
  id: number;
  name: string;
  x: number;
  y: number;
  player: string;
  ships: number;
}

export interface Move {
  id: number;
  source: number;
  target: number;
  player: string;
  ships: number;
  turns: number;
}

export interface Army {
  player: string;
  ships: number;
}

export interface Action {
  moves: Array<ActionMove>;
}

export interface ActionMove {
  source: number;
  target: number;
  ships: number;
}
