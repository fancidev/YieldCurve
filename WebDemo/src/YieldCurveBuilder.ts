'use strict';

interface YieldCurveModel {
	/**
	 * Gets a reference to the internal state vector of the model.
	 * Changing this vector will change the model.
	 */
	state(): number[];
	
	/**
	 * Returns the discount factor for a given time-to-maturity.
	 * @param t         Time-to-maturity, expressed in years.
	 * @param gradient  If supplied, returns the gradient vector of df with
	 *                  respect to the internal state vector.
	 * @returns Discount factor.  
	 */
	discount(t: number, gradient?: number[]): number;
	
	/**
	 * Gets model-dependent linear constraints imposed on the state vector.
	 * This is used by the Newton solver when fitting the model to market
	 * rates. It avoids the need to invert an internal matrix.
	 * 
	 * If this member is defined, it must return a tuple where the first
	 * element is an m-by-n matrix of linear coefficients and the second
	 * element is an m-by-1 vector of right-hand-side values. (n is the
	 * number of state variables.)
	 * 
	 * If this member is not defined, it is assumed to have no particular
	 * linear constraint. 
	 */
	constraints?(): [number[][], number[]];
	
	/**
	 * Returns an HTML segment that describes the attributes of this model.
	 */
	info?(): string;
}

/**
 * Represents a partially-specified yield curve model, where the
 * only missing information is the instruments to fit to. Note
 * that the model may not use all the supplied instruments.
 */
interface YieldCurveModelTemplate {
	/**
	 * Gets the name of the model template.
	 */
	name: string;
	
	/**
	 * Creates a model that is ready to be fitted to market data.
	 * @param instruments  The tentitative instruments to fit to.
	 *                     If the model is not able to fit to all
	 *                     the data exactly, it should delete the
	 *                     instruments that it doesn't want to fit
	 *                     from this array.
	 */
	createModel(instruments: Instrument[]): YieldCurveModel;
}

/**
 * Fits the given yield curve model to observed market rates of a
 * set of instruments. The number of instruments must be equal to
 * the number of internal state variables in the model.
 * 
 * This function uses Newton's method to fit the model. It iterates
 * until the maximum deviation between market and model rates is no
 * more than 0.0001 basis point. If it does not converge within 100
 * iterations, it throw an error.
 * 
 * @param model        The yield curve model to fit
 * @param instruments  Instrument definitions
 * @param marketRates  Observed rates of these instruments
 */
function fitYieldCurve(model: YieldCurveModel, instruments: Instrument[], marketRates: number[]): Discount {

	const n = instruments.length;
	if (n !== marketRates.length) {
		throw new RangeError('instruments and marketRates must have the same length.');
	}

	const m = model.constraints ? model.constraints()[1].length : 0;
	if (n + m !== model.state().length) {
		throw new RangeError("Incorrect number of instruments.");
	}
	
	// Creates a closure of the discount function.
	function discount(t: number, gradient?: number[]): number {
		return model.discount(t, gradient);
	}
	
	// Use Newton's method to fit the model. In each iteration, we
	// solve a linear system C*delta=marketRates-impliedRates, where
	//
	//   C: an (n+m)-by-(n+m) matrix, where the first m rows is the
	//   Jacobian matrix, i.e. J[i][j] is the partial derivative of
	//   the i'th instrument with respect to the j'th state variable;
	//   the rest m rows are model-dependent linear constraints on
	//   the state variables; 
	//
	//   delta: (n+m)-by-1 vector of adjustments to be apply to the
	//   state vector after the iteration.
	//
	for (let iter = 1; iter <= 100; ++iter) {

		// Compute implied rates and Jacobian.
		const C = new Array<Array<number>>(n + m);
		const impliedRates = new Array<number>(n);
		for (let i = 0; i < n; i++) {
			const gradient = new Array<number>(n + m);
			const impliedRate = instruments[i].impliedRate(discount, gradient);
			C[i] = gradient;
			impliedRates[i] = impliedRate;
		}
			
		// Check tolerance.
		const diff = numeric.sub(marketRates, impliedRates);
		const maxDiff = Math.max.apply(null, diff.map(Math.abs));
		const eps = 1.0e-8; // 0.0001 bp
		if (maxDiff < eps) {
			console.log('Newton method found solution in ' + iter + ' iterations.');
			return discount;
		}
		const b = diff;
		
		// Add model-dependent constraints.
		if (m > 0) {
			const [extraConstraints, extraValues] = model.constraints();
			for (let i = 0; i < m; i++) {
				C[n + i] = extraConstraints[i];
				b[n + i] = extraValues[i];
			}
		}
		
		// Solve the equation.
		const delta = numeric.solve(C, b);
		const state = model.state();
		numeric.addeq(state, delta);
	}

	alert('Newton method cannot find solution');
	throw new Error('Newton method cannot find solution');
}