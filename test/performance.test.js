const ipcSocket = require('socket-serializer');

const Conversions = {
  's': [1, 1e-9],
  'ms': [1e3, 1e-6],
  'us': [1e6, 1e-3],
  'ns': [1e9, 1]
};

describe(`Performance IPCPacketBuffer`, () => {
  const rawContent = {
    type: ipcSocket.BufferType.NotValid,
    contentSize: 0,
    buffer: Buffer.alloc(128)
  };

  it('static buffer rawContent', (done) => {
    const ipcBuffer = new ipcSocket.IpcPacketBuffer();

    const time = process.hrtime();
    for (let i = 0; i < 10000; ++i) {
      ipcBuffer.setRawContent(rawContent);
      ipcBuffer.reset();
    }
    const diff = process.hrtime(time);
    const diffms = diff[0] * Conversions.ms[0] + diff[1] * Conversions.ms[1];
    console.log(`static buffer ${diffms.toFixed(2)} ms`);
    done();
  });

  it('dynamic buffer rawContent', (done) => {
    const time = process.hrtime();
    for (let i = 0; i < 10000; ++i) {
      const ipcBuffer = new ipcSocket.IpcPacketBuffer(rawContent);
    }
    const diff = process.hrtime(time);
    const diffms = diff[0] * Conversions.ms[0] + diff[1] * Conversions.ms[1];
    console.log(`dynamic buffer ${diffms.toFixed(2)} ms`);
    done();
  });

  const paramObject = {
    num: 10.2,
    str: "test",
    bool: true,
    Null: null,
    Undef: undefined,
    properties: {
      num1: 12.2,
      str1: "test2",
      bool1: false
    },
    buffer: Buffer.alloc(200)
  };

  it('static buffer serial', (done) => {
    const ipcBuffer = new ipcSocket.IpcPacketBuffer();
    const time = process.hrtime();
    for (let i = 0; i < 10000; ++i) {
      ipcBuffer.serializeArray([paramObject, paramObject]);
      ipcBuffer.reset();
    }
    const diff = process.hrtime(time);
    const diffms = diff[0] * Conversions.ms[0] + diff[1] * Conversions.ms[1];
    console.log(`static buffer ${diffms.toFixed(2)} ms`);
    done();
  });

  it('dynamic buffer serial', (done) => {
    const time = process.hrtime();
    for (let i = 0; i < 10000; ++i) {
      const ipcBuffer = new ipcSocket.IpcPacketBuffer();
      ipcBuffer.serializeArray([paramObject, paramObject]);
    }
    const diff = process.hrtime(time);
    const diffms = diff[0] * Conversions.ms[0] + diff[1] * Conversions.ms[1];
    console.log(`dynamic buffer ${diffms.toFixed(2)} ms`);
    done();
  });

})


