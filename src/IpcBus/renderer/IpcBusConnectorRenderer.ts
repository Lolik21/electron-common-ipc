import * as assert from 'assert';
import { EventEmitter } from 'events';

import { IpcPacketBuffer } from 'socket-serializer';

import * as IpcBusUtils from '../IpcBusUtils';
import * as Client from '../IpcBusClient';

import { IpcBusCommand } from '../IpcBusCommand';
import { IpcBusConnector } from '../IpcBusConnector';
import { IpcBusConnectorImpl } from '../IpcBusConnectorImpl';

export const IPCBUS_TRANSPORT_RENDERER_HANDSHAKE = 'ECIPC:IpcBusRenderer:Connect';
export const IPCBUS_TRANSPORT_RENDERER_COMMAND = 'ECIPC:IpcBusRenderer:Command';
export const IPCBUS_TRANSPORT_RENDERER_EVENT = 'ECIPC:IpcBusRenderer:Event';

export interface IpcWindow extends EventEmitter {
    send(channel: string, ...args: any[]): void;
}

// Implementation for renderer process
/** @internal */
export class IpcBusConnectorRenderer extends IpcBusConnectorImpl {
    private _ipcWindow: IpcWindow;

    private _onIpcEventReceived: (...args: any[]) => void;
    private _packetOut: IpcPacketBuffer;

    constructor(contextType: Client.IpcBusProcessType, ipcWindow: IpcWindow) {
        assert(contextType === 'renderer' || contextType === 'renderer-frame', `IpcBusTransportWindow: contextType must not be a ${contextType}`);
        super(contextType);
        this._ipcWindow = ipcWindow;
        this._packetOut = new IpcPacketBuffer();
    }

    protected onConnectorShutdown() {
        if (this._onIpcEventReceived) {
            this._client.onConnectorShutdown();
            this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_EVENT, this._onIpcEventReceived);
            this._onIpcEventReceived = null;
        }
    }

    protected _onConnect(eventOrPeer: any, peerOrArgs: Client.IpcBusPeer | IpcBusConnector.Handshake, handshakeArg: IpcBusConnector.Handshake): IpcBusConnector.Handshake {
        // IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport:Window] _onConnect`);
        // In sandbox mode, 1st parameter is no more the event, but directly arguments !!!
        if (handshakeArg) {
            const handshake = handshakeArg;
            this._onIpcEventReceived = this._client.onConnectorBufferReceived.bind(this._client);
            this._ipcWindow.addListener(IPCBUS_TRANSPORT_RENDERER_EVENT, this._onIpcEventReceived);
            return handshake;
        }
        else {
            const handshake = peerOrArgs as IpcBusConnector.Handshake;
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport:Window] Activate Sandbox listening for #${this._messageId}`);
            this._onIpcEventReceived = this._client.onConnectorBufferReceived.bind(this._client, undefined);
            this._ipcWindow.addListener(IPCBUS_TRANSPORT_RENDERER_EVENT, this._onIpcEventReceived);
            return handshake;
        }
    };

    /// IpcBusTrandport API
    handshake(client: IpcBusConnector.Client, options: Client.IpcBusClient.ConnectOptions): Promise<IpcBusConnector.Handshake> {
        return new Promise<IpcBusConnector.Handshake>((resolve, reject) => {
            // Do not type timer as it may differ between node and browser api, let compiler and browserify deal with.
            let timer: NodeJS.Timer;
            const onIpcConnect = (eventOrPeer: any, peerOrArgs: Client.IpcBusPeer | IpcBusConnector.Handshake, handshakeArg: IpcBusConnector.Handshake) => {
                this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                this.addClient(client);
                const handshake = this._onConnect(eventOrPeer, peerOrArgs, handshakeArg);
                this._process = handshake.process;
                this._logLevel = handshake.logLevel;
                clearTimeout(timer);
                resolve(handshake);
            };

            // Below zero = infinite
            options = IpcBusUtils.CheckConnectOptions(options);
            if (options.timeoutDelay >= 0) {
                timer = setTimeout(() => {
                    timer = null;
                    this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                    reject('timeout');
                }, options.timeoutDelay);
            }
            // We wait for the bridge confirmation
            this._ipcWindow.addListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
            this.postCommand({
                kind: IpcBusCommand.Kind.Handshake,
                channel: '',
                peer: client.peer
            });
        });
    }

    shutdown(client: IpcBusConnector.Client, options?: Client.IpcBusClient.CloseOptions): Promise<void> {
        this.onConnectorShutdown();
        this.removeClient(client);
        return Promise.resolve();
    }

    // We serialize in renderer process to save master CPU.
    // We keep ipcBusCommand in plain text, once again to have master handling it easily
    postCommand(ipcBusCommand: IpcBusCommand, args?: any[]): void {
        ipcBusCommand.bridge = true;
        // this._logLevel && this.trackCommandPost(ipcBusCommand, args);
        if (args) {
            this._packetOut.serializeArray([ipcBusCommand, args]);
        }
        else {
            this._packetOut.serializeArray([ipcBusCommand]);
        }
        this._ipcWindow.send(IPCBUS_TRANSPORT_RENDERER_COMMAND, ipcBusCommand, this._packetOut.getRawContent());
    }

    postBuffer(buffer: Buffer) {
        throw 'not implemented';
    }
}
