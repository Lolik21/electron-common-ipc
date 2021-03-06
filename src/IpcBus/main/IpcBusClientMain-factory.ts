import * as Client from '../IpcBusClient';

import { IpcBusClientImpl}  from '../IpcBusClientImpl';
import { IpcBusTransport } from '../IpcBusTransport';
// import { IpcBusConnector } from '../IpcBusConnector';
// import { IpcBusTransportMultiImpl } from '../IpcBusTransportMultiImpl';
import { CreateIpcBusBridge } from './IpcBusBridge-factory';
import { IpcBusBridgeImpl } from './IpcBusBridgeImpl';

// export function CreateConnector(contextType: Client.IpcBusProcessType): IpcBusConnector {
//     const bridge = CreateIpcBusBridge() as IpcBusBridgeImpl;
//     const connector = bridge.mainConnector;
//     return connector;
// }

export function CreateTransport(contextType: Client.IpcBusProcessType): IpcBusTransport {
    const bridge = CreateIpcBusBridge() as IpcBusBridgeImpl;
    const transport = bridge.mainTransport;
    return transport;
}

// Implementation for Electron Main process
export function Create(contextType: Client.IpcBusProcessType): Client.IpcBusClient {
    const transport = CreateTransport(contextType);
    const ipcClient = new IpcBusClientImpl(transport);
    return ipcClient;
}
