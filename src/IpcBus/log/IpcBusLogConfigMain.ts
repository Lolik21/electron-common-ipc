import { IpcPacketBuffer } from "socket-serializer";

import { IpcBusCommand } from "../IpcBusCommand";
import { IpcBusLog } from './IpcBusLog';
import { IpcBusLogConfigImpl } from './IpcBusLogConfigImpl';
import { IpcBusLogConfig } from './IpcBusLogConfig';
import { CreateIpcBusLog } from "./IpcBusLog-factory";

/** @internal */
export interface IpcBusLogMain extends IpcBusLogConfig {
    getCallback(): IpcBusLog.Callback;
    setCallback(cb?: IpcBusLog.Callback): void;
    addLog(command: IpcBusCommand, args: any[], payload?: number): boolean;
    addLogRawContent(ipcBusCommand: IpcBusCommand, rawContent: IpcPacketBuffer.RawContent): boolean;
    addLogPacket(ipcBusCommand: IpcBusCommand, ipcPacketBuffer: IpcPacketBuffer): boolean;
}

/** @internal */
export class IpcBusLogConfigMain extends IpcBusLogConfigImpl implements IpcBusLogMain {
    private _cb: IpcBusLog.Callback;
    protected _packet: IpcPacketBuffer;
    protected _order: number;

    constructor() {
        super();
        this._packet = new IpcPacketBuffer();
        this._order = 0;
    }

    getCallback(): IpcBusLog.Callback {
        return this._cb;
    }

    setCallback(cb?: IpcBusLog.Callback): void {
        this._cb = cb;
    }

    private buildMessage(logMessage: IpcBusCommand.Log, args?: any[], payload?: number): IpcBusLog.Message {
        const command = logMessage.command;
        const message: Partial<IpcBusLog.Message> = {
            id: logMessage.id,
            peer: logMessage.peer,
            related_peer: logMessage.related_peer || logMessage.peer,
            timestamp: logMessage.timestamp - this.baseTime,
            local: logMessage.local,
            args: (this._level & IpcBusLogConfig.Level.Args) ? args : undefined,
            payload
        };

        switch (logMessage.kind) {
            case IpcBusCommand.Kind.SendMessage: {
                message.kind = command.request ? IpcBusLog.Kind.SEND_REQUEST : IpcBusLog.Kind.SEND_MESSAGE;
                message.channel = command.channel;
                break;
            }
            case IpcBusCommand.Kind.RequestClose: {
                message.kind = IpcBusLog.Kind.SEND_CLOSE_REQUEST;
                message.channel = command.request.channel;
                message.responseChannel = command.request.replyChannel;
                message.responseStatus = 'rejected';
                break;
            }
            case IpcBusCommand.Kind.RequestResponse:
            case IpcBusCommand.Kind.LogRequestResponse: {
                message.kind = IpcBusLog.Kind.SEND_REQUEST_RESPONSE;
                message.channel = command.request.channel;
                message.responseChannel = command.request.replyChannel;
                message.responseStatus = command.request.resolve ? 'resolved' : 'rejected';
                break;
            }
            case IpcBusCommand.Kind.LogGetMessage: {
                if (command.kind === IpcBusCommand.Kind.SendMessage) {
                    message.kind = command.request ? IpcBusLog.Kind.GET_REQUEST : IpcBusLog.Kind.GET_MESSAGE;
                    message.channel = command.channel;
                }
                else if (command.kind === IpcBusCommand.Kind.RequestResponse) {
                    message.kind = IpcBusLog.Kind.GET_REQUEST_RESPONSE;
                    message.channel = command.request.channel;
                    message.responseChannel = command.request.replyChannel;
                    message.responseStatus = command.request.resolve ? 'resolved' : 'rejected';
                }
                else if (command.kind === IpcBusCommand.Kind.RequestClose) {
                    message.kind = IpcBusLog.Kind.GET_CLOSE_REQUEST;
                    message.channel = command.channel;
                }
                break;
            }
        }
        return message as IpcBusLog.Message;
    }

    addLog(ipcBusCommand: IpcBusCommand, args: any[], payload?: number): boolean {
        ++this._order;
        // Some C++ lib can not manage log, so we have to simulate the minimum at this level
        if (ipcBusCommand.log == null) {
            const id = `external-${ipcBusCommand.peer.id}-${this._order}`;
            ipcBusCommand.log = {
                id,
                kind: ipcBusCommand.kind,
                timestamp: this.now,
                peer: ipcBusCommand.peer,
                command: ipcBusCommand
            };
        }

        const trace: Partial<IpcBusLog.Trace> = {
            order: this._order,
        };
        trace.stack = [];
        let logMessage = ipcBusCommand.log;
        while (logMessage) {
            const message = this.buildMessage(logMessage, args, payload);
            trace.stack.push(message);
            logMessage = logMessage.previous;
        }
        trace.first = trace.stack[trace.stack.length - 1];
        trace.current = trace.stack[0];
        const subOrder = trace.current.kind >= IpcBusLog.Kind.SEND_REQUEST ? trace.current.kind - 2 : trace.current.kind;
        trace.id = `${trace.first.id}_${String.fromCharCode(97 + subOrder)}`;

        this._cb(trace as IpcBusLog.Trace);
        return (ipcBusCommand.kind.lastIndexOf('LOG', 0) !== 0);
    }

    addLogRawContent(ipcBusCommand: IpcBusCommand, rawContent: IpcPacketBuffer.RawContent): boolean {
        if (ipcBusCommand.log) {
            this._packet.setRawContent(rawContent);
            this.addLog(ipcBusCommand, this._packet.parseArrayAt(1), this._packet.buffer.length);
        }
        return (ipcBusCommand.kind.lastIndexOf('LOG', 0) !== 0);
    }

    addLogPacket(ipcBusCommand: IpcBusCommand, ipcPacketBuffer: IpcPacketBuffer): boolean {
        if (ipcBusCommand.log) {
            this.addLog(ipcBusCommand, ipcPacketBuffer.parseArrayAt(1), ipcPacketBuffer.buffer.length);
        }
        return (ipcBusCommand.kind.lastIndexOf('LOG', 0) !== 0);
    }
}

IpcBusLog.SetLogLevel = (level: IpcBusLogConfig.Level, cb?: IpcBusLog.Callback): void => {
    const logger = CreateIpcBusLog() as IpcBusLogMain;
    logger.level = level;
    logger.setCallback(cb);
}


