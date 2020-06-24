import { Engine } from 'wartemis';
import { Action, ActionMove, Move } from './interface';
import { State } from './state';
import { factory } from './log';

const log = factory.getLogger('EnginePlanetWars');

export class EnginePlanetWars extends Engine<State, Action> {

  constructor() {
    super('Planet Wars');
  }

  // necessary methods

  public generateInitialState(players: Array<string>): State {
    return new State(this.neutralPlayer, players);
  }

  public getPlayersToMove(state: State): Array<string> {
    const playersPlanet = state.planets.map(p => p.player);
    const playersUnique = new Set(playersPlanet);
    playersUnique.delete(this.neutralPlayer);
    return Array.from(playersUnique);
  }

  public validateAction(state: State, player: string, action: Action): string | null {
    for(const move of action.moves) {
      const error = this.validateMove(state, player, move);
      if(error) {
        return error;
      }
    }
    return null;
  }

  public processActions(state: State, actions: Map<string, Action>): State {
    const moves = this.convertActionsToMoves(state, actions);
    state.processMoves(moves);
    return state;
  }

  public isGameOver(state: State, turn: number): boolean {
    if(turn >= 200) {
      return true;
    }
    const playersPlanet = state.planets.map(p => p.player);
    const playersMove = state.moves.map(m => m.player);
    const playersUnique = new Set(playersPlanet.concat(playersMove));
    playersUnique.delete(this.neutralPlayer);
    return playersUnique.size < 2;
  }

  // helper methods

  private validateMove(state: State, player: string, move: ActionMove): string | null {
    if(move.target === move.source) {
      return 'The target must be different from the source in a move';
    }
    if(move.ships === 0) {
      return 'The amount of ships in a move cannot be 0';
    }
    const source = state.getPlanetById(move.source);
    if(!source) {
      return `Source planet ${move.source} is not valid`;
    }
    if(source.player !== player) {
      return `Source planet ${source.id} is not under your control`;
    }
    const target = state.getPlanetById(move.target);
    if(!target) {
      return `Target planet ${move.target} is not valid`;
    }
    if(move.ships > source.ships) {
      return `source planet ${target.id} cannot send ${move.ships}, only ${source.ships} available`;
    }
    return null;
  }

  private convertActionsToMoves(state: State, actions: Map<string, Action>): Array<Move> {
    let result: Array<Move> = [];
    for(const entry of actions) {
      result = result.concat(this.convertActionToMoves(state, entry[0], entry[1]));
    }
    return result;
  }

  private convertActionToMoves(state: State, player: string, action: Action): Array<Move> {
    const result: Array<Move> = [];
    for(const actionMove of action.moves) {
      const move = this.convertMoveActionToMove(state, player, actionMove);
      if(move) {
        result.push(move);
      }
    }
    return result;
  }

  private convertMoveActionToMove(state: State, player: string, actionMove: ActionMove): Move | null {
    const source = state.getPlanetById(actionMove.source);
    const target = state.getPlanetById(actionMove.target);
    if(!source) {
      log.error('A move got through that had an invalid source, ignoring but this should be fixed');
      return null;
    }
    if(!target) {
      log.error('A move got through that had an invalid target, ignoring but this should be fixed');
      return null;
    }
    const dx = source.x - target.x;
    const dy = source.y - target.y;
    return {
      id: state.getNextMoveId(),
      source: source.id,
      target: target.id,
      player,
      ships: actionMove.ships,
      turns: Math.ceil(Math.sqrt(dx * dx + dy * dy))
    } as Move;
  }

}
