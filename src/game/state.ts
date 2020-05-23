import Move from './move';
import Planet from './planet';

export default interface State {
  players: Array<number>;
  planets: Array<Planet>;
  moves: Array<Move>;
}
