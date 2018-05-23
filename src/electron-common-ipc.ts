export {IpcBusRequest} from './IpcBus/IpcBusInterfaces';
export {IpcBusRequestResponse} from './IpcBus/IpcBusInterfaces';
export {IpcBusPeer} from './IpcBus/IpcBusInterfaces';
export {IpcBusEvent} from './IpcBus/IpcBusInterfaces';
export {IpcBusListener} from './IpcBus/IpcBusInterfaces';

export {IPCBUS_CHANNEL_QUERY_STATE} from './IpcBus/IpcBusInterfaces';
export {IPCBUS_CHANNEL_SERVICE_AVAILABLE} from './IpcBus/IpcBusInterfaces';

export {IPCBUS_SERVICE_EVENT_START} from './IpcBus/IpcBusInterfaces';
export {IPCBUS_SERVICE_EVENT_STOP} from './IpcBus/IpcBusInterfaces';

export {ELECTRON_IPC_BROKER_LOGPATH_ENV_VAR} from './IpcBus/IpcBusInterfaces';
export {ELECTRON_IPC_BRIDGE_LOGPATH_ENV_VAR} from './IpcBus/IpcBusInterfaces';

export {ServiceStatus} from './IpcBus/IpcBusInterfaces';

import {IpcBusClient} from './IpcBus/IpcBusInterfaces';
import {IpcBusBroker} from './IpcBus/IpcBusInterfaces';
import {IpcBusBridge} from './IpcBus/IpcBusInterfaces';
import {IpcBusService} from './IpcBus/IpcBusInterfaces';
import {IpcBusServiceProxy} from './IpcBus/IpcBusInterfaces';

import {_CreateIpcBusBroker} from './IpcBus/IpcBusApi';
import {_CreateIpcBusBridge} from './IpcBus/IpcBusApi';
import {_CreateIpcBusClient} from './IpcBus/IpcBusApi';

import {_CreateIpcBusService} from './IpcBus/IpcBusApi-browser';
import {_CreateIpcBusServiceProxy} from './IpcBus/IpcBusApi-browser';
import {_ActivateIpcBusTrace} from './IpcBus/IpcBusApi-browser';
import {_ActivateServiceTrace} from './IpcBus/IpcBusApi-browser';

export function CreateIpcBusBroker(busPath?: string): IpcBusBroker {
    return _CreateIpcBusBroker(busPath);
}

export function CreateIpcBusBridge(busPath?: string): IpcBusBridge {
    return _CreateIpcBusBridge(busPath);
}

export function CreateIpcBusClient(busPath?: string): IpcBusClient {
    return _CreateIpcBusClient(busPath);
}

export function CreateIpcBusService(client: IpcBusClient, serviceName: string, serviceImpl: any = undefined): IpcBusService {
    return _CreateIpcBusService(client, serviceName, serviceImpl);
}

export function CreateIpcBusServiceProxy(client: IpcBusClient, serviceName: string, callTimeout: number = 1000): IpcBusServiceProxy {
    return _CreateIpcBusServiceProxy(client, serviceName, callTimeout);
}

export function ActivateIpcBusTrace(enable: boolean): void {
    return _ActivateIpcBusTrace(enable);
}

export function ActivateServiceTrace(enable: boolean): void {
    return _ActivateServiceTrace(enable);
}