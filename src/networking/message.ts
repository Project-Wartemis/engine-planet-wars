import Move from '../game/move';
import State from '../game/state';

export interface Message {
  type: string;
}

export interface ActionMessage extends Message {
  player: number;
  action: {
    moves: Array<Move>;
  };
}

export interface ErrorMessage extends Message {
  content: string;
}

export interface InviteMessage extends Message {
  client: number;
  room: number;
  name: string;
}

export interface RegisterMessage extends Message {
  clientType: string;
  name: string;
}

export interface StartMessage extends Message {
  players: Array<number>;
}

export interface StateMessage extends Message {
  turn: number;
  players: Array<number>;
  state: State;
}
