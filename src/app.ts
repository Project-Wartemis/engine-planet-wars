import Game from './game';
import Connection from './networking/connection';
import { InviteMessage } from './networking/message';

new Connection('https://localhost:8080/socket')
  .registerHandler('invite', handleInviteMessage);

function handleInviteMessage(raw: object): void {
  const message: InviteMessage = Object.assign({} as InviteMessage, raw);
  new Game('https://localhost:8080/socket/'+message.room);
}
