import { EventEmitter } from 'events';
import { IpcBusTransportInWindow } from './IpcBusClientTransportRenderer';
import { IPCBUS_TRANSPORT_RENDERER_CONNECT, IPCBUS_TRANSPORT_RENDERER_EVENT } from './IpcBusClientTransportRenderer';

export class CrossFrameEventEmitter extends EventEmitter implements IpcBusTransportInWindow {
    private _target: Window;
    private _origin: string;

    constructor(target: Window, origin?: string) {
        super();
        this._target = target;
        this._origin = origin || '*';

        // Callback
        this._messageHandler = this._messageHandler.bind(this);

        this._listen();
    }

    protected _postMessage(packet: any) {
        return this._target.postMessage(packet, this._origin);
    }

    // Listens in a cross-browser fashion. When postmessage isn't available
    // we'll either have to change listen or fake message events somehow.
    protected _listen() {
        let target = this._target as any;
        if (target.addEventListener) {
            target.addEventListener('message', this._messageHandler)
        }
        else if (target.attachEvent) {
            target.attachEvent('onmessage', this._messageHandler)
        }
    }

    // Get the channel and arguments and send it to the target
    // Channel is the event that the other side will be listening for
    send(channel: string, ...args: any[]): void {
        let packet = this._encode(channel, args);
        this._postMessage(packet);
    }


    // Cleans up event listeners
    stopListening() {
        let target = this._target as any;
        if (target.removeEventListener) {
            target.removeEventListener('message', this._messageHandler)
        }
        else if (target.detachEvent) {
            target.detachEvent('onmessage', this._messageHandler)
        }
    }

    // Unpacks and emits
    protected _messageHandler(event: MessageEvent) {
        let packet = this._decode(event.data);
        if (packet) {
            let args = packet.args || [];
            this.emit(packet.channel, ...args);
        }
    }

    // Takes a message data string and deserialises it
    protected _decode(data: any): any {
        // We don't control all message events, they won't always be JSON
        try {
            let packet = data['_electron_common_ipc_'];
            if (packet) {
                return packet;
            }
        }
        catch (e) {
        }
        return null;
    }

    // Takes a channel and the arguments to emit with and serialises it
    // for transmission
    protected _encode(channel: string, args: any[]): any {
        return {
            '_electron_common_ipc_': {
                channel: channel,
                args: args
            }
        };
    }
}


export class IpcBusFrameBridge extends CrossFrameEventEmitter {
    protected _ipcBusTransportWindow: IpcBusTransportInWindow;

    constructor(ipcBusTransportWindow: IpcBusTransportInWindow, target: Window, origin?: string) {
        super(target, origin);
        this._ipcBusTransportWindow = ipcBusTransportWindow;

        // Callback
        this._messageTransportHandlerEvent = this._messageTransportHandlerEvent.bind(this);
        this._messageTransportHandlerConnect = this._messageTransportHandlerConnect.bind(this);

        this._ipcBusTransportWindow.on(IPCBUS_TRANSPORT_RENDERER_CONNECT, this._messageTransportHandlerConnect);
        this._ipcBusTransportWindow.on(IPCBUS_TRANSPORT_RENDERER_EVENT, this._messageTransportHandlerEvent);
    }

    // Unpacks and emits
    protected _messageHandler(event: MessageEvent) {
        let packet = this._decode(event.data);
        if (packet) {
            let args = packet.args || [];
            this._ipcBusTransportWindow.send(packet.channel, ...args);
        }
    }

    protected _messageTransportHandlerEvent(...args: any[]) {
        this.send(IPCBUS_TRANSPORT_RENDERER_EVENT, ...args);
    }

    protected _messageTransportHandlerConnect(...args: any[]) {
        this.send(IPCBUS_TRANSPORT_RENDERER_CONNECT, ...args);
    }
}

