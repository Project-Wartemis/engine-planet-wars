import Game from './game';
import Connection from './networking/connection';
import { ActionMessage, StartMessage } from './networking/message';
import { factory } from './log';

const log = factory.getLogger('App');

let URL = 'https://localhost:8080/socket';
// const URL = 'https://api.wartemis.com/socket';

console.log(process.env.WARTEMIS_ENV);
if(process.env.WARTEMIS_ENV === 'BUILD') {
  URL = 'https://pw-backend/socket';
}

const games: Map<number, Game> = new Map();

const connection = new Connection(URL)
  .registerHandler('start', handleStartMessage)
  .registerHandler('action', handleActionMessage);

function handleStartMessage(raw: object): void {
  const message: StartMessage = Object.assign({} as StartMessage, raw);
  const game = new Game(message.game, message.prefix, message.suffix, connection);
  games.set(message.game, game);
  log.info(`Started a new game [${message.game}]`);
  game.handleStartMessage(message);
}

function handleActionMessage(raw: object): void {
  const message: ActionMessage = Object.assign({} as ActionMessage, raw);
  const game = games.get(message.game);
  if(!game) {
    log.warn(`Game with id [${message.game}] could not be found. This is unexpected.`);
    return;
  }
  game.handleActionMessage(message);
}
