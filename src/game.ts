import Planet from './game/planet';
import Move from './game/move';
import { factory } from './log';
import Army from './game/army';
import Player from './game/player';
import State from './game/state';
import Connection from './networking/connection';
import { Message, ActionMessage, ErrorMessage, StartMessage, StateMessage } from './networking/message';

const log = factory.getLogger('Game');

export default class Game extends Connection {

  private turn = 0;
  private planets: Record<number,Planet> = {};
  private armies: Record<number,Army[]> = {}; // maps a planet id to a list of armies, only used for fights
  private players: Record<number,Player> = {};
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
    for(let id in this.players) {
      if(!this.players[id].moved) {
        players.push(+id);
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
    for(let id of message.players) {
      this.players[id] = {
        id,
        moved: false,
        dead: false,
      }
    }

    // neutral player
    this.players[0] = {
      id: 0,
      hasPlanets: false,
      moved: true,
      dead: true,
    } as Player;

    this.planets = [...Array(planetCount).keys()].map(i => ({
      id: i,
      name: 'planet'+i,
      x: Math.random()*width,
      y: Math.random()*height,
      player: i < planetCount - message.players.length ? 0 : message.players[planetCount - i - 1],
      ships: 5,
    } as Planet));

    for(let id in this.players) {
      this.state.players.push(+id);
    }

    for(let id in this.planets) {
      this.state.planets.push(this.planets[id]);
    }

    for(let planet of this.state.planets) {
      this.armies[planet.id] = [];
    }

    this.broadcastState();
  }

  private handleActionMessage(raw: object): void {
    try {
      const message: ActionMessage = Object.assign({} as ActionMessage, raw);

      for(let move of message.action.moves) {
        if(!this.validateAndFillMove(message.player, move)) {
          continue;
        }
        this.queuedMoves.push(move);
      }

      this.players[message.player].moved = true;

      let playerLeftToMove = false;
      for(let id in this.players) {
        if(!this.players[id].dead && !this.players[id].moved) {
          playerLeftToMove = true;
          log.info('still a player left to move :/ '+id);
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
      for(let id in this.players) {
        if(!this.players[id].dead) {
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
    if(!this.planets[move.source]) {
      return false; // source does not exist
    }
    const source = this.planets[move.source];
    if(source.player !== player) {
      return false; // not under your command
    }
    if(!this.planets[move.target]) {
      return false; // target does not exist
    }
    const target = this.planets[move.target];
    if(move.ships > source.ships) {
      return false; // trying to send more than is available
    }
    const dx = source.x - target.x;
    const dy = source.y - target.y;
    move.id = this.moveIdCounter++;
    move.player = player;
    move.turns = Math.ceil(Math.sqrt(dx*dx + dy*dy));
    return true;
  }

  private processTurn(): void {
    log.info('processing next turn');
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
    for(const id in this.players) {
      this.processPlayer(this.players[id]);
    }
  }

  private processPlanet(planet: Planet): void {
    // grow and reset armies
    if(planet.player) {
      planet.ships++;
    }
  }

  private processNewMove(move: Move): void {
    this.planets[move.source].ships -= move.ships;
    this.state.moves.push(move);
  }

  private initialiseArmy(planet: Planet): void {
    this.armies[planet.id] = [{
      player: planet.player,
      ships: planet.ships,
    } as Army];
  }

  private processMove(move: Move): void {
    move.turns--;
    if(move.turns) {
      return;
    }
    const match = this.armies[move.target].find(a => a.player === move.player);
    if(match) {
      match.ships += move.ships;
    } else {
      this.armies[move.target].push({
        player: move.player,
        ships: move.ships,
      } as Army);
    }
  }

  private processFight(planet: Planet): void {
    if(this.armies[planet.id].length < 2) {
      planet.ships = this.armies[planet.id][0].ships;
      planet.player = this.armies[planet.id][0].player;
      return;
    }
    this.armies[planet.id].sort((a,b) => b.ships - a.ships);
    planet.ships = this.armies[planet.id][0].ships - this.armies[planet.id][1].ships;
    planet.player = planet.ships === 0 ? 0 : this.armies[planet.id][0].player;
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
