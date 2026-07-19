import AXP2101 from "embedded:peripheral/Power/axp2101";
import baseSetup from "m5stack-cores3/setup-target";
import config from "mc/config";
import Timer from "timer";

class BreathPowerButton {
	#value = 0;
	read() {
		return this.#value;
	}
	write(value) {
		if (this.#value === value) return;
		this.#value = value;
		this.onChanged?.();
	}
}

function setupBreathPowerButton() {
	if (!config.breathHostMod) return;
	// The SDK setup also polls getPekState() and clears AXP2101's latched event.
	// Share each non-zero read briefly so neither poller can consume it first.
	const readPekState = globalThis.power.getPekState.bind(globalThis.power);
	let cachedState = 0;
	let clearCacheTimer;
	globalThis.power.getPekState = () => {
		if (cachedState) return cachedState;
		const state = readPekState();
		if (state) {
			cachedState = state;
			if (clearCacheTimer) Timer.clear(clearCacheTimer);
			clearCacheTimer = Timer.set(() => {
				cachedState = 0;
				clearCacheTimer = undefined;
			}, 40);
		}
		return state;
	};
	const button = new BreathPowerButton();
	globalThis.button.power = button;
	Timer.repeat(() => {
		const state = globalThis.power.getPekState();
		if (state) {
			globalThis.breathPowerRawEventCount = (globalThis.breathPowerRawEventCount ?? 0) + 1;
			globalThis.breathPowerRawState = state;
		}
		button.write(state);
		if (state) Timer.set(() => button.write(0), 0);
	}, 10);
	trace("[m5stackchan] raw AXP2101 power button enabled\n");
}

// Mirrors the CoreS3 power-rail setup used by M5Stack/StackChan firmware
// (`firmware/main/hal/board/stackchan.cc` near the AXP2101 init path) and the
// X-Powers AXP2101 register map for DCDC/ALDO/BLDO/LDO and charge-control fields.
function patchStackChanPower() {
	const axp2101 = new AXP2101({
		address: 0x34,
		sensor: { ...device.I2C.internal, io: device.io.SMBus },
	});

	const data = axp2101.readByte(0x90);
	// Enable the LDO rails needed by the CoreS3 StackChan base.
	axp2101.writeByte(0x90, data | 0b10110100);
	// Set DCDC/LDO voltage selector used by the reference firmware.
	axp2101.writeByte(0x97, 0b11110 - 2);
	// Configure VBUS input current limit and power-path behavior.
	axp2101.writeByte(0x69, 0b00110101);
	// Do not let OFFLEVEL cut power before breath can clear the external PY32
	// LED RAM. The earlier long-press IRQ is handled by breath/power, which then
	// performs an orderly software power-off through REG10H[0].
	const powerOff = axp2101.readByte(0x22);
	axp2101.writeByte(0x22, powerOff & ~0x02);
	// Enable required DCDC outputs.
	axp2101.writeByte(0x30, 0b111111);
	// Force the final LDO enable mask after the voltage selectors are set.
	axp2101.writeByte(0x90, 0xbf);
	// Set ALDO/BLDO voltage setpoints.
	axp2101.writeByte(0x94, 33 - 5);
	axp2101.writeByte(0x95, 33 - 5);
	// Disable one unused LDO path to match the reference board profile.
	axp2101.writeByte(0x27, 0x00);

	const charge = axp2101.readByte(0x62);
	// Preserve charge-control upper bits and set the target charge-current field.
	axp2101.writeByte(0x62, (charge & 0xe0) | 13);
	trace("[m5stackchan] patched CoreS3 AXP2101 power rails\n");
}

export default function (done) {
	// The upstream target manifest supplies bflatmajor.maud as startupSound.
	// breath deploys must be silent; override the target default before setup reads config.
	config.startupSound = false;
	baseSetup(() => {
		try {
			patchStackChanPower();
		} catch (error) {
			trace(`[m5stackchan] AXP2101 power patch failed: ${error}\n`);
		}
		setupBreathPowerButton();
		done?.();
	});
}
