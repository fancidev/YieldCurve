// interface InterpSettings {
// 	degree: number;
// 	conditions?: BSplineConstraint[];
// }

interface InterpScheme {
	degree: int;
	conditions: { knotIndex: int, derivOrder: int, derivValue: number }[];
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
	while (true) {

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
		if (maxDiff < eps)
			break;
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
	return discount;
}