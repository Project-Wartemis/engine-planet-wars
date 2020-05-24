import Game from './game';
import Connection from './networking/connection';
import { InviteMessage } from './networking/message';

let URL = 'https://localhost:8080/socket';
//const URL = 'https://api.wartemis.com/socket';

console.log(process.env.WARTEMIS_ENV);
if(process.env.WARTEMIS_ENV === 'BUILD') {
  URL = 'https://pw-backend/socket';
}

new Connection(URL)
  .registerHandler('invite', handleInviteMessage);

function handleInviteMessage(raw: object): void {
  const message: InviteMessage = Object.assign({} as InviteMessage, raw);
  new Game(URL + '/' + message.room);
}
