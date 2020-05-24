import Planet from './game/planet';
import Move from './game/move';
import { factory } from './log';
import Army from './game/army';
import Player from './game/player';
import State from './game/state';
import Connection from './networking/connection';
import { ActionMessage, ErrorMessage, StartMessage, StateMessage } from './networking/message';

const log = factory.getLogger('Game');

export default class Game extends Connection {

  private turn = 0;
  private planets: Map<number, Planet> =  new Map();
  private armies: Map<number, Army[]> = new Map(); // maps a planet id to a list of armies, only used for fights
  private players: Map<number, Player> = new Map();
  private queuedMoves: Move[] = [];
  private state: State = {
    players: [],
    planets: [],
    moves: [],
  };
  private moveIdCounter = 0;

  constructor(
    public url: string,
  ) {
    super(url);
    this.registerHandler('start', this.handleStartMessage.bind(this));
    this.registerHandler('action', this.handleActionMessage.bind(this));
  }

  private broadcastState(): void {
    const players: number[] = [];
    for(const player of this.players.values()) {
      if(!player.moved) {
        players.push(player.id);
      }
    }
    this.send({
      type: 'state',
      turn: this.turn,
      players,
      state: this.state,
    } as StateMessage);
  }

  private handleStartMessage(raw: object): void {
    log.info('Starting new game!');
    // some configs - TODO move this to the startmessage?
    const planetCount = 10;
    const width = 50;
    const height = 50;

    const message: StartMessage = Object.assign({} as StartMessage, raw);

    // players
    console.log(message.players);
    for(const id of message.players) {
      this.players.set(id, {
        id,
        moved: false,
        dead: false,
      } as Player);
    }

    // neutral player
    this.players.set(0, {
      id: 0,
      moved: true,
      dead: true,
    } as Player);

    [...Array(planetCount).keys()].forEach(i => {
      this.planets.set(i, {
        id: i,
        name: 'planet' + i,
        x: Math.random() * width,
        y: Math.random() * height,
        player: i < planetCount - message.players.length ? 0 : message.players[planetCount - i - 1],
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

  private handleActionMessage(raw: object): void {
    try {
      const message: ActionMessage = Object.assign({} as ActionMessage, raw);
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

      // TODO move hardcoded limit to a setting that can be changed
      if(this.turn >= 199) {
        this.disconnect();
      }

      let alivePlayerCount = 0;
      for(const p of this.players.values()) {
        if(!p.dead) {
          alivePlayerCount++;
        }
      }
      if(alivePlayerCount < 2) {
        this.disconnect();
      }
    } catch(error) {
      this.send({
        type: 'error',
        content: 'error while processing the move, please check your formatting'
      } as ErrorMessage);
      log.info(`Error while processing a move of a player: [${error}]`);
    }
  }

  private validateAndFillMove(player: number, move: Move): boolean {
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
    if(planet.player) {
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
    planet.player = planet.ships === 0 ? 0 : armies[0].player;
  }

  private processPlayer(player: Player): void {
    if(!player.id) {
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
