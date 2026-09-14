export * from '../../node_modules/livekit-client/dist/livekit-client.esm.mjs';
import { Room as SDKRoom } from '../../node_modules/livekit-client/dist/livekit-client.esm.mjs';
export class Room extends SDKRoom {
  constructor(options) {
    super(options);
    this.connect = () => window.mockCallConnect(this);
    this.disconnect = () => window.mockCallDisconnect(this);
  }
}
