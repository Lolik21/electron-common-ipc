import * as uuid from 'uuid';
import { IpcPacketBuffer } from 'socket-serializer';

import * as IpcBusClientInterfaces from './IpcBusClientInterfaces';
import * as IpcBusUtils from './IpcBusUtils';
import { IpcBusCommand } from './IpcBusCommand';
import { IpcBusClientImpl } from './IpcBusClientImpl';

const replyChannelPrefix = `${IpcBusClientInterfaces.IPCBUS_CHANNEL}/request-`;
const v1IdPattern = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';


/** @internal */
class DeferredRequest {
    public promise: Promise<IpcBusClientInterfaces.IpcBusRequestResponse>;

    public resolve: (value: IpcBusClientInterfaces.IpcBusRequestResponse) => void;
    public reject: (err: IpcBusClientInterfaces.IpcBusRequestResponse) => void;

    private _channel: string;

    constructor(channel: string) {
        this._channel = channel;
        this.promise = new Promise<IpcBusClientInterfaces.IpcBusRequestResponse>((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        });
    }

    fulFilled(ipcBusCommand: IpcBusCommand, args: any[]) {
        // The channel is not generated one
        let ipcBusEvent: IpcBusClientInterfaces.IpcBusEvent = { channel: this._channel, sender: ipcBusCommand.peer };
        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] Peer #${ipcBusEvent.sender.name} replied to request on ${ipcBusCommand.request.replyChannel}`);
        if (ipcBusCommand.request.resolve) {
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] resolve`);
            let response: IpcBusClientInterfaces.IpcBusRequestResponse = { event: ipcBusEvent, payload: args[0] };
            this.resolve(response);
        }
        else if (ipcBusCommand.request.reject) {
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] reject`);
            let response: IpcBusClientInterfaces.IpcBusRequestResponse = { event: ipcBusEvent, err: args[0] };
            this.reject(response);
        }
        else {
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] reject: unknown format`);
            let response: IpcBusClientInterfaces.IpcBusRequestResponse = { event: ipcBusEvent, err: 'unknown format' };
            this.reject(response);
        }
    };
}

/** @internal */
export abstract class IpcBusClientTransport extends IpcBusClientImpl {
    protected _ipcBusPeer: IpcBusClientInterfaces.IpcBusPeer;
    protected readonly _netOptions: IpcBusClientInterfaces.IpcNetOptions;

    protected _requestFunctions: Map<string, DeferredRequest>;
    protected _requestNumber: number;

    constructor(ipcBusProcess: IpcBusClientInterfaces.IpcBusProcess, options: IpcBusClientInterfaces.IpcBusClient.CreateOptions) {
        super(options);

        this._ipcBusPeer = { id: uuid.v1(), name: '', process: ipcBusProcess };
        this._netOptions = options;
        this._requestFunctions = new Map<string, DeferredRequest>();
        this._requestNumber = 0;
    }

    // ----------------------
    // IpcBusClient interface
    // ----------------------
    get peer(): IpcBusClientInterfaces.IpcBusPeer {
        return this._ipcBusPeer;
    }

    private generateReplyChannel(): string {
        ++this._requestNumber;
        return `${replyChannelPrefix}${this._ipcBusPeer.id}-${this._requestNumber.toString()}`;
    }

    protected extractPeerIdFromReplyChannel(replyChannel: string): string {
        return replyChannel.substr(replyChannelPrefix.length, v1IdPattern.length);
    }

    protected _onEventReceived(ipcBusCommand: IpcBusCommand, ipcPacketBuffer: IpcPacketBuffer) {
        switch (ipcBusCommand.kind) {
            case IpcBusCommand.Kind.SendMessage: {
                IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] Emit message received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name}`);
                const ipcBusEvent: IpcBusClientInterfaces.IpcBusEvent = { channel: ipcBusCommand.channel, sender: ipcBusCommand.peer };
                let args = ipcPacketBuffer.parseArrayAt(1);
                this.native_emit(ipcBusCommand.emit || ipcBusCommand.channel, ipcBusEvent, ...args);
                break;
            }
            case IpcBusCommand.Kind.RequestMessage: {
                IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] Emit request received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name} (replyChannel '${ipcBusCommand.request.replyChannel}')`);
                let ipcBusEvent: IpcBusClientInterfaces.IpcBusEvent = { channel: ipcBusCommand.channel, sender: ipcBusCommand.peer };
                ipcBusEvent.request = {
                    resolve: (payload: Object | string) => {
                        ipcBusCommand.request.resolve = true;
                        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] Resolve request received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name} - payload: ${JSON.stringify(payload)}`);
                        this.ipcSend(IpcBusCommand.Kind.RequestResponse, ipcBusCommand.request.replyChannel, ipcBusCommand.request, [payload]);
                    },
                    reject: (err: string) => {
                        ipcBusCommand.request.reject = true;
                        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] Reject request received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name} - err: ${JSON.stringify(err)}`);
                        this.ipcSend(IpcBusCommand.Kind.RequestResponse, ipcBusCommand.request.replyChannel, ipcBusCommand.request, [err]);
                    }
                };
                let args = ipcPacketBuffer.parseArrayAt(1);
                this.native_emit(ipcBusCommand.channel, ipcBusEvent, ...args);
                break;
            }
            case IpcBusCommand.Kind.RequestResponse: {
                IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] Emit request response received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name} (replyChannel '${ipcBusCommand.request.replyChannel}')`);
                const deferredRequest = this._requestFunctions.get(ipcBusCommand.request.replyChannel);
                if (deferredRequest) {
                    this._requestFunctions.delete(ipcBusCommand.request.replyChannel);
                    let args = ipcPacketBuffer.parseArrayAt(1);
                    deferredRequest.fulFilled(ipcBusCommand, args);
                }
                break;
            }
        }
    }

    ipcRequest(channel: string, timeoutDelay: number, args: any[]): Promise<IpcBusClientInterfaces.IpcBusRequestResponse> {
        if (timeoutDelay == null) {
            timeoutDelay = IpcBusUtils.IPC_BUS_TIMEOUT;
        }
        const ipcBusCommandRequest: IpcBusCommand.Request = { replyChannel: this.generateReplyChannel() };

        const deferredRequest = new DeferredRequest(channel);
        // Register locally
         this._requestFunctions.set(ipcBusCommandRequest.replyChannel, deferredRequest);
         // Execute request
         this.ipcSend(IpcBusCommand.Kind.RequestMessage, channel, ipcBusCommandRequest, args);
        // Clean-up
        if (timeoutDelay >= 0) {
            setTimeout(() => {
                if (this._requestFunctions.delete(ipcBusCommandRequest.replyChannel)) {
                    // Unregister remotely
                    this.ipcSend(IpcBusCommand.Kind.RequestCancel, channel, ipcBusCommandRequest);
                    IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IpcBusClient] reject: timeout`);
                    let response: IpcBusClientInterfaces.IpcBusRequestResponse = { event: { channel: channel, sender: this._ipcBusPeer }, err: 'timeout' };
                    deferredRequest.reject(response);
                }
            }, timeoutDelay);
        }
        return deferredRequest.promise;
    }

    protected ipcSend(kind: IpcBusCommand.Kind, channel: string, ipcBusCommandRequest?: IpcBusCommand.Request, args?: any[]): void {
        this.ipcPostCommand({ kind, channel, peer: this.peer, request: ipcBusCommandRequest }, args);
    }

    protected abstract ipcPostCommand(ipcBusCommand: IpcBusCommand, args?: any[]): void;
}