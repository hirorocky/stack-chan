import Touch from "m5stackchan/ft6206-polling";

/**
 * CoreS3 touch wrapper using the polling FT6x06 driver.
 *
 * The SDK target maps FT6x06 to its async driver. On this device that path
 * reports press/release but not continuous coordinates to Piu, so swipe
 * displacement remains zero. The polling driver lets Piu sample every 16 ms.
 * Keep the target's virtual-button compatibility behavior unchanged.
 */
class M5StackChanCoreS3Touch extends Touch {
	#captured;

	sample() {
		const points = super.sample();
		if (globalThis.button && points) {
			if (this.#captured) {
				if (0 === points.length) {
					this.#captured.write(0);
					this.#captured = undefined;
				}
			}
			else if (points.length && points[0].y >= 200) {
				this.#captured = button[String.fromCharCode("a".charCodeAt() + Math.idiv(points[0].x, 107))];
				this.#captured?.write(1);
			}
		}

		return points;
	}
}

export default M5StackChanCoreS3Touch;
