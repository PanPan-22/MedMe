// BLE abstraction for the MedMe Pillbox.
//
// Service layout (mirrors the prior HTTP API):
//   Service       4d65644d-0001-0000-0000-000000000001   ("MedMe Pillbox")
//   Ping (read)   4d65644d-0001-0000-0000-00000000000a   1 byte (0x01 = ok)
//   State (read)  4d65644d-0001-0000-0000-00000000000b   JSON string
//   Cmd (write)   4d65644d-0001-0000-0000-00000000000c   JSON command
//
// Commands written to Cmd:
//   { "op": "schedule", "now": <unix>, "rules": [{ slot, hour, minute, mask }] }
//   { "op": "fire", "slot": <1-8> }
//   { "op": "clear" }

import { BleManager, Device, State, Subscription } from "react-native-ble-plx";
import { Buffer } from "buffer";

export const PILLBOX_SERVICE = "4d65644d-0001-0000-0000-000000000001";
export const PING_CHAR       = "4d65644d-0001-0000-0000-00000000000a";
export const STATE_CHAR      = "4d65644d-0001-0000-0000-00000000000b";
export const CMD_CHAR        = "4d65644d-0001-0000-0000-00000000000c";

export const PILLBOX_NAME_PREFIX = "Pillbox_";

const SCAN_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 8000;

// Singleton — BleManager is expensive to instantiate.
let _manager: BleManager | null = null;
export function getManager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}

export interface DeviceRule {
  slot: number;
  hour: number;
  minute: number;
  dayMask: number;
}

export interface PillboxState {
  now: number;
  rules: DeviceRule[];
}

function b64Encode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
function b64Decode(b: string): string {
  return Buffer.from(b, "base64").toString("utf8");
}

// Wait for the OS Bluetooth radio to be powered on before doing anything.
export async function waitForPoweredOn(timeoutMs = 4000): Promise<boolean> {
  const m = getManager();
  const current = await m.state();
  if (current === State.PoweredOn) return true;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const sub: Subscription = m.onStateChange((s) => {
      if (s === State.PoweredOn && !done) {
        done = true;
        sub.remove();
        resolve(true);
      }
    }, true);
    setTimeout(() => {
      if (done) return;
      done = true;
      sub.remove();
      resolve(false);
    }, timeoutMs);
  });
}

// Scan for any device advertising a name starting with PILLBOX_NAME_PREFIX.
// Returns the strongest-signal match within SCAN_TIMEOUT_MS.
export async function scanForPillbox(): Promise<Device | null> {
  const m = getManager();
  return new Promise((resolve) => {
    let best: Device | null = null;
    let done = false;
    const finish = (d: Device | null) => {
      if (done) return;
      done = true;
      m.stopDeviceScan();
      resolve(d);
    };
    m.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        console.warn("[pillbox-ble] scan error", error);
        finish(best);
        return;
      }
      if (!device?.name?.startsWith(PILLBOX_NAME_PREFIX)) return;
      if (!best || (device.rssi ?? -100) > (best.rssi ?? -100)) {
        best = device;
      }
    });
    setTimeout(() => finish(best), SCAN_TIMEOUT_MS);
  });
}

export async function connectAndDiscover(device: Device): Promise<Device> {
  const m = getManager();
  const connected = await m.connectToDevice(device.id, {
    timeout: CONNECT_TIMEOUT_MS,
  });
  // BLE default MTU is 23 → 20-byte payloads. Negotiate larger so JSON fits
  // in a single write. Android only; iOS handles MTU automatically.
  try { await connected.requestMTU(185); } catch { /* iOS / not supported */ }
  return connected.discoverAllServicesAndCharacteristics();
}

export async function disconnect(device: Device): Promise<void> {
  try { await device.cancelConnection(); } catch { /* already gone */ }
}

export async function ping(device: Device): Promise<boolean> {
  const ch = await device.readCharacteristicForService(PILLBOX_SERVICE, PING_CHAR);
  if (!ch.value) return false;
  const decoded = b64Decode(ch.value);
  // Match either the byte 0x01 or the ASCII "1"
  return decoded.length > 0 && (decoded.charCodeAt(0) === 1 || decoded === "1");
}

export async function readState(device: Device): Promise<PillboxState> {
  const ch = await device.readCharacteristicForService(PILLBOX_SERVICE, STATE_CHAR);
  if (!ch.value) throw new Error("empty state characteristic");
  const json = b64Decode(ch.value);
  const parsed = JSON.parse(json);
  return {
    now: typeof parsed.now === "number" ? parsed.now : 0,
    rules: Array.isArray(parsed.rules) ? parsed.rules : [],
  };
}

async function writeCmd(device: Device, payload: object): Promise<void> {
  const json = JSON.stringify(payload);
  await device.writeCharacteristicWithResponseForService(
    PILLBOX_SERVICE,
    CMD_CHAR,
    b64Encode(json),
  );
}

export async function pushSchedule(
  device: Device,
  nowEpoch: number,
  rules: Array<{ slot: number; hour: number; minute: number; dayMask: number }>,
): Promise<void> {
  await writeCmd(device, { op: "schedule", now: nowEpoch, rules });
}

export async function fireSlot(device: Device, slot: number): Promise<void> {
  await writeCmd(device, { op: "fire", slot });
}

export async function clearSchedule(device: Device): Promise<void> {
  await writeCmd(device, { op: "clear" });
}
