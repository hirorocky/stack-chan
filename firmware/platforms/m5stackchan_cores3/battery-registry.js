// breath MOD addition (hirorocky/breathing): AXP2101 battery readout and DLDO1
// backlight control via the power IO captured in host/provider.js. Not an
// upstream file — registered as the `m5stackchan/battery` module.
let powerIO = null;
let gaugeEnabled = false;

export function registerPowerIO(io) {
	powerIO = io;
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
		const charging = Boolean(powerIO.readUint8(0x01) & 0x40);
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
