import Move from '../game/move';
import State from '../game/state';

export interface Message {
  type: string;
}

export interface ActionMessage extends Message {
  game: number;
  player: string;
  action: {
    moves: Array<Move>;
  };
}

export interface ErrorMessage extends Message {
  content: string;
}

export interface RegisterMessage extends Message {
  clientType: string;
  name: string;
}

export interface StartMessage extends Message {
  game: number;
  players: Array<number>;
  prefix: string;
  suffix: string;
}

export interface StateMessage extends Message {
  game: number;
  turn: number;
  players: Array<string>;
  state: State;
}

export interface StopMessage extends Message {
  game: number;
}
