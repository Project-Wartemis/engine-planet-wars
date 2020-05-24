import Game from './game';
import Connection from './networking/connection';
import { InviteMessage } from './networking/message';

const URL = 'https://localhost:8080/socket';
//const URL = 'https://api.wartemis.com/socket';

new Connection(URL)
  .registerHandler('invite', handleInviteMessage);

function handleInviteMessage(raw: object): void {
  const message: InviteMessage = Object.assign({} as InviteMessage, raw);
  new Game(URL + '/' + message.room);
}
