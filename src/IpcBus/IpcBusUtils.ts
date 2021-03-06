// import * as uuid from 'uuid';
import * as shortid from 'shortid';

import { EventEmitter } from 'events';

import { IpcConnectOptions, IpcBusPeer } from './IpcBusClient';

export const IPC_BUS_TIMEOUT = 2000;// 20000;

const win32prefix1 = '\\\\.\\pipe';
const win32prefix2 = '\\\\?\\pipe';

// https://nodejs.org/api/net.html#net_ipc_support
function CleanPipeName(str: string) {
    if (process.platform === 'win32') {
        if ((str.lastIndexOf(win32prefix1, 0) === -1) && (str.lastIndexOf(win32prefix2, 0) === -1)) {
            str = str.replace(/^\//, '');
            str = str.replace(/\//g, '-');
            str = win32prefix1 + '\\' + str;
        }
    }
    return str;
}

export function CheckChannel(channel: any): string {
    switch (typeof channel) {
        case 'string':
            break;
        case 'undefined':
            channel = 'undefined';
            break;
        default:
            if (channel === null) {
                channel = 'null';
            }
            else {
                channel = channel.toString();
            }
            break;
    }
    return channel;
}

export function checkTimeout(val: any): number {
    const parseVal = parseFloat(val);
    if (parseVal == val) {
        return parseVal;
    }
    else {
        return IPC_BUS_TIMEOUT;
    }
}

export function CheckConnectOptions<T extends IpcConnectOptions>(arg1: T | string | number, arg2?: T | string, arg3?: T): T | null {
    // A port number : 59233, 42153
    // A port number + hostname : 59233, '127.0.0.1'
    const options: T = (typeof arg1 === 'object' ? arg1 : typeof arg2 === 'object' ? arg2 : typeof arg3 === 'object' ? arg3 : {}) as T;
    if (Number(arg1) >= 0) {
        options.port = Number(arg1);
        options.host = typeof arg2 === 'string' ? arg2 : undefined;
    }
    // A 'hostname:port' pattern : 'localhost:8082'
    // A path : '//local-ipc'
    else if (typeof arg1 === 'string') {
        const parts = arg1.split(':');
        if ((parts.length === 2) && (Number(parts[1]) >= 0)) {
            options.port = Number(parts[1]);
            options.host = parts[0];
        }
        else {
            options.path = arg1;
        }
    }
    // An IpcNetOptions object similar to NodeJS.net.ListenOptions
    if (options.path) {
        options.path = CleanPipeName(options.path);
    }
    if (options.timeoutDelay == null) {
        options.timeoutDelay = IPC_BUS_TIMEOUT;
    }
    return options;
}

shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#&')
export function CreateUniqId(): string {
    // return uuid.v1();
    return shortid.generate();
}

export function BinarySearch<T>(array: T[], target: T, compareFn: (l: T, r: T) => number) {
    let left = 0;  // inclusive
    let right = array.length;  // exclusive
    while (left < right) {
        let middle = (left + right) >> 1;
        const compareResult = compareFn(target, array[middle]);
        if (compareResult > 0) {
            left = middle + 1;
        }
        else if (compareResult < 0) {
            right = middle;
        }
        else {
            return middle;
        }
    }
    // left is the insertion point if not found
    return -left - 1;
};


/** @internal */
export class Logger {
    static enable: boolean = false;
    static service: boolean = false;
    // static logFile: string;

    static info(msg: string) {
        console.log(msg);
    }

    static warn(msg: string) {
        console.warn(msg);
    }

    static error(msg: string) {
        console.error(msg);
    }

};

/** @internal */
export class ConnectCloseState<T> {
    protected _waitForConnected: Promise<T>;
    protected _waitForClosed: Promise<void>;
    protected _connected: boolean;

    constructor() {
        this.shutdown();
    }

    get connected(): boolean {
        return this._connected;
    }

    connect(cb: () => Promise<T>): Promise<T> {
        if (this._waitForConnected == null) {
            this._waitForConnected = this._waitForClosed
            .then(() => {
                return cb();
            })
            .then((t) => {
                this._connected = true;
                return t;
            })
            .catch((err) => {
                this._waitForConnected = null;
                throw err;
            });
        }
        return this._waitForConnected;
    }

    close(cb: () => Promise<void>): Promise<void> {
        if (this._waitForConnected) {
            const waitForConnected = this._waitForConnected;
            this._waitForConnected = null;
            this._waitForClosed = waitForConnected
            .then(() => {
                this._connected = false;
                return cb();
            });
        }
        return this._waitForClosed;
    }

    shutdown() {
        this._waitForConnected = null;
        this._waitForClosed = Promise.resolve();
        this._connected = false;
    }
}


// Structure
// Channel has key
// then list of "transports" for this channel: key + implem (socket or webContents)
// then list of ref counted peerIds for this transport

/** @internal */
export class ChannelConnectionMap<T, M> extends EventEmitter {
    private _name: string;
    private _channelsMap: Map<string, Map<M, ConnectionPeers<T, M>>>;
    private _getKey: (t: T) => M;

    public emitter: boolean;

    constructor(name: string, getKey: (t: T) => M, emitter: boolean) {
        super();
        this._name = name;
        this._getKey = getKey;
        this.emitter = emitter;
        this._channelsMap = new Map<string, Map<M, ConnectionPeers<T, M>>>();
    }

    getKey(t: T): M {
        return this._getKey(t);
    }

    private _info(str: string) {
        Logger.enable && Logger.info(`[${this._name}] ${str}`);
    }

    private _warn(str: string) {
        Logger.enable && Logger.warn(`[${this._name}] ${str}`);
    }

    hasChannel(channel: string): boolean {
        return this._channelsMap.has(channel);
    }

    getChannels(): string[] {
        const channels = Array.from(this._channelsMap.keys());
        return channels;
    }

    getChannelsCount(): number {
        return this._channelsMap.size;
    }

    clear() {
        this._channelsMap.clear();
    }

    addRefs(channels: string[], conn: T, peer: IpcBusPeer): void {
        for (let i = 0, l = channels.length; i < l; ++i) {
            this.addRef(channels[i], conn, peer);
        }
    }

    releases(channels: string[], conn: T, peer: IpcBusPeer): void {
        for (let i = 0, l = channels.length; i < l; ++i) {
            this.release(channels[i], conn, peer);
        }
    }

    protected _declareNewChannel(channel: string, conn: T, peer: IpcBusPeer, count?: number): Map<M, ConnectionPeers<T, M>> {
        Logger.enable && this._info(`SetChannel: '${channel}', peerId =  ${peer ? peer.id : 'unknown'}`);

        const connsMap = new Map<M, ConnectionPeers<T, M>>();
        // This channel has NOT been subscribed yet, add it to the map
        this._channelsMap.set(channel, connsMap);

        const key = this._getKey(conn);
        const connData = new ConnectionPeers<T, M>(key, conn, peer, count);
        connsMap.set(key, connData);

        this.emitter && this.emit('channel-added', channel);

        return connsMap;
    }

    // Channel is supposed to be new
    setSingleChannel(channel: string, conn: T, peer: IpcBusPeer) {
        this._declareNewChannel(channel, conn, peer, 1);
    }

    getSingleChannel(channel: string): ConnectionPeers<T, M> | null {
        const connsMap = this._channelsMap.get(channel);
        if (connsMap == null) {
            return null;
        }
        if (connsMap.size !== 1) {
            throw 'should not happen';
            return null;
        }
        return connsMap.values().next().value;
    }

    addRefCount(channel: string, conn: T, peer: IpcBusPeer, count: number): number {
        Logger.enable && this._info(`AddRef: '${channel}': conn = ${this._getKey(conn)}, peerId =  ${peer ? peer.id : 'unknown'}`);

        let connsMap = this._channelsMap.get(channel);
        if (connsMap == null) {
            connsMap = this._declareNewChannel(channel, conn, peer, count);
        }
        else {
            const key = this._getKey(conn);
            let connData = connsMap.get(key);
            if (connData == null) {
                // This channel has NOT been already subscribed by this connection
                connData = new ConnectionPeers<T, M>(key, conn, peer, count);
                connsMap.set(key, connData);
                // Logger.enable && this._info(`AddRef: connKey = ${conn} is added`);
            }
            else {
                connData.addPeer(peer, count);
            }
        }
        return connsMap.size;
    }

    addRef(channel: string, conn: T, peer: IpcBusPeer): number {
        return this.addRefCount(channel, conn, peer, 1);
    }

    private _releaseConnData(channel: string, connData: ConnectionPeers<T, M>, connsMap: Map<M, ConnectionPeers<T, M>>, peer: IpcBusPeer, all: boolean): number {
        if (peer == null) {
            connData.clearPeers();
        }
        else {
            if (all) {
                if (connData.removePeer(peer) === false) {
                    Logger.enable && this._warn(`Release '${channel}': peerId # ${peer ? peer.id : 'unknown'} is unknown`);
                }
            }
            else {
                connData.releasePeer(peer);
            }
        }
        if (connData.peerRefCounts.size === 0) {
            connsMap.delete(connData.key);
            // Logger.enable && this._info(`Release: conn = ${conn} is released`);
            if (connsMap.size === 0) {
                this._channelsMap.delete(channel);
                this.emitter && this.emit('channel-removed', channel);
                // Logger.enable && this._info(`Release: channel '${channel}' is released`);
            }
        }
        Logger.enable && this._info(`Release '${channel}': count = ${connData.peerRefCounts.size}`);
        return connsMap.size;
    }

    private _releaseChannel(channel: string, conn: T, peer: IpcBusPeer, all: boolean): number {
        Logger.enable && this._info(`Release '${channel}' (${all}): peerId = ${peer ? peer.id : 'unknown'}`);
        const connsMap = this._channelsMap.get(channel);
        if (connsMap == null) {
            Logger.enable && this._warn(`Release '${channel}': '${channel}' is unknown`);
            return 0;
        }
        else {
            const key = this._getKey(conn);
            const connData = connsMap.get(key);
            if (connData == null) {
                Logger.enable && this._warn(`Release '${channel}': conn is unknown`);
                return 0;
            }
            return this._releaseConnData(channel, connData, connsMap, peer, all);
        }
    }

    release(channel: string, conn: T, peer: IpcBusPeer): number {
        return this._releaseChannel(channel, conn, peer, false);
    }

    releaseAll(channel: string, conn: T, peer: IpcBusPeer): number {
        return this._releaseChannel(channel, conn, peer, true);
    }

    removeChannel(channel: string): boolean {
        if (this._channelsMap.delete(channel)) {
            this.emitter && this.emit('channel-removed', channel);
            return true;
        }
        return false;
    }

    private _removeConnectionOrPeer(conn: T, peer: IpcBusPeer | null) {
        Logger.enable && this._info(`removeConnectionOrPeer: peerId = ${peer ? peer.id : 'unknown'}`);
        // We can not use _getKey as it may access a property which is no more accessible when the 'conn' is destroyed
        this._channelsMap.forEach((connsMap, channel) => {
            connsMap.forEach((connData) => {
                if (connData.conn === conn) {
                    this._releaseConnData(channel, connData, connsMap, peer, true);
                }
            });
        });
    }

    removePeer(conn: T, peer: IpcBusPeer) {
        return this._removeConnectionOrPeer(conn, peer);
    }

    removeConnection(conn: T) {
        return this._removeConnectionOrPeer(conn, null);
    }

    // forEachConnection(callback: ChannelConnectionMap.ForEachHandler<T1>) {
    //     const connections = new Map<T1, ChannelConnectionMap.ConnectionData<T1>>();
    //     this._channelsMap.forEach((connsMap, channel) => {
    //         connsMap.forEach((connData, connKey) => {
    //             connections.set(connData.conn, connData);
    //         });
    //     });
    //     connections.forEach((connData, connKey) => {
    //         callback(connData, '');
    //     });
    // }

    forEachChannel(channel: string, callback: ConnectionPeers.ForEachHandler<T, M>) {
        Logger.enable && this._info(`forEachChannel '${channel}'`);
        const connsMap = this._channelsMap.get(channel);
        if (connsMap == null) {
            Logger.enable && this._warn(`forEachChannel: Unknown channel '${channel}' !`);
        }
        else {
            connsMap.forEach((connData) => {
                Logger.enable && this._info(`forEachChannel '${channel}' - ${JSON.stringify(Array.from(connData.peerRefCounts.keys()))} (${connData.peerRefCounts.size})`);
                callback(connData, channel);
            });
        }
    }

    forEach(callback: ConnectionPeers.ForEachHandler<T, M>) {
        Logger.enable && this._info('forEach');
        this._channelsMap.forEach((connsMap, channel: string) => {
            connsMap.forEach((connData) => {
                Logger.enable && this._info(`forEach '${channel}' - ${JSON.stringify(Array.from(connData.peerRefCounts.keys()))} (${connData.peerRefCounts.size})`);
                callback(connData, channel);
            });
        });
    }

    // on(event: 'channel-added', listener: (channel: string) => void): this;
    // on(event: 'channel-removed', listener: (channel: string) => void): this;
    on(event: 'channel-added', listener: (channel: string) => void): this;
    on(event: 'channel-removed', listener: (channel: string) => void): this;
    on(event: symbol | string, listener: (...args: any[]) => void): this {
        return super.addListener(event, listener);
    }

    // off(event: 'channel-added', listener: (channel: string) => void): this;
    // off(event: 'channel-removed', listener: (channel: string) => void): this;
    off(event: 'channel-added', listener: (channel: string) => void): this;
    off(event: 'channel-removed', listener: (channel: string) => void): this;
    off(event: symbol | string, listener: (...args: any[]) => void): this {
        return super.removeListener(event, listener);
    }
}

// /** @internal */
// export interface ConnectionPeer<T> {
//     conn: T;
//     peer: IpcBusPeer;
// }

/** @internal */
export class ConnectionPeers<T, M> {
    readonly key: M;
    readonly conn: T;
    peerRefCounts: Map<string, ConnectionPeers.PeerRefCount> = new Map<string, ConnectionPeers.PeerRefCount>();

    constructor(key: M, conn: T, peer: IpcBusPeer, count?: number) {
        this.key = key;
        this.conn = conn;
        const refCount = (count == null) ? 1 : count;
        const peerRefCount = { peer, refCount };
        this.peerRefCounts.set(peer.id, peerRefCount);
    }

    addPeer(peer: IpcBusPeer, count?: number): number {
        const refCount = (count == null) ? 1 : count;
        let peerRefCount = this.peerRefCounts.get(peer.id);
        if (peerRefCount == null) {
            // This channel has NOT been already subcribed by this peername, by default 1
            peerRefCount = { peer, refCount };
            this.peerRefCounts.set(peer.id, peerRefCount);
        }
        else {
            peerRefCount.refCount += refCount;
        }
        return peerRefCount.refCount;
    }

    clearPeers() {
        this.peerRefCounts.clear();
    }

    removePeer(peer: IpcBusPeer): boolean {
        return this.peerRefCounts.delete(peer.id);
    }

    releasePeer(peer: IpcBusPeer) {
        const peerRefCount = this.peerRefCounts.get(peer.id);
        if (peerRefCount == null) {
            return 0;
            // Logger.enable && this._warn(`Release '${channel}': peerId #${peerId} is unknown`);
        }
        else {
            // This connection has subscribed to this channel
            if (--peerRefCount.refCount <= 0) {
                // The connection is no more referenced
                this.peerRefCounts.delete(peer.id);
                // Logger.enable && this._info(`Release: peerId #${peerId} is released`);
            }
            return peerRefCount.refCount;
        }
    }
}

/** @internal */
export namespace ConnectionPeers {
    /** @internal */
    export interface PeerRefCount {
        peer: IpcBusPeer;
        refCount: number;
    }

    /** @internal */
    export interface ForEachHandler<T, M> {
        (ConnectionData: ConnectionPeers<T, M>, channel: string): void;
    };
};

