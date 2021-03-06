import { GetElectronProcessType } from 'electron-process-type/lib/v2';

import { IpcBusClient } from './IpcBusClient';
import * as IpcBusUtils from './IpcBusUtils';

import { Create as CreateIpcBusClientNet } from './node/IpcBusClientNet-factory';
import { Create as CreateIpcBusClientMain } from './main/IpcBusClientMain-factory';

export const CreateIpcBusClient: IpcBusClient.CreateFunction = (): IpcBusClient => {
    const electronProcessType = GetElectronProcessType();
    IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`CreateIpcBusForProcess process type = ${electronProcessType}`);
    let ipcBusClient: IpcBusClient = null;
    switch (electronProcessType) {
        // This case 'renderer' is not reachable as IpcBusApi-browser is used in a browser (see browserify 'browser' field in package.json)
        case 'renderer':
            // ipcBusClient = new IpcBusClientRenderer(electronProcessType, localOptions || {});
            break;
        case 'main':
            ipcBusClient = CreateIpcBusClientMain(electronProcessType);
            break;
        case 'node':
            ipcBusClient = CreateIpcBusClientNet(electronProcessType);
            break;
    }
    return ipcBusClient;
};

IpcBusClient.Create = CreateIpcBusClient;
