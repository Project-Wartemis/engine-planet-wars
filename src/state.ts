import { Army, Move } from './interface';
import { Planet } from './planet';
import { factory } from './log';

const log = factory.getLogger('State');

export class State {

  private moveIdCounter = 0;
  private planetsById: Map<number, Planet> = new Map();

  public planets: Array<Planet>;
  public moves: Array<Move> = [];

  constructor(
    private neutralPlayer: string,
    public players: Array<string>,
  ) {
    const planetCount = 10;
    const width = 50;
    const height = 50;

    this.planets =  [...Array(planetCount).keys()].map(i => new Planet(
      i, // id
      'planet' + i, // name
      Math.random() * width, // x
      Math.random() * height, // y
      i < planetCount - players.length ? this.neutralPlayer : players[planetCount - i - 1], // player
      5, // ships
    ));

    this.players.push(this.neutralPlayer);

    for(const planet of this.planets) {
      this.planetsById.set(planet.id, planet);
    }
  }

  public toJSON(): object {
    return {
      players: this.players,
      planets: this.planets,
      moves: this.moves,
    };
  }

  // util

  public getPlanetById(id: number): Planet | undefined {
    return this.planetsById.get(id);
  }

  public getNextMoveId(): number {
    return this.moveIdCounter++;
  }

  // processing

  public processMoves(moves: Array<Move>): void {
    // planets
    for(const planet of this.planets) {
      this.processPlanet(planet);
    }
    // new moves
    for(const move of moves) {
      this.processNewMoves(move);
    }
    // reset armies
    for(const planet of this.planets) {
      planet.resetArmies();
    }
    // moves
    for(const move of this.moves) {
      this.processMove(move);
    }
    this.moves = this.moves.filter(move => move.turns);
    // fights
    for(const planet of this.planets) {
      planet.processFight(this.neutralPlayer);
    }
  }

  private processPlanet(planet: Planet): void {
    // grow armies
    if(planet.player !== this.neutralPlayer) {
      planet.ships++;
    }
  }

  private processNewMoves(move: Move): void {
    const source = this.getPlanetById(move.source);
    if(!source) {
      log.error('A move got through that had an invalid source, ignoring but this should be fixed');
      return;
    }
    source.ships -= move.ships;
    this.moves.push(move);
  }

  private processMove(move: Move): void {
    move.turns--;
    if(move.turns) {
      return;
    }
    const target = this.getPlanetById(move.target);
    if(!target) {
      log.error('A move got through that had an invalid target, ignoring but this should be fixed');
      return;
    }
    target.addArmy({
      player: move.player,
      ships: move.ships,
    } as Army);
  }

}
