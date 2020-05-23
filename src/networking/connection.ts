import ws from 'websocket';

import { factory } from '../log';
import { Message, ErrorMessage, RegisterMessage } from './message';

type Handler = (raw: object) => void;

const log = factory.getLogger('Connection');

export default class Connection {

  private connection?: ws.connection;
  private handlers: Record<string, Handler> = {};

  constructor(
    public url: string,
  ) {
    const socket = new ws.client();

    socket.on('connectFailed', error => {
      log.error(`Error when connecting to ${url} : [${error}]`);
    });

    socket.on('connect', connection => {
      this.connection = connection;

      connection.on('error', error => {
        log.error(`Error when connecting to ${url} : [${error}]`);
      });

      connection.on('close', () => {
        log.info(`Closed connection to ${url}`);
      });

      connection.on('message', this.handleMessage.bind(this));

    });

    this.registerHandler('error',     this.handleErrorMessage.bind(this));
    this.registerHandler('connected', this.handleConnectedMessage.bind(this));

    log.info(url);
    socket.connect(url);
    return this;
  }

  public send(message: object): void {
    if(!this.connection) {
      log.error('connection was not set when trying to send a message');
      return;
    }
    this.connection.sendUTF(JSON.stringify(message));
  }

  private handleMessage(iMessage: ws.IMessage): void {
    if(iMessage.type !== 'utf8') {
      log.warn('Received a non-utf8 message');
      return;
    }
    if(!iMessage.utf8Data) {
      log.warn('Received an empty message');
      return;
    }
    const raw: object = JSON.parse(iMessage.utf8Data);
    const message: Message = Object.assign({} as Message, raw);
    log.info(`Got a ${message.type} message!`);
    log.info(JSON.stringify(message));
    let handler = this.handlers[message.type];
    if(!handler) {
      handler = this.handleDefault.bind(this);
    }
    handler(raw);
  }

  public registerHandler(type: string, handler: Handler): Connection {
    this.handlers[type] = handler;
    return this;
  }

  private handleDefault(raw: object): void {
    const message: Message = Object.assign({} as Message, raw);
    log.debug(`No handler specified for message type [${message.type}]`);
  }

  private handleErrorMessage(raw: object): void {
    const message: ErrorMessage = Object.assign({} as ErrorMessage, raw);
    log.error(`Received an error message : [${message.content}]`);
  }

  private handleConnectedMessage(): void {
    this.send({
      type: 'register',
      clientType: 'engine',
      name: 'Planet Wars',
    } as RegisterMessage);
  }

}
