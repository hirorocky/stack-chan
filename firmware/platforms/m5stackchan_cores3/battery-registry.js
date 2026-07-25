// breath MOD addition (hirorocky/breathing): AXP2101 battery readout and DLDO1
// backlight control via the power IO captured in host/provider.js. Not an
// upstream file — registered as the `m5stackchan/battery` module.
let powerIO = null;
let gaugeEnabled = false;

const REG_POWER_OFF_CONTROL = 0x10;
const REG_POWER_ON_SOURCE = 0x20;
const REG_PWROK_SETTING = 0x25;
const REG_IRQ_ENABLE1 = 0x41;
const POWER_KEY_IRQ_MASK = 0x0c;
const BATTERY_CURRENT_DIRECTION_MASK = 0x60;
const BATTERY_CURRENT_DIRECTION_CHARGE = 0x20;

export function isBatteryChargingStatus(status) {
	// AXP2101 REG01[6:5] is a two-bit direction field: 01=charge,
	// 10=discharge. Testing bit 6 alone reverses those two states.
	return (status & BATTERY_CURRENT_DIRECTION_MASK) === BATTERY_CURRENT_DIRECTION_CHARGE;
}

export function registerPowerIO(io) {
	powerIO = io;
	try {
		// AXP2101 only latches REG49 PEK events when their matching IRQ-enable
		// bits are set. Disable the later hardware cut and let breath handle the
		// earlier long-press IRQ before requesting orderly software power-off.
		io.writeUint8(0x22, io.readUint8(0x22) & ~0x02);
		io.writeUint8(REG_IRQ_ENABLE1, io.readUint8(REG_IRQ_ENABLE1) | POWER_KEY_IRQ_MASK);
	} catch (error) {
		trace(`[m5stackchan/battery] power-key setup failed: ${error}\n`);
	}
	trace("[m5stackchan/battery] power io captured\n");
}

function pctFromMilliVolts(mv) {
	if (mv <= 0) return 0;
	const v = mv / 1000;
	const vmin = 2.6;
	const vmax = 4.35;
	if (v <= vmin) return 0;
	if (v >= vmax) return 100;
	return Math.round((100 * (v - vmin)) / (vmax - vmin));
}

function enableBatteryGauge(io) {
	const detect = io.readUint8(0x68);
	io.writeUint8(0x68, detect | 0x01);
	const gauge = io.readUint8(0x18);
	io.writeUint8(0x18, gauge | 0x08);
}

export function readBatterySample() {
	if (!powerIO) return null;
	try {
		if (!gaugeEnabled) {
			enableBatteryGauge(powerIO);
			gaugeEnabled = true;
		}
		const hi = powerIO.readUint8(0x34);
		const lo = powerIO.readUint8(0x35);
		const mv = ((hi & 0x1f) << 8) | lo;
		let pct = powerIO.readUint8(0xa4);
		if (pct > 100 || pct <= 0) pct = pctFromMilliVolts(mv);
		const charging = isBatteryChargingStatus(powerIO.readUint8(0x01));
		return {
			pct: Math.min(100, Math.max(0, pct)),
			mv,
			charging,
		};
	} catch (error) {
		trace(`[m5stackchan/battery] read failed: ${error}\n`);
		return null;
	}
}

export function setBacklightVoltage(mv) {
	if (!powerIO) return false;
	const byte = Math.min(30, Math.max(0, Math.round((mv - 500) / 100)));
	try {
		powerIO.writeUint8(0x99, byte);
		return true;
	} catch (error) {
		trace(`[m5stackchan/battery] backlight write failed: ${error}\n`);
		return false;
	}
}

export function getBacklightVoltage() {
	if (!powerIO) return null;
	try {
		return 500 + powerIO.readUint8(0x99) * 100;
	} catch (error) {
		trace(`[m5stackchan/battery] backlight read failed: ${error}\n`);
		return null;
	}
}

export function readPowerOnSource() {
	if (!powerIO) return null;
	try {
		return powerIO.readUint8(REG_POWER_ON_SOURCE);
	} catch (error) {
		trace(`[m5stackchan/battery] power-on source read failed: ${error}\n`);
		return null;
	}
}

export function readPowerKeyState() {
	if (!powerIO) return 0;
	try {
		const state = powerIO.readUint8(0x49) & POWER_KEY_IRQ_MASK;
		if (state) powerIO.writeUint8(0x49, state);
		return state;
	} catch (error) {
		trace(`[m5stackchan/battery] power-key read failed: ${error}\n`);
		return 0;
	}
}

export function requestPowerOff() {
	if (!powerIO) return false;
	try {
		// Match the SDK AXP2101 powerOff sequence: sleep/wakeup policy first,
		// then request software power-off through REG10H[0].
		powerIO.writeUint8(REG_PWROK_SETTING, 0x1b);
		const control = powerIO.readUint8(REG_POWER_OFF_CONTROL);
		powerIO.writeUint8(REG_POWER_OFF_CONTROL, control | 0x01);
		return true;
	} catch (error) {
		trace(`[m5stackchan/battery] power-off request failed: ${error}\n`);
		return false;
	}
}
