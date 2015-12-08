interface InterpScheme {
	degree: int;
	conditions: { knotIndex: int, derivOrder: int, derivValue: number }[];
}

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
}

/**
 * Builds a yield curve by interpolating the log discount factor curve using
 * a b-spline. 
 * 
 * @param instruments  Instrument definitions
 * @param marketRates  Observed rates of these instruments
 * @param interp       Interpolation settings (applied to log-discount factors)
 * 
 * @return A discount functor.
 */
function buildYieldCurve(instruments: Instrument[], marketRates: number[], interp: InterpScheme): Discount {

	const p = interp.degree;

	let ts = [0];
	for (let i = 0; i < instruments.length; i++) {
		ts.push(instruments[i].maturity());
	}
	const spline = new BSpline(ts, p, true);
	const n = instruments.length;
	
	// We solve for weights[], i.e the weights applied to b-spline bases.
	//
	// The constraints are:
	// Constraint [0]          : F(0) == 0 by construction
	// Constraint [1..n]       : corresponds to each instrument
	// Constraint [n+1..n+p-1] : boundary derivative condition, always == 0
	const m = spline.basisCount();
	const weights = numeric.rep([m], 0);
	
	// Creates a Discount functor for use by Instruments.
	const discount = function(t: number, deriv?: number[]): number {
		const c = spline.evaluate(t);
		const F = numeric.dot(c, weights);
		const df = Math.exp(-F);
		if (deriv) {
			deriv.length = 0;
			for (let i = 0; i < c.length; i++)
				deriv[i] = -df * c[i];
		}
		return df;
	}
		
	// Use Newton's method to solve it. For each step, we solve
	// linear equation J*delta=marketRates-impliedRates, where
	//
	//   C:     m-by-m square matrix, where the first n rows are
	//          the Jacobian of instrument rates with respect to
	//          spline weights, and the rest rows are boundary
	//          conditions. 
	//
	//   delta: m-by-1 vector of adjustments to apply to weights.
	//
		
	// We start with all weights equal to zero.
	for (let iter = 1; iter <= 100; ++iter) {

		const C: number[][] = [];
		const b: number[] = [];

		// Constraint 0: F(0) === 0.
		C[0] = spline.evaluate(0);
		b[0] = 0;
		
		// Constraints [1..n]: one for each input instrument.
		const impliedRates = numeric.rep([n], 0);
		for (let i = 0; i < n; i++) {
			const impliedRateDeriv: number[] = [];
			const impliedRate = instruments[i].impliedRate(discount, impliedRateDeriv);
			C[i + 1] = impliedRateDeriv;
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
		b.push(...diff);
		//alert(maxDiff);

		// Remaining constraints: (p-1) conditions on derivatives.
		// We always assume them to be equal to zero.
		const conditions = interp.conditions;
		for (let i = 0; i < conditions.length; i++) {
			const { knotIndex, derivOrder, derivValue = 0} = conditions[i];
			const x = ts[(knotIndex >= 0) ? knotIndex : ts.length + knotIndex];
			const y = derivValue;
			const order = derivOrder;
			C[n + i + 1] = spline.evaluate(x, order);
			b[n + i + 1] = y;
		}
			
		// Solve the equation.
		const delta = numeric.solve(C, b);
		numeric.addeq(weights, delta);
	}
	throw 'Newton method cannot find solution';
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
function fitYieldCurve(model: YieldCurveModel, instruments: Instrument[], marketRates: number[]): void {

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
			return;
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