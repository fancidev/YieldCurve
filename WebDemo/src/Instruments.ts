'use strict';

interface Discount {
	/**
	 * Returns the discount factor for a given time-to-maturity.
	 * @param t         Time-to-maturity, expressed in years.
	 * @param gradient  If supplied, returns the gradient vector of df with
	 *                  respect to an internal vector of state variables.
	 * @returns Discount factor.  
	 */
	(t: number, gradient?: number[]): number;
}

interface Instrument {
	/**
	 * Returns the maturity (in years) of the instrument.
	 */
	maturity(): number;
	
	/**
	 * Computes implied swap rate off the given yield curve.
	 * 
	 * @param discount  A function of the following signature:
	 *                  discount(maturity, out deriv) => value
	 * @param gradient  (output) receives derivative
	 */
	impliedRate(discount: Discount, gradient?: number[]): number;
}

/**
 * Returns the maturity (in years) of an instrument. This is a
 * helper function.
 */
function maturity(instrument: Instrument): number {
	return instrument.maturity();
}

class Fra implements Instrument {

	private _maturity: number;

	/**
	 * Creates a FRA instrument of the given maturity. The FRA rate is
	 * continuously compounded.
	 */
	constructor(maturity: number) {
		this._maturity = maturity;
	}

	maturity(): number {
		return this._maturity;
	}

	impliedRate(discount: Discount, deriv?: number[]): number {
		var T = this._maturity;
		var df = discount(T, deriv);
		var fraRate = -Math.log(df) / T;
		if (deriv) {
			numeric.muleq(deriv, -1 / (T * df));
		}
		return fraRate;
	}
}

class LogDf implements Instrument {

	private _maturity: number;

	constructor(maturity: number) {
		this._maturity = maturity;
	}

	maturity(): number {
		return this._maturity;
	}

	impliedRate(discount: Discount, deriv?: number[]) {
		var T = this._maturity;
		var df = discount(T, deriv);
		if (deriv) {
			numeric.muleq(deriv, -1 / df);
		}
		return -Math.log(df);
	}
}

class InstFwd implements Instrument {

	private _maturity: number;
	private _dt: number;
	private _start: LogDf;
	private _end: LogDf;

	constructor(maturity: number) {
		this._maturity = maturity;
		this._dt = 1 / 128;
		this._start = new LogDf(maturity - this._dt);
		this._end = new LogDf(maturity);
	}

	maturity(): number {
		return this._maturity;
	}

	impliedRate(discount: Discount, gradient?: number[]) {
		var gradient2 = gradient ? new Array<number>() : null;
		var vEnd = this._end.impliedRate(discount, gradient);
		var vStart = this._start.impliedRate(discount, gradient2);
		var dt = this._dt;
		if (gradient) {
			numeric.subeq(gradient, gradient2);
			numeric.muleq(gradient, 1 / dt);
		}
		return (vEnd - vStart) / dt;
	}
}

class Swap implements Instrument {

	private _maturity: number;
	
	/**
	 * Creates an interest rate swap of the given maturity.
	 * The fixed leg is supposed to be quarterly, 30/360.
	 */
	constructor(maturity: number) {
		this._maturity = maturity;
	}

	maturity(): number {
		return this._maturity;
	}

	impliedRate(discount: Discount, deriv?: number[]): number {

		var T = this._maturity;

		var finalDfDeriv = new Array<number>();
		var finalDf = discount(T, finalDfDeriv);

		var annuityFactorDeriv = numeric.rep([finalDfDeriv.length], 0);
		var annuityFactor = 0.0;
		var frequency = 0.25;
		for (var t = T; t > 0; t -= frequency) {
			var dfDeriv = new Array<number>();
			var df = discount(t, dfDeriv);
			var accrualFactor = Math.min(frequency, t);
			annuityFactor += accrualFactor * df;
			numeric.addeq(annuityFactorDeriv, numeric.dot(accrualFactor, dfDeriv));
		}

		var swapRate = (1 - finalDf) / annuityFactor;
		var swapRateDeriv = numeric.dot(-1 / annuityFactor, numeric.add(finalDfDeriv, numeric.dot(swapRate, annuityFactorDeriv)));
		if (deriv) {
			deriv.length = 0;
			for (var i = 0; i < swapRateDeriv.length; i++)
				deriv.push(swapRateDeriv[i]);
		}
		return swapRate;
	}
}

/**
 * Represents a partially-specified instrument, where the only piece
 * of information missing is the maturity. Such a template is useful
 * when plotting a curve of the given type.
 */
interface InstrumentTemplate {
	/**
	 * Gets the name of the instrument.
	 */
	name: string;
		
	/**
	 * Creates an instrument of the given maturity.
	 * @param maturity  Maturity (in years) of the instrument.
	 */
	createInstrument(maturity: number): Instrument;
}

var instrumentTemplates: InstrumentTemplate[] = [
	{ name: 'Swap', createInstrument: (t) => new Swap(t) },
	{ name: 'Zero Coupon', createInstrument: (t) => new Fra(t) },
	{ name: 'Instantaneous Forward', createInstrument: (t) => new InstFwd(t) },
	//{ name: 'Log Discount Factor', create: function (t) { return new LogDf(t);} },
];