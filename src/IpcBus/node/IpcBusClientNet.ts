import * as Client from '../IpcBusClient';

import { IpcBusTransportNet } from './IpcBusTransportNet';
import { IpcBusClientImpl}  from '../IpcBusClientImpl';
import { IpcBusTransport } from '../IpcBusTransport';

export function CreateTransport(contextType: Client.IpcBusProcessType): IpcBusTransport {
    const transport = new IpcBusTransportNet(contextType);
    return transport;
}

// Implementation for Node process
export function Create(contextType: Client.IpcBusProcessType): Client.IpcBusClient {
    const transport = CreateTransport(contextType);
    const ipcClient = new IpcBusClientImpl(transport);
    return ipcClient;
}
