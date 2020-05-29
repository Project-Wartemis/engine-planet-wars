import Planet from './game/planet';
import Move from './game/move';
import { factory } from './log';
import Army from './game/army';
import Player from './game/player';
import State from './game/state';
import Connection from './networking/connection';
import { ActionMessage, ErrorMessage, StartMessage, StateMessage, StopMessage } from './networking/message';

const log = factory.getLogger('Game');

export default class Game {

  private turn = 0;
  private neutralId: string;
  private planets: Map<number, Planet> =  new Map();
  private armies: Map<number, Army[]> = new Map(); // maps a planet id to a list of armies, only used for fights
  private players: Map<string, Player> = new Map();
  private queuedMoves: Move[] = [];
  private state: State = {
    players: [],
    planets: [],
    moves: [],
  };
  private moveIdCounter = 0;

  constructor(
    private gameId: number,
    private prefix: string,
    private suffix: string,
    private connection: Connection,
  ) {
    this.neutralId = this.paddify(0);
  }

  private broadcastState(): void {
    // TODO move hardcoded limit to a setting that can be changed
    let alivePlayerCount = 0;
    for(const p of this.players.values()) {
      if(!p.dead) {
        alivePlayerCount++;
      }
    }
    if(this.turn >= 999 || alivePlayerCount < 2) {
      this.stop();
    }
    const players: Array<string> = [];
    for(const player of this.players.values()) {
      if(!player.moved) {
        players.push(player.id);
      }
    }
    this.connection.send({
      type: 'state',
      game: this.gameId,
      turn: this.turn,
      players,
      state: this.state,
    } as StateMessage);
  }

  private stop(): void {
    log.info('stopping game ' + this.gameId);
    this.connection.send({
      type: 'stop',
      game: this.gameId,
    } as StopMessage);
  }

  private paddify(id: number): string {
    return this.prefix + id + this.suffix;
  }

  public handleStartMessage(message: StartMessage): void {
    // some configs - TODO move this to the startmessage?
    const planetCount = 10;
    const width = 50;
    const height = 50;

    // players
    for(const id of message.players) {
      this.players.set(this.paddify(id), {
        id: this.paddify(id),
        moved: false,
        dead: false,
      } as Player);
    }

    // neutral player
    this.players.set(this.neutralId, {
      id: this.neutralId,
      moved: true,
      dead: true,
    } as Player);

    [...Array(planetCount).keys()].forEach(i => {
      this.planets.set(i, {
        id: i,
        name: 'planet' + i,
        x: Math.random() * width,
        y: Math.random() * height,
        player: i < planetCount - message.players.length ? this.neutralId : this.paddify(message.players[planetCount - i - 1]),
        ships: 5,
      } as Planet);
    });

    for(const id of this.players.keys()) {
      this.state.players.push(id);
    }

    for(const planet of this.planets.values()) {
      this.state.planets.push(planet);
      this.armies.set(planet.id, []);
    }

    this.broadcastState();
  }

  public handleActionMessage(message: ActionMessage): void {
    try {
      const player = this.players.get(message.player);
      if(!player) {
        return;
      }

      for(const move of message.action.moves) {
        if(!this.validateAndFillMove(message.player, move)) {
          continue;
        }
        this.queuedMoves.push(move);
      }

      player.moved = true;

      let playerLeftToMove = false;
      for(const p of this.players.values()) {
        if(!p.dead && !p.moved) {
          playerLeftToMove = true;
          log.debug(`still a player left to move: ${p.id}`);
          break;
        }
      }
      if(playerLeftToMove) {
        return;
      }

      this.processTurn();
      this.broadcastState();
    } catch(error) {
      this.connection.send({
        type: 'error',
        content: 'error while processing the move, please check your formatting'
      } as ErrorMessage);
      log.info(`Error while processing a move of a player: [${error}]`);
    }
  }

  private validateAndFillMove(player: string, move: Move): boolean {
    if(move.target === move.source) {
      return false; // this makes no sense
    }
    if(move.ships === 0) {
      return false; // cannot send 0 ships
    }
    const source = this.planets.get(move.source);
    if(!source) {
      return false; // source does not exist
    }
    if(source.player !== player) {
      return false; // not under your command
    }
    const target = this.planets.get(move.target);
    if(!target) {
      return false; // target does not exist
    }
    if(move.ships > source.ships) {
      return false; // trying to send more than is available
    }
    const dx = source.x - target.x;
    const dy = source.y - target.y;
    move.id = this.moveIdCounter++;
    move.player = player;
    move.turns = Math.ceil(Math.sqrt(dx * dx + dy * dy));
    return true;
  }

  private processTurn(): void {
    log.debug('processing next turn');
    this.turn++;
    // planets
    for(const planet of this.state.planets) {
      this.processPlanet(planet);
    }
    // new moves
    for(const move of this.queuedMoves) {
      this.processNewMove(move);
    }
    // armies
    for(const planet of this.state.planets) {
      this.initialiseArmy(planet);
    }
    // moves
    for(const move of this.state.moves) {
      this.processMove(move);
    }
    this.state.moves = this.state.moves.filter(move => move.turns);
    this.queuedMoves = [];
    // fights
    for(const planet of this.state.planets) {
      this.processFight(planet);
    }
    // player status updates
    for(const player of this.players.values()) {
      this.processPlayer(player);
    }
  }

  private processPlanet(planet: Planet): void {
    // grow and reset armies
    if(planet.player !== this.neutralId) {
      planet.ships++;
    }
  }

  private processNewMove(move: Move): void {
    const source = this.planets.get(move.source);
    if(!source) {
      log.error('A move got through that had an invalid source, ignoring but this should be fixed');
      return;
    }
    source.ships -= move.ships;
    this.state.moves.push(move);
  }

  private initialiseArmy(planet: Planet): void {
    this.armies.set(planet.id, [{
      player: planet.player,
      ships: planet.ships,
    } as Army]);
  }

  private processMove(move: Move): void {
    move.turns--;
    if(move.turns) {
      return;
    }
    const armies = this.armies.get(move.target);
    if(!armies) {
      log.error(`No armies present on planet ${move.target}, ignoring but this should be fixed`);
      return;
    }
    const match = armies.find(a => a.player === move.player);
    if(match) {
      match.ships += move.ships;
    } else {
      armies.push({
        player: move.player,
        ships: move.ships,
      } as Army);
    }
  }

  private processFight(planet: Planet): void {
    const armies = this.armies.get(planet.id);
    if(!armies) {
      log.error(`No armies present on planet ${planet.id}, ignoring but this should be fixed`);
      return;
    }
    if(armies.length < 2) {
      planet.ships = armies[0].ships;
      planet.player = armies[0].player;
      return;
    }
    armies.sort((a, b) => b.ships - a.ships);
    planet.ships = armies[0].ships - armies[1].ships;
    planet.player = planet.ships === 0 ? this.neutralId : armies[0].player;
  }

  private processPlayer(player: Player): void {
    if(player.id === this.neutralId) {
      return; // do not update neutral player
    }
    player.dead = true;

    if(this.state.planets.filter(planet => planet.player === player.id).length) {
      player.dead = false;
    }
    if(!player.dead) {
      player.moved = false; // only expect a move if the player has planets
    }
    if(this.state.moves.filter(move => move.player === player.id).length) {
      player.dead = false;
    }
  }

}
